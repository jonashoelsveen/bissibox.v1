/**
 * NTNU MazeMap deep-link resolver for Bielsys room imports.
 *
 * NTNU’s own teaching-room wiki links use hyphenated facility identifiers
 * (e.g. `360-CU1-101`, not `360.CU1-101`) with:
 *   `?v=1&campuses=ntnu&sharepoitype=identifier&sharepoi=<id>`
 * We validate those IDs against MazeMap’s POI API and prefer a concrete
 * `sharepoitype=poi` deep link (with floor/center) so the map opens on the
 * room — no search click required.
 */

import {
  lookupGloshaugenFacilityId,
  normalizeFacilityId,
  roomNicknameFromFull,
} from "./mazemapRooms.ts";

export const NTNU_MAZEMAP_BASE =
  "https://use.mazemap.com/?v=1&config=ntnu&campuses=ntnu&campusid=1&zlevel=1&center=10.404042,63.417890&zoom=14.5";

const NTNU_CAMPUS_ID = 1;

export { lookupGloshaugenFacilityId, normalizeFacilityId, roomNicknameFromFull };

export function buildMazemapSearchUrl(fullRoom: string): string {
  const q = fullRoom.trim();
  if (!q) return NTNU_MAZEMAP_BASE;
  return `${NTNU_MAZEMAP_BASE}&search=${encodeURIComponent(q)}`;
}

/**
 * NTNU wiki-style identifier deep link.
 * Example: ?v=1&campuses=ntnu&campusid=1&sharepoitype=identifier&sharepoi=360-CU1-101&showpoidetails=true
 */
export function buildMazemapIdentifierUrl(facilityId: string): string {
  const id = normalizeFacilityId(facilityId);
  const params = new URLSearchParams({
    v: "1",
    config: "ntnu",
    campuses: "ntnu",
    campusid: String(NTNU_CAMPUS_ID),
    sharepoitype: "identifier",
    sharepoi: id,
    showpoidetails: "true",
  });
  return `https://use.mazemap.com/?${params.toString()}`;
}

/** Concrete POI deep link (opens the room marker + details). */
export function buildMazemapPoiUrl(
  poiId: number | string,
  opts?: { lat?: number; lng?: number; zlevel?: number },
): string {
  const params = new URLSearchParams({
    v: "1",
    config: "ntnu",
    campuses: "ntnu",
    campusid: String(NTNU_CAMPUS_ID),
    sharepoitype: "poi",
    sharepoi: String(poiId),
    showpoidetails: "true",
  });
  if (opts?.zlevel != null && Number.isFinite(opts.zlevel)) {
    params.set("zlevel", String(opts.zlevel));
  }
  if (
    opts?.lng != null &&
    opts?.lat != null &&
    Number.isFinite(opts.lng) &&
    Number.isFinite(opts.lat)
  ) {
    params.set("center", `${opts.lng},${opts.lat}`);
    params.set("zoom", "18");
  }
  return `https://use.mazemap.com/?${params.toString()}`;
}

type MazemapPoiHit = {
  poiId?: number;
  id?: number;
  title?: string;
  campusId?: number;
  floorName?: string | number;
  z?: number;
  identifier?: string;
  identifiers?: string[] | string;
  geometry?: { type?: string; coordinates?: unknown };
};

function pickCoords(geometry: MazemapPoiHit["geometry"]): { lng: number; lat: number } | null {
  if (!geometry?.coordinates) return null;
  const c = geometry.coordinates;
  // Point: [lng, lat]
  if (Array.isArray(c) && typeof c[0] === "number" && typeof c[1] === "number") {
    return { lng: c[0], lat: c[1] };
  }
  // Polygon: average first ring, or first vertex
  if (Array.isArray(c) && Array.isArray(c[0]) && Array.isArray(c[0][0])) {
    const ring = c[0] as unknown[];
    let sx = 0;
    let sy = 0;
    let n = 0;
    for (const pt of ring) {
      if (!Array.isArray(pt)) continue;
      if (typeof pt[0] === "number" && typeof pt[1] === "number") {
        sx += pt[0];
        sy += pt[1];
        n++;
      }
    }
    if (n > 0) return { lng: sx / n, lat: sy / n };
  }
  return null;
}

function poiIdOf(hit: MazemapPoiHit): number | null {
  const id = hit.poiId ?? hit.id;
  if (typeof id === "number" && Number.isFinite(id)) return id;
  if (typeof id === "string" && /^\d+$/.test(id)) return Number(id);
  return null;
}

function urlFromPoiHit(hit: MazemapPoiHit, fallbackFacilityId?: string): string {
  const id = poiIdOf(hit);
  if (id != null) {
    const coords = pickCoords(hit.geometry);
    const z =
      typeof hit.z === "number"
        ? hit.z
        : typeof hit.floorName === "number"
          ? hit.floorName
          : undefined;
    return buildMazemapPoiUrl(id, {
      lat: coords?.lat,
      lng: coords?.lng,
      zlevel: z,
    });
  }
  const ident =
    (typeof hit.identifier === "string" && hit.identifier.trim()) ||
    fallbackFacilityId ||
    "";
  if (ident) return buildMazemapIdentifierUrl(ident);
  return NTNU_MAZEMAP_BASE;
}

/** Resolve a facility identifier to a MazeMap POI (validates the ID actually exists). */
async function fetchPoiByIdentifier(facilityId: string): Promise<MazemapPoiHit | null> {
  const id = normalizeFacilityId(facilityId);
  if (!id) return null;
  try {
    const res = await fetch(
      `https://api.mazemap.com/api/pois/?identifier=${encodeURIComponent(id)}&campusid=${NTNU_CAMPUS_ID}&srid=4326`,
      {
        method: "GET",
        headers: { Accept: "application/json" },
        signal: AbortSignal.timeout(4000),
      },
    );
    if (!res.ok) return null;
    const body = (await res.json()) as { pois?: MazemapPoiHit[] };
    const pois = Array.isArray(body.pois) ? body.pois : [];
    return pois[0] ?? null;
  } catch {
    return null;
  }
}

/** Resolve a MazeMap deep link for a full room label. Always returns a URL when query non-empty. */
export async function resolveMazemapUrl(fullRoom: string): Promise<string> {
  const q = fullRoom.trim();
  if (!q) return NTNU_MAZEMAP_BASE;

  const nickname = roomNicknameFromFull(q);
  const facilityId = lookupGloshaugenFacilityId(nickname);

  // 1) Known nickname → validate via MazeMap identifier API → POI deep link.
  if (facilityId) {
    const hit = await fetchPoiByIdentifier(facilityId);
    if (hit) return urlFromPoiHit(hit, facilityId);
    // API miss: still emit NTNU-style identifier URL (matches wiki hrefs).
    return buildMazemapIdentifierUrl(facilityId);
  }

  // 2) Try treating trailing token / full query as an identifier (already hyphenated).
  const tryIds = [
    normalizeFacilityId(nickname),
    normalizeFacilityId(q.replace(/\s+/g, "-")),
  ].filter((id, i, arr) => id && arr.indexOf(id) === i);

  for (const id of tryIds) {
    // Skip obvious non-facility tokens
    if (!/\d/.test(id) || id.length < 3) continue;
    const hit = await fetchPoiByIdentifier(id);
    if (hit) return urlFromPoiHit(hit, id);
  }

  // 3) Last resort: prefilled search (user may still need to pick a result).
  return buildMazemapSearchUrl(q);
}

/** Resolve unique rooms once per import batch. */
export async function resolveMazemapUrlsForRooms(
  fullRooms: string[],
): Promise<Map<string, string>> {
  const unique = [...new Set(fullRooms.map((r) => r.trim()).filter(Boolean))];
  const map = new Map<string, string>();
  await Promise.all(
    unique.map(async (room) => {
      map.set(room, await resolveMazemapUrl(room));
    }),
  );
  return map;
}

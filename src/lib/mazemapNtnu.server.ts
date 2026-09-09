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

export const NTNU_MAZEMAP_BASE =
  "https://use.mazemap.com/?v=1&config=ntnu&campuses=ntnu&campusid=1&zlevel=1&center=10.404042,63.417890&zoom=14.5";

const NTNU_CAMPUS_ID = 1;

/**
 * Gløshaugen teaching-room nickname → MazeMap facility identifier (hyphen form).
 * Source: NTNU undervisningsrom wiki MazeMap hrefs + MazeMap identifier API.
 * Keys are lowercase nicknames.
 */
export const NTNU_GLOSHAUGEN_ROOM_IDENTIFIERS: Record<string, string> = {
  // Realfagbygget
  r1: "360-CU1-101",
  r2: "360-CU1-100",
  r3: "360-DU1-183",
  r4: "360-EU1-109",
  r5: "360-BU1-100",
  r6: "360-BU1-102",
  r7: "360-AU1-105",
  r8: "360-AU1-103",
  r9: "360-AU1-101",
  r22: "360-BU2-153",
  r23: "360-BU2-117",
  "a4-112": "360-A4-112",
  "c4-118": "360-C4-118",
  "d1-185": "360-D1-185",
  // IT-bygget
  f1: "318-152",
  // Sentralbygg 1
  s1: "321-117",
  s2: "321-116",
  s3: "321-113",
  s4: "321-111",
  // Sentralbygg 2
  s5: "322-115",
  s6: "322-146",
  s7: "322-105",
  s8: "322-156",
  s21: "322-255B",
  // Hovedbygningen
  h1: "301-116",
  h2: "301-129",
  h3: "301-340",
  h423: "301-423",
  h426: "301-426",
  "316": "301-316",
  "326": "301-326",
  // Gamle fysikk
  f2: "319-263",
  f3: "319-213",
  f4: "319-215",
  f6: "319-258",
  // Elektro
  el1: "325-G224",
  el2: "325-G212",
  el3: "325-G102",
  el4: "327-B110",
  el5: "325-G160",
  el6: "325-G170",
  // Adolf Øien
  a1: "380-2027A",
  a2: "380-2021",
  a3: "380-1017",
  a31: "380-3078",
  a32: "380-3080",
  a34: "380-3084",
  // Tapir / Høgskoleringen 3 labs (from MazeMap titles)
  bober: "358-314",
  rall: "358-421",
  rill: "358-411",
};

/** Wiki display codes use dots; MazeMap identifiers use hyphens. */
export function normalizeFacilityId(raw: string): string {
  let id = raw.trim();
  if (!id) return "";
  // 360BU2-117 → 360-BU2-117 (missing separator after building number)
  id = id.replace(/^(\d{3})([A-Za-z])/, "$1-$2");
  // 360.CU1.101 / 360.CU1-101 → 360-CU1-101
  id = id.replace(/\./g, "-");
  return id;
}

/** Extract a short room nickname from a full label like "Realfagbygget R1". */
export function roomNicknameFromFull(fullRoom: string): string {
  const q = fullRoom.trim();
  if (!q) return "";

  // Prefer the longest known nickname that appears as a whole token.
  const keys = Object.keys(NTNU_GLOSHAUGEN_ROOM_IDENTIFIERS).sort(
    (a, b) => b.length - a.length,
  );
  const lower = q.toLowerCase();
  for (const key of keys) {
    const re = new RegExp(`(?:^|\\s)${escapeRegExp(key)}(?:\\s|$)`, "i");
    if (re.test(lower)) return key;
  }

  // Trailing compact code: R1, F1, S3, H3, 316, A4-112, EL1…
  const code = q.match(/\b([A-Za-z]{1,4}\d{1,3}(?:-\d{1,4})?|\d{2,4})\s*$/);
  if (code) return code[1];

  const tokens = q.split(/\s+/).filter(Boolean);
  return tokens[tokens.length - 1] ?? q;
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function lookupGloshaugenFacilityId(nickname: string): string | null {
  const key = nickname.trim().toLowerCase();
  if (!key) return null;
  const raw = NTNU_GLOSHAUGEN_ROOM_IDENTIFIERS[key];
  return raw ? normalizeFacilityId(raw) : null;
}

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

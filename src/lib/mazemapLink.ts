/**
 * Make a MazeMap link open the room named on the session.
 *
 * A destination (`dest`) without a type, or a display name used as the
 * destination, makes MazeMap report that the destination could not be found.
 * A numeric POI or a coordinate point is already precise and is left as-is.
 * A known room name becomes that room's facility identifier. Anything else
 * is opened as a search for the session's location name.
 */

import { isMazemapHost } from "./calendarFeed/mapHosts.ts";
import {
  lookupGloshaugenFacilityId,
  normalizeFacilityId,
  roomNicknameFromFull,
} from "./mazemapRooms.ts";

const NTNU_CAMPUS_IDS = new Set([1, 3, 18, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29]);

function mergedParams(url: URL): URLSearchParams {
  const params = new URLSearchParams(url.search);
  const hash = url.hash.replace(/^#/, "");
  const hashQuery = hash.startsWith("?") ? hash.slice(1) : hash;
  if (!hashQuery.includes("=")) return params;
  const hashParams = new URLSearchParams(hashQuery);
  for (const [key, value] of hashParams) {
    if (!params.has(key)) params.set(key, value);
  }
  return params;
}

function isNumericPoi(type: string, value: string): boolean {
  return type === "poi" && /^\d+$/.test(value.trim());
}

function isPoint(type: string, value: string): boolean {
  if (type !== "point" && type !== "pointinside") return false;
  return /^-?\d+(?:\.\d+)?,-?\d+(?:\.\d+)?(?:,-?\d+)?$/.test(value.trim());
}

function looksLikeFacilityId(id: string): boolean {
  return /^\d{2,4}-[A-Za-z0-9]+(?:-[A-Za-z0-9]+)*$/.test(id);
}

function ntnuContext(params: URLSearchParams): boolean {
  const campuses = (params.get("campuses") ?? "").toLowerCase();
  const config = (params.get("config") ?? "").toLowerCase();
  if (campuses === "ntnu" || config === "ntnu") return true;
  return NTNU_CAMPUS_IDS.has(Number(params.get("campusid")));
}

function placeName(label: string | null | undefined): string {
  const name = (label ?? "").trim();
  if (!name || name.toLowerCase() === "mazemap") return "";
  return name;
}

function identifierUrl(id: string, campusid: string, campuses: string, ntnu: boolean): string {
  const params = new URLSearchParams();
  params.set("v", "1");
  if (ntnu) params.set("config", "ntnu");
  if (campuses) params.set("campuses", campuses);
  if (campusid) params.set("campusid", campusid);
  params.set("sharepoitype", "identifier");
  params.set("sharepoi", id);
  params.set("showpoidetails", "true");
  return `https://use.mazemap.com/?${params.toString()}`;
}

function searchUrl(query: string, campusid: string, campuses: string, ntnu: boolean): string {
  const params = new URLSearchParams();
  params.set("v", "1");
  if (ntnu) params.set("config", "ntnu");
  if (campuses) params.set("campuses", campuses);
  if (campusid) params.set("campusid", campusid);
  params.set("search", query);
  return `https://use.mazemap.com/?${params.toString()}`;
}

export function refineMazemapHref(rawUrl: string, label?: string | null): string {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return rawUrl;
  }
  if (!isMazemapHost(url.hostname)) return rawUrl;

  const params = mergedParams(url);
  const shareType = (params.get("sharepoitype") ?? "").toLowerCase();
  const share = (params.get("sharepoi") ?? "").trim();
  const destType = (params.get("desttype") ?? "").toLowerCase();
  const dest = (params.get("dest") ?? "").trim();

  if (isNumericPoi(shareType, share) || isNumericPoi(destType, dest)) return rawUrl;
  if (isPoint(shareType, share) || isPoint(destType, dest)) return rawUrl;
  if (!share && !dest && params.get("search")) return rawUrl;
  if (!share && !dest) return rawUrl;

  const ntnu = ntnuContext(params);
  const campusid = params.get("campusid") ?? "";
  const campuses = params.get("campuses") ?? (ntnu ? "ntnu" : "");
  const name = placeName(label);

  const candidateId =
    shareType === "identifier" || (!shareType && share)
      ? share
      : destType === "identifier" || (!destType && dest)
        ? dest
        : "";
  const normalized = normalizeFacilityId(candidateId);
  if (looksLikeFacilityId(normalized)) {
    return identifierUrl(normalized, campusid, campuses || (ntnu ? "ntnu" : ""), ntnu);
  }

  const gloshaugenOk = !campusid || campusid === "1";
  if (gloshaugenOk && (ntnu || !campusid)) {
    for (const hint of [name, dest, share]) {
      if (!hint || looksLikeFacilityId(normalizeFacilityId(hint))) continue;
      const fromName = lookupGloshaugenFacilityId(roomNicknameFromFull(hint));
      if (fromName) return identifierUrl(fromName, campusid || "1", campuses || "ntnu", true);
    }
  }

  const query = name || dest || share;
  if (!query) return rawUrl;
  return searchUrl(query, campusid, campuses, ntnu);
}

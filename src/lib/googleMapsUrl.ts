import { isMazemapHttpUrl } from "./calendarFeed/mapHosts.ts";
import { refineMazemapHref } from "./mazemapLink.ts";

/** Google Maps search / pin URLs for calendar locations. */

const COORD_QUERY = /^\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*$/;

function finiteCoord(lat: number | null | undefined, lng: number | null | undefined): {
  lat: number;
  lng: number;
} | null {
  if (
    typeof lat !== "number" ||
    typeof lng !== "number" ||
    !Number.isFinite(lat) ||
    !Number.isFinite(lng)
  ) {
    return null;
  }
  return { lat, lng };
}

export function parseLatLngFromMapsUrl(url: string | null | undefined): {
  lat: number;
  lng: number;
} | null {
  if (!url) return null;
  try {
    const u = new URL(url);
    const at = u.pathname.match(/@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)(?:,[\d.]+z?)?/);
    if (at) {
      const lat = Number(at[1]);
      const lng = Number(at[2]);
      if (Number.isFinite(lat) && Number.isFinite(lng)) return { lat, lng };
    }
    const ll = u.searchParams.get("ll");
    if (ll) {
      const m = ll.match(COORD_QUERY);
      if (m) {
        const lat = Number(m[1]);
        const lng = Number(m[2]);
        if (Number.isFinite(lat) && Number.isFinite(lng)) return { lat, lng };
      }
    }
    const q = u.searchParams.get("query") ?? u.searchParams.get("q");
    if (q) {
      const m = q.match(COORD_QUERY);
      if (m) {
        const lat = Number(m[1]);
        const lng = Number(m[2]);
        if (Number.isFinite(lat) && Number.isFinite(lng)) return { lat, lng };
      }
    }
  } catch {
    return null;
  }
  return null;
}

/**
 * Search URL whose left panel matches typing the place into Google Maps.
 * Coordinates are stored as `ll` so we can restore the pin; they are not the
 * search query (that shows as raw lat/lng in Maps).
 */
export function googleMapsSearchUrl(opts: {
  query?: string | null;
  lat?: number | null;
  lng?: number | null;
}): string {
  const url = new URL("https://www.google.com/maps/search/");
  url.searchParams.set("api", "1");
  const name = (opts.query ?? "").trim();
  const coords = finiteCoord(opts.lat ?? null, opts.lng ?? null);
  const nameIsCoords = name.length > 0 && COORD_QUERY.test(name);

  if (name && !nameIsCoords) {
    url.searchParams.set("query", name);
  } else if (coords) {
    url.searchParams.set("query", `${coords.lat},${coords.lng}`);
  } else if (name) {
    url.searchParams.set("query", name);
  } else {
    return "https://www.google.com/maps";
  }

  if (coords && name && !nameIsCoords) {
    url.searchParams.set("ll", `${coords.lat},${coords.lng}`);
  }
  return url.toString();
}

/** Click target for a saved session location (works for older coord-only URLs). */
export function googleMapsHrefForLocation(
  name: string | null | undefined,
  storedUrl: string | null | undefined,
): string {
  const stored = (storedUrl ?? "").trim();
  const query = (name ?? "").trim();
  if (!stored) return "";
  if (isMazemapHttpUrl(stored)) return refineMazemapHref(stored, query);
  const coords = parseLatLngFromMapsUrl(stored);
  if (query) {
    return googleMapsSearchUrl({
      query,
      lat: coords?.lat,
      lng: coords?.lng,
    });
  }
  return stored;
}

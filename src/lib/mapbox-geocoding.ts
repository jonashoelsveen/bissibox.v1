/**
 * Mapbox Search Box API helpers for event location search.
 *
 * Interactive typeahead uses /suggest + /retrieve (POI/venue-capable).
 * One-shot confirmation and reverse use /forward and /reverse.
 * Proximity biases local venues over distant cities.
 */

import { getCachedMapboxToken, loadMapboxToken } from "@/lib/mapbox";

const SEARCHBOX_BASE = "https://api.mapbox.com/search/searchbox/v1";
/** Prefer venues and street addresses over coarse places/regions. */
const SEARCH_TYPES = "poi,address";

export type MapboxSuggestResult = {
  id: string;
  placeName: string;
  /** Secondary line (city / region context). */
  secondaryText: string | null;
  placeTypes: string[];
};

export type MapboxGeocodeResult = {
  id: string;
  placeName: string;
  lng: number;
  lat: number;
  placeTypes: string[];
};

export type MapboxReverseResult = {
  placeName: string;
  id: string | null;
};

export type MapboxProximity = {
  lng: number;
  lat: number;
};

async function ensureToken(): Promise<string> {
  const cached = getCachedMapboxToken();
  if (cached) return cached;
  return loadMapboxToken();
}

/** Stable session token for suggest→retrieve billing grouping. */
export function createSearchSessionToken(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `sb-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function proximityParam(proximity?: MapboxProximity | "ip" | null): string {
  if (!proximity) return "ip";
  if (proximity === "ip") return "ip";
  if (Number.isFinite(proximity.lng) && Number.isFinite(proximity.lat)) {
    return `${proximity.lng},${proximity.lat}`;
  }
  return "ip";
}

function formatSuggestLines(s: {
  name?: string;
  full_address?: string;
  place_formatted?: string;
  address?: string;
}): { title: string; subtitle: string | null } {
  const name = s.name?.trim() ?? "";
  const street = s.address?.trim() ?? "";
  const place = s.place_formatted?.trim() ?? "";
  const full = s.full_address?.trim() ?? "";

  // Build an address line for the secondary row.
  let addressLine =
    full ||
    [street, place].filter(Boolean).join(", ") ||
    place ||
    street ||
    "";

  if (name) {
    // Strip leading venue name from full_address so subtitle is only the address.
    if (addressLine.toLowerCase().startsWith(name.toLowerCase())) {
      addressLine = addressLine.slice(name.length).replace(/^,\s*/, "").trim();
    }
    if (addressLine.toLowerCase() === name.toLowerCase()) {
      addressLine = "";
    }
    return {
      title: name,
      subtitle: addressLine || null,
    };
  }

  // Pure address result — single primary line, no redundant subtitle.
  return {
    title: addressLine || "Unknown place",
    subtitle: null,
  };
}

/** Single-line label for draft / map / ticket (prefer venue name over full address). */
function formatSuggestName(s: {
  name?: string;
  full_address?: string;
  place_formatted?: string;
  address?: string;
}): string {
  return formatSuggestLines(s).title;
}

/**
 * Interactive autocomplete — Search Box /suggest.
 * Results do not include coordinates; call retrieveSuggestion after selection.
 */
export async function suggestPlaces(
  query: string,
  opts: {
    sessionToken: string;
    proximity?: MapboxProximity | "ip" | null;
    signal?: AbortSignal;
    limit?: number;
  },
): Promise<MapboxSuggestResult[]> {
  const q = query.trim();
  if (q.length < 2) return [];
  if (!opts.sessionToken) return [];

  const token = await ensureToken();
  if (!token) return [];

  const limit = opts.limit ?? 8;
  const url =
    `${SEARCHBOX_BASE}/suggest` +
    `?q=${encodeURIComponent(q)}` +
    `&access_token=${encodeURIComponent(token)}` +
    `&session_token=${encodeURIComponent(opts.sessionToken)}` +
    `&types=${encodeURIComponent(SEARCH_TYPES)}` +
    `&proximity=${encodeURIComponent(proximityParam(opts.proximity))}` +
    `&limit=${limit}` +
    `&language=en`;

  try {
    const res = await fetch(url, { signal: opts.signal });
    if (!res.ok) return [];
    const data = (await res.json()) as {
      suggestions?: Array<{
        mapbox_id?: string;
        name?: string;
        full_address?: string;
        place_formatted?: string;
        address?: string;
        feature_type?: string;
        poi_category?: string[];
      }>;
    };
    if (!Array.isArray(data.suggestions)) return [];

    return data.suggestions
      .map((s): MapboxSuggestResult | null => {
        if (!s.mapbox_id) return null;
        const { title, subtitle } = formatSuggestLines(s);
        const types: string[] = [];
        if (s.feature_type) types.push(s.feature_type);
        if (Array.isArray(s.poi_category)) types.push(...s.poi_category);
        return {
          id: s.mapbox_id,
          placeName: title,
          secondaryText: subtitle,
          placeTypes: types,
        };
      })
      .filter((r): r is MapboxSuggestResult => !!r);
  } catch (err) {
    if ((err as { name?: string })?.name === "AbortError") throw err;
    return [];
  }
}

/** Resolve a /suggest hit to coordinates via /retrieve. */
export async function retrieveSuggestion(
  mapboxId: string,
  opts: { sessionToken: string; signal?: AbortSignal },
): Promise<MapboxGeocodeResult | null> {
  if (!mapboxId || !opts.sessionToken) return null;

  const token = await ensureToken();
  if (!token) return null;

  const url =
    `${SEARCHBOX_BASE}/retrieve/${encodeURIComponent(mapboxId)}` +
    `?access_token=${encodeURIComponent(token)}` +
    `&session_token=${encodeURIComponent(opts.sessionToken)}` +
    `&language=en`;

  try {
    const res = await fetch(url, { signal: opts.signal });
    if (!res.ok) return null;
    const data = (await res.json()) as {
      features?: Array<{
        geometry?: { coordinates?: [number, number] };
        properties?: {
          mapbox_id?: string;
          name?: string;
          full_address?: string;
          place_formatted?: string;
          address?: string;
          feature_type?: string;
          poi_category?: string[];
        };
      }>;
    };
    const feature = Array.isArray(data.features) ? data.features[0] : null;
    if (!feature) return null;
    const coords = feature.geometry?.coordinates;
    if (!coords || coords.length < 2) return null;
    const [lng, lat] = coords;
    if (!Number.isFinite(lng) || !Number.isFinite(lat)) return null;
    const props = feature.properties ?? {};
    const placeName = formatSuggestName(props);
    const types: string[] = [];
    if (props.feature_type) types.push(props.feature_type);
    if (Array.isArray(props.poi_category)) types.push(...props.poi_category);
    return {
      id: props.mapbox_id || mapboxId,
      placeName,
      lng,
      lat,
      placeTypes: types,
    };
  } catch (err) {
    if ((err as { name?: string })?.name === "AbortError") throw err;
    return null;
  }
}

/**
 * One-shot forward search (Set location without a pending pick).
 * Uses Search Box /forward with auto_complete for fuzzy/partial matches.
 */
export async function forwardGeocode(
  query: string,
  opts?: {
    signal?: AbortSignal;
    limit?: number;
    proximity?: MapboxProximity | "ip" | null;
  },
): Promise<MapboxGeocodeResult[]> {
  const q = query.trim();
  if (q.length < 2) return [];

  const token = await ensureToken();
  if (!token) return [];

  const limit = opts?.limit ?? 8;
  const url =
    `${SEARCHBOX_BASE}/forward` +
    `?q=${encodeURIComponent(q)}` +
    `&access_token=${encodeURIComponent(token)}` +
    `&types=${encodeURIComponent(SEARCH_TYPES)}` +
    `&proximity=${encodeURIComponent(proximityParam(opts?.proximity))}` +
    `&auto_complete=true` +
    `&limit=${limit}` +
    `&language=en`;

  try {
    const res = await fetch(url, { signal: opts?.signal });
    if (!res.ok) return [];
    const data = (await res.json()) as {
      features?: Array<{
        geometry?: { coordinates?: [number, number] };
        properties?: {
          mapbox_id?: string;
          name?: string;
          full_address?: string;
          place_formatted?: string;
          address?: string;
          feature_type?: string;
          poi_category?: string[];
        };
      }>;
    };
    if (!Array.isArray(data.features)) return [];

    return data.features
      .map((f): MapboxGeocodeResult | null => {
        const coords = f.geometry?.coordinates;
        if (!coords || coords.length < 2) return null;
        const [lng, lat] = coords;
        if (!Number.isFinite(lng) || !Number.isFinite(lat)) return null;
        const props = f.properties ?? {};
        const placeName = formatSuggestName(props);
        const types: string[] = [];
        if (props.feature_type) types.push(props.feature_type);
        if (Array.isArray(props.poi_category)) types.push(...props.poi_category);
        return {
          id: props.mapbox_id || `${lng},${lat}`,
          placeName,
          lng,
          lat,
          placeTypes: types,
        };
      })
      .filter((r): r is MapboxGeocodeResult => !!r);
  } catch (err) {
    if ((err as { name?: string })?.name === "AbortError") throw err;
    return [];
  }
}

/** Reverse lookup — Search Box /reverse. */
export async function reverseGeocode(
  lng: number,
  lat: number,
  opts?: { signal?: AbortSignal },
): Promise<MapboxReverseResult | null> {
  if (!Number.isFinite(lng) || !Number.isFinite(lat)) return null;

  const token = await ensureToken();
  if (!token) return null;

  const url =
    `${SEARCHBOX_BASE}/reverse` +
    `?longitude=${lng}&latitude=${lat}` +
    `&access_token=${encodeURIComponent(token)}` +
    `&types=${encodeURIComponent(SEARCH_TYPES)}` +
    `&limit=1` +
    `&language=en`;

  try {
    const res = await fetch(url, { signal: opts?.signal });
    if (!res.ok) return null;
    const data = (await res.json()) as {
      features?: Array<{
        properties?: {
          mapbox_id?: string;
          name?: string;
          full_address?: string;
          place_formatted?: string;
          address?: string;
        };
      }>;
    };
    const first = Array.isArray(data.features) ? data.features[0] : null;
    if (!first?.properties) return null;
    return {
      placeName: formatSuggestName(first.properties),
      id: first.properties.mapbox_id ?? null,
    };
  } catch (err) {
    if ((err as { name?: string })?.name === "AbortError") throw err;
    return null;
  }
}

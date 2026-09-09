/**
 * Compact Mapbox location picker for Event About:
 * address autocomplete + streets map + draggable / clickable pin.
 */

import { useEffect, useId, useRef, useState } from "react";
import type { Map as MapboxMap, Marker } from "mapbox-gl";
import { Check, Loader2, MapPin, Search, X } from "lucide-react";
import {
  getCachedMapboxToken,
  loadMapboxToken,
  observeVisibleMapContainer,
  useMapbox,
} from "@/lib/mapbox";
import {
  createSearchSessionToken,
  forwardGeocode,
  retrieveSuggestion,
  reverseGeocode,
  suggestPlaces,
  type MapboxProximity,
  type MapboxSuggestResult,
} from "@/lib/mapbox-geocoding";
import { cn } from "@/lib/utils";
import type { EventLocationDraft } from "./event-ui-types";

const STREET_STYLE = "mapbox://styles/mapbox/streets-v12";
const DEFAULT_CENTER: [number, number] = [10.7522, 59.9139]; // Oslo
const PIN_COLOR = "#dc2626";

type SelectedLocation = {
  lng: number;
  lat: number;
  address: string;
  mapboxId: string | null;
};

type Props = {
  value: EventLocationDraft;
  onChange: (location: EventLocationDraft) => void;
};

function hasCoords(value: EventLocationDraft): boolean {
  return (
    typeof value.longitude === "number" &&
    typeof value.latitude === "number" &&
    Number.isFinite(value.longitude) &&
    Number.isFinite(value.latitude)
  );
}

function toSelected(value: EventLocationDraft): SelectedLocation | null {
  if (!hasCoords(value)) return null;
  return {
    lng: value.longitude!,
    lat: value.latitude!,
    address: value.name,
    mapboxId: value.mapboxPlaceId,
  };
}

function pinElement(): HTMLDivElement {
  const el = document.createElement("div");
  el.style.width = "28px";
  el.style.height = "32px";
  el.innerHTML = `<svg viewBox='0 0 24 32' width='28' height='32' xmlns='http://www.w3.org/2000/svg'><path d='M12 0C5.4 0 0 5.4 0 12c0 9 12 20 12 20s12-11 12-20C24 5.4 18.6 0 12 0z' fill='${PIN_COLOR}' stroke='white' stroke-width='1.5'/><circle cx='12' cy='12' r='4' fill='white'/></svg>`;
  return el;
}

/** Prefer map center, then browser geolocation, then Mapbox IP proximity. */
function resolveProximity(
  map: MapboxMap | null,
  userLoc: MapboxProximity | null,
): MapboxProximity | "ip" {
  if (map) {
    try {
      const c = map.getCenter();
      if (Number.isFinite(c.lng) && Number.isFinite(c.lat)) {
        return { lng: c.lng, lat: c.lat };
      }
    } catch {
      /* ignore */
    }
  }
  if (userLoc) return userLoc;
  return "ip";
}

export function EventLocationPicker({ value, onChange }: Props) {
  const mapbox = useMapbox();
  const containerId = useId().replace(/:/g, "-");
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapboxMap | null>(null);
  const markerRef = useRef<Marker | null>(null);
  const onChangeRef = useRef(onChange);
  const valueRef = useRef(value);
  const mapboxRef = useRef(mapbox);
  const reverseAbortRef = useRef<AbortController | null>(null);
  const searchAbortRef = useRef<AbortController | null>(null);
  const skipNextSearchRef = useRef(false);
  const sessionTokenRef = useRef(createSearchSessionToken());
  const userProximityRef = useRef<MapboxProximity | null>(null);
  const applyCoordsRef = useRef<(lng: number, lat: number) => Promise<void>>(
    async () => {},
  );
  const placeMarkerRef = useRef<
    (lng: number, lat: number, mapboxMod: typeof import("mapbox-gl")) => void
  >(() => {});

  const [inputText, setInputText] = useState(value.name);
  const [suggestions, setSuggestions] = useState<MapboxSuggestResult[]>([]);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchFocused, setSearchFocused] = useState(false);
  const [searchLoading, setSearchLoading] = useState(false);
  const [geocodeBusy, setGeocodeBusy] = useState(false);
  const [mapError, setMapError] = useState<string | null>(null);
  const [settingLocation, setSettingLocation] = useState(false);
  /** Confirmed via "Set location" — light green + check until cleared. */
  const [locationConfirmed, setLocationConfirmed] = useState(
    () => hasCoords(value) && value.name.trim().length > 0,
  );
  /** Preview pin / pick — not written to draft until Set location. */
  const [pending, setPending] = useState<SelectedLocation | null>(null);
  const pendingRef = useRef<SelectedLocation | null>(null);

  useEffect(() => {
    if (typeof navigator === "undefined" || !navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        userProximityRef.current = {
          lng: pos.coords.longitude,
          lat: pos.coords.latitude,
        };
      },
      () => {
        /* fall back to map center / IP */
      },
      { enableHighAccuracy: false, maximumAge: 300_000, timeout: 8_000 },
    );
  }, []);

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);
  useEffect(() => {
    valueRef.current = value;
  }, [value]);
  useEffect(() => {
    mapboxRef.current = mapbox;
  }, [mapbox]);
  useEffect(() => {
    pendingRef.current = pending;
  }, [pending]);

  // Sync search field from committed draft only (not while editing a new search).
  useEffect(() => {
    if (pending) return;
    setInputText(value.name);
  }, [value.name, pending]);

  const commitLocation = (next: SelectedLocation) => {
    const prev = valueRef.current;
    onChangeRef.current({
      ...prev,
      name: next.address,
      longitude: next.lng,
      latitude: next.lat,
      mapboxPlaceId: next.mapboxId,
    });
  };

  const previewOnMap = (next: SelectedLocation) => {
    const map = mapRef.current;
    if (map) {
      map.flyTo({ center: [next.lng, next.lat], zoom: 14, duration: 800 });
      requestAnimationFrame(() => {
        try {
          map.resize();
        } catch {
          /* ignore */
        }
      });
    }
    const mod = mapboxRef.current;
    if (mod) placeMarkerRef.current(next.lng, next.lat, mod);
  };

  placeMarkerRef.current = (lng, lat, mapboxMod) => {
    const map = mapRef.current;
    if (!map) return;
    if (markerRef.current) {
      markerRef.current.setLngLat([lng, lat]);
      return;
    }
    const m = new mapboxMod.default.Marker({
      element: pinElement(),
      draggable: true,
      anchor: "bottom",
    })
      .setLngLat([lng, lat])
      .addTo(map);

    m.on("dragend", () => {
      const ll = m.getLngLat();
      void applyCoordsRef.current(ll.lng, ll.lat);
    });
    markerRef.current = m;
  };

  /** Map click / drag — preview only; draft updates on Set location. */
  applyCoordsRef.current = async (lng, lat) => {
    setGeocodeBusy(true);
    setLocationConfirmed(false);
    reverseAbortRef.current?.abort();
    const ctrl = new AbortController();
    reverseAbortRef.current = ctrl;
    try {
      const reversed = await reverseGeocode(lng, lat, { signal: ctrl.signal });
      const address =
        reversed?.placeName ?? `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
      const mapboxId = reversed?.id ?? null;
      skipNextSearchRef.current = true;
      const next = { lng, lat, address, mapboxId };
      setInputText(address);
      setSuggestions([]);
      setSearchOpen(false);
      setPending(next);
      const mod = mapboxRef.current;
      if (mod && mapRef.current) {
        placeMarkerRef.current(lng, lat, mod);
      }
    } catch (err) {
      if ((err as { name?: string })?.name === "AbortError") return;
      skipNextSearchRef.current = true;
      const address = `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
      const next = { lng, lat, address, mapboxId: null };
      setInputText(address);
      setPending(next);
    } finally {
      setGeocodeBusy(false);
    }
  };

  /** Suggestion pick — retrieve coords, preview on map; draft waits for Set location. */
  const selectSuggestion = async (s: MapboxSuggestResult) => {
    skipNextSearchRef.current = true;
    setLocationConfirmed(false);
    setSearchLoading(true);
    setSuggestions([]);
    setSearchOpen(false);
    setInputText(s.placeName);
    try {
      const retrieved = await retrieveSuggestion(s.id, {
        sessionToken: sessionTokenRef.current,
      });
      // New session after a successful retrieve (Mapbox billing session).
      sessionTokenRef.current = createSearchSessionToken();
      if (!retrieved) return;
      const next: SelectedLocation = {
        lng: retrieved.lng,
        lat: retrieved.lat,
        address: retrieved.placeName,
        mapboxId: retrieved.id,
      };
      skipNextSearchRef.current = true;
      setInputText(retrieved.placeName);
      setPending(next);
      previewOnMap(next);
    } finally {
      setSearchLoading(false);
    }
  };

  const setLocationFromQuery = async () => {
    if (settingLocation || locationConfirmed) return;
    setSettingLocation(true);
    setSearchOpen(false);
    try {
      let next = pendingRef.current;
      const proximity = resolveProximity(
        mapRef.current,
        userProximityRef.current,
      );

      if (!next) {
        const q = inputText.trim();
        if (q.length < 2) return;

        // Prefer a POI suggestion already on screen, then retrieve it.
        const fromList =
          suggestions.find((s) => s.placeTypes.includes("poi")) ??
          suggestions[0];
        if (fromList) {
          const retrieved = await retrieveSuggestion(fromList.id, {
            sessionToken: sessionTokenRef.current,
          });
          sessionTokenRef.current = createSearchSessionToken();
          if (!retrieved) {
            setSuggestions([]);
            setSearchOpen(true);
            return;
          }
          next = {
            lng: retrieved.lng,
            lat: retrieved.lat,
            address: retrieved.placeName,
            mapboxId: retrieved.id,
          };
        } else {
          await loadMapboxToken();
          const results = await forwardGeocode(q, {
            limit: 8,
            proximity,
          });
          if (!results[0]) {
            setSuggestions([]);
            setSearchOpen(true);
            return;
          }
          next = {
            lng: results[0].lng,
            lat: results[0].lat,
            address: results[0].placeName,
            mapboxId: results[0].id,
          };
        }
      }

      skipNextSearchRef.current = true;
      setInputText(next.address);
      setPending(null);
      commitLocation(next);
      previewOnMap(next);
      setLocationConfirmed(true);
    } finally {
      setSettingLocation(false);
    }
  };

  // Search Box /suggest — only while the search field is focused.
  useEffect(() => {
    if (skipNextSearchRef.current) {
      skipNextSearchRef.current = false;
      return;
    }
    if (!searchFocused) {
      setSearchOpen(false);
      setSearchLoading(false);
      return;
    }
    const q = inputText.trim();
    if (q.length < 2) {
      setSuggestions([]);
      setSearchLoading(false);
      setSearchOpen(false);
      return;
    }
    setSearchLoading(true);
    const t = window.setTimeout(async () => {
      searchAbortRef.current?.abort();
      const ctrl = new AbortController();
      searchAbortRef.current = ctrl;
      try {
        await loadMapboxToken();
        const proximity = resolveProximity(
          mapRef.current,
          userProximityRef.current,
        );
        const results = await suggestPlaces(q, {
          signal: ctrl.signal,
          limit: 8,
          sessionToken: sessionTokenRef.current,
          proximity,
        });
        setSuggestions(results);
        setSearchOpen(true);
      } catch (err) {
        if ((err as { name?: string })?.name !== "AbortError") {
          setSuggestions([]);
        }
      } finally {
        setSearchLoading(false);
      }
    }, 300);
    return () => window.clearTimeout(t);
  }, [inputText, searchFocused]);

  // Init map once Mapbox module is ready.
  // Create synchronously (like SimplePinMap) — useMapbox already loaded the token.
  // An await before Map() races React Strict Mode cleanup and leaves a dead canvas.
  useEffect(() => {
    if (!mapbox || !containerRef.current || mapRef.current) return;
    const container = containerRef.current;
    let map: MapboxMap | null = null;
    let cancelled = false;
    let rafId = 0;
    let delayedResizeId = 0;
    let ro: ResizeObserver | null = null;

    const stopWatching = observeVisibleMapContainer(
      container,
      "EventLocationPicker",
      () => {
        if (cancelled || mapRef.current || map) return;

        const token = getCachedMapboxToken();
        if (token) {
          mapbox.default.accessToken = token;
        } else if (!mapbox.default.accessToken) {
          setMapError("Mapbox token unavailable");
          return;
        }

        const initial = toSelected(valueRef.current);
        const center: [number, number] = initial
          ? [initial.lng, initial.lat]
          : DEFAULT_CENTER;
        const zoom = initial ? 14 : 5;

        try {
          map = new mapbox.default.Map({
            container,
            style: STREET_STYLE,
            center,
            zoom,
            attributionControl: false,
          });
        } catch (err) {
          console.error("[mapbox] EventLocationPicker constructor threw:", err);
          setMapError("Could not load map");
          return;
        }

        if (cancelled) {
          map.remove();
          map = null;
          return;
        }

        map.addControl(
          new mapbox.default.NavigationControl({ showCompass: false }),
          "bottom-right",
        );
        map.addControl(
          new mapbox.default.AttributionControl({ compact: true }),
        );
        map.on("error", (e) => {
          console.error(
            "[mapbox] EventLocationPicker runtime error:",
            (e as { error?: unknown })?.error ?? e,
          );
        });
        map.on("load", () => {
          try {
            map?.resize();
          } catch {
            /* ignore */
          }
        });
        map.on("click", (e) => {
          void applyCoordsRef.current(e.lngLat.lng, e.lngLat.lat);
        });

        rafId = requestAnimationFrame(() => {
          try {
            map?.resize();
          } catch {
            /* ignore */
          }
        });
        delayedResizeId = window.setTimeout(() => {
          try {
            map?.resize();
          } catch {
            /* ignore */
          }
        }, 100);
        ro = new ResizeObserver(() => {
          try {
            map?.resize();
          } catch {
            /* ignore */
          }
        });
        ro.observe(container);
        mapRef.current = map;
        setMapError(null);

        if (initial) {
          placeMarkerRef.current(initial.lng, initial.lat, mapbox);
        }
      },
    );

    return () => {
      cancelled = true;
      stopWatching();
      cancelAnimationFrame(rafId);
      window.clearTimeout(delayedResizeId);
      ro?.disconnect();
      reverseAbortRef.current?.abort();
      searchAbortRef.current?.abort();
      markerRef.current?.remove();
      markerRef.current = null;
      if (map) {
        map.remove();
        map = null;
      }
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- init once when mapbox loads
  }, [mapbox]);

  // Sync marker from committed draft only when there is no pending preview.
  useEffect(() => {
    if (!mapbox || !mapRef.current || pending) return;
    if (!hasCoords(value)) {
      markerRef.current?.remove();
      markerRef.current = null;
      return;
    }
    const lng = value.longitude!;
    const lat = value.latitude!;
    placeMarkerRef.current(lng, lat, mapbox);
    const cur = mapRef.current.getCenter();
    const dist = Math.abs(cur.lng - lng) + Math.abs(cur.lat - lat);
    if (dist > 0.0002) {
      mapRef.current.easeTo({
        center: [lng, lat],
        zoom: Math.max(mapRef.current.getZoom(), 14),
        duration: 500,
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapbox, value.longitude, value.latitude, pending]);

  const canSetLocation =
    !!pending || inputText.trim().length >= 2;

  return (
    <div className="mt-3">
      {/* Search + Set location — h-11 matches Participants subevent filter. */}
      <div className="relative max-w-[600px]">
        <div className="flex items-center gap-2">
          <div className="relative min-w-0 flex-1">
            {searchLoading || geocodeBusy ? (
              <Loader2 className="pointer-events-none absolute left-3.5 top-1/2 h-[17px] w-[17px] -translate-y-1/2 animate-spin text-[#8E8E93]" />
            ) : (
              <Search
                className="pointer-events-none absolute left-3.5 top-1/2 h-[17px] w-[17px] -translate-y-1/2 text-[#8E8E93]"
                strokeWidth={2}
              />
            )}
            <input
              value={inputText}
              onChange={(e) => {
                const next = e.target.value;
                setInputText(next);
                setLocationConfirmed(false);
                setPending(null);
                // Draft / ticket stay unchanged until Set location.
              }}
              onFocus={() => {
                setSearchFocused(true);
                // Fresh Search Box session when the user starts typing again.
                if (!sessionTokenRef.current) {
                  sessionTokenRef.current = createSearchSessionToken();
                }
              }}
              onBlur={() => {
                setSearchFocused(false);
                window.setTimeout(() => setSearchOpen(false), 180);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  void setLocationFromQuery();
                } else if (e.key === "Escape") {
                  setSearchOpen(false);
                  (e.target as HTMLInputElement).blur();
                }
              }}
              placeholder="Add a place…"
              aria-label="Location name"
              aria-autocomplete="list"
              aria-expanded={searchOpen}
              className={cn(
                "h-11 w-full rounded-[10px] border-0 bg-[#F2F2F7] pl-10 text-[17px] text-ink",
                "placeholder:text-[#8E8E93] outline-none focus:bg-[#EBEBF0] focus:ring-0",
                inputText ? "pr-10" : "pr-3.5",
              )}
            />
            {inputText ? (
              <button
                type="button"
                aria-label="Clear location"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  skipNextSearchRef.current = true;
                  setInputText("");
                  setSuggestions([]);
                  setSearchOpen(false);
                  setLocationConfirmed(false);
                  setPending(null);
                  markerRef.current?.remove();
                  markerRef.current = null;
                  onChange({
                    ...value,
                    name: "",
                    longitude: null,
                    latitude: null,
                    mapboxPlaceId: null,
                  });
                }}
                className="absolute right-2.5 top-1/2 grid h-6 w-6 -translate-y-1/2 place-items-center rounded-full bg-[#C7C7CC] text-white hover:bg-[#AEAEB2]"
              >
                <X className="h-3.5 w-3.5" strokeWidth={2.5} />
              </button>
            ) : null}
          </div>

          <button
            type="button"
            disabled={
              locationConfirmed ||
              settingLocation ||
              (!locationConfirmed && !canSetLocation)
            }
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => void setLocationFromQuery()}
            aria-label={locationConfirmed ? "Location set" : "Set location"}
            className={cn(
              "flex h-11 shrink-0 items-center justify-center gap-1.5 rounded-[10px] px-4 text-[15px] font-medium transition-colors",
              locationConfirmed
                ? "bg-[#D1FAE5] text-[#047857]"
                : canSetLocation && !settingLocation
                  ? "bg-ink text-white hover:bg-ink/90"
                  : "cursor-not-allowed bg-[#F2F2F7] text-[#8E8E93]",
            )}
          >
            {settingLocation ? (
              "Setting…"
            ) : locationConfirmed ? (
              <>
                <Check className="h-4 w-4" strokeWidth={2.5} />
                <span>Set</span>
              </>
            ) : (
              "Set location"
            )}
          </button>
        </div>

        {searchOpen && suggestions.length > 0 && (
          <ul
            role="listbox"
            className="absolute left-0 right-0 top-[calc(100%+4px)] z-30 max-h-[280px] overflow-y-auto rounded-[10px] border border-black/8 bg-white/95 py-1 shadow-[0_8px_28px_rgba(0,0,0,0.18)] backdrop-blur-xl"
          >
            {suggestions.map((s) => (
              <li key={s.id} role="option">
                <button
                  type="button"
                  onMouseDown={(e) => {
                    e.preventDefault();
                    void selectSuggestion(s);
                  }}
                  className="flex w-full items-start gap-2 px-3.5 py-2.5 text-left text-ink hover:bg-secondary"
                >
                  <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  <span className="min-w-0 flex-1">
                    <span className="line-clamp-1 text-[15px]">{s.placeName}</span>
                    {s.secondaryText ? (
                      <span className="mt-0.5 block line-clamp-1 text-[12px] text-muted-foreground">
                        {s.secondaryText}
                      </span>
                    ) : null}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
        {searchOpen &&
          !searchLoading &&
          inputText.trim().length >= 2 &&
          suggestions.length === 0 && (
            <div className="absolute left-0 right-0 top-[calc(100%+4px)] z-30 rounded-[10px] border border-black/8 bg-white/95 px-3.5 py-2.5 text-[15px] text-muted-foreground shadow-[0_8px_28px_rgba(0,0,0,0.18)] backdrop-blur-xl">
              No places found
            </div>
          )}
      </div>

      {/* Full-bleed map across the About scroll area (breaks out of 600px column). */}
      <div
        className={cn(
          "relative mt-6 h-[min(520px,55vh)] w-full overflow-hidden rounded-lg border border-hairline bg-secondary/20",
        )}
      >
        <div
          id={`event-location-map-${containerId}`}
          ref={containerRef}
          className="h-full w-full"
        />
        {!mapbox && !mapError && (
          <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center text-sm text-muted-foreground">
            Loading map…
          </div>
        )}
        {mapError && (
          <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center text-sm text-muted-foreground">
            {mapError}
          </div>
        )}
      </div>
    </div>
  );
}

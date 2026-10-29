/**
 * Session location map side panel — same shell size as the session / participants
 * modals. Mapbox search + map (same stack as EventLocationPicker).
 */

import {
  forwardRef,
  useEffect,
  useId,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
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
import { googleMapsSearchUrl, parseLatLngFromMapsUrl } from "@/lib/googleMapsUrl";
import {
  SESSION_PANEL_SHELL_CLASS,
  SESSION_PANEL_SHELL_STYLE,
} from "./sessionPanelDockUtils";
import { useSidenavScrollFade } from "./useSidenavScrollFade";

const STREET_STYLE = "mapbox://styles/mapbox/streets-v12";
const DEFAULT_CENTER: [number, number] = [10.7522, 59.9139];
const PIN_COLOR = "#dc2626";

export type SessionMapLocation = {
  name: string;
  longitude: number;
  latitude: number;
  locationUrl: string;
};

type SelectedLocation = {
  lng: number;
  lat: number;
  address: string;
  mapboxId: string | null;
};

function pinElement(): HTMLDivElement {
  const el = document.createElement("div");
  el.style.width = "28px";
  el.style.height = "32px";
  el.innerHTML = `<svg viewBox='0 0 24 32' width='28' height='32' xmlns='http://www.w3.org/2000/svg'><path d='M12 0C5.4 0 0 5.4 0 12c0 9 12 20 12 20s12-11 12-20C24 5.4 18.6 0 12 0z' fill='${PIN_COLOR}' stroke='white' stroke-width='1.5'/><circle cx='12' cy='12' r='4' fill='white'/></svg>`;
  return el;
}

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

export type SessionLocationMapSearchHandoff = {
  query: string;
  suggestions: MapboxSuggestResult[];
};

export type SessionLocationMapPanelHandle = {
  getSearchHandoff: () => SessionLocationMapSearchHandoff;
};

export const SessionLocationMapPanel = forwardRef<
  SessionLocationMapPanelHandle,
  {
    locationName: string;
    locationUrl?: string | null;
    onConfirm: (next: SessionMapLocation) => void;
    onClear?: () => void;
    onClose: () => void;
  }
>(function SessionLocationMapPanel(
  { locationName, locationUrl, onConfirm, onClear, onClose },
  ref,
) {
  const mapbox = useMapbox();
  const containerId = useId().replace(/:/g, "-");
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapboxMap | null>(null);
  const markerRef = useRef<Marker | null>(null);
  const searchAbortRef = useRef<AbortController | null>(null);
  const reverseAbortRef = useRef<AbortController | null>(null);
  const skipNextSearchRef = useRef(false);
  const sessionTokenRef = useRef(createSearchSessionToken());
  const userProximityRef = useRef<MapboxProximity | null>(null);
  const mapboxRef = useRef(mapbox);
  const applyCoordsRef = useRef<(lng: number, lat: number) => Promise<void>>(
    async () => {},
  );
  const placeMarkerRef = useRef<
    (lng: number, lat: number, mapboxMod: typeof import("mapbox-gl")) => void
  >(() => {});

  const initialCoords = parseLatLngFromMapsUrl(locationUrl);

  const [inputText, setInputText] = useState(locationName);
  const [suggestions, setSuggestions] = useState<MapboxSuggestResult[]>([]);
  const [searchOpen, setSearchOpen] = useState(false);
  const searchHandoffRef = useRef<SessionLocationMapSearchHandoff>({
    query: locationName,
    suggestions: [],
  });
  searchHandoffRef.current = { query: inputText, suggestions };
  useImperativeHandle(ref, () => ({
    getSearchHandoff: () => searchHandoffRef.current,
  }));
  const [searchFocused, setSearchFocused] = useState(false);
  const [searchLoading, setSearchLoading] = useState(false);
  const [geocodeBusy, setGeocodeBusy] = useState(false);
  const [mapError, setMapError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [confirmed, setConfirmed] = useState(() => !!initialCoords);
  const [pending, setPending] = useState<SelectedLocation | null>(() =>
    initialCoords
      ? {
          lng: initialCoords.lng,
          lat: initialCoords.lat,
          address: locationName.trim() || `${initialCoords.lat}, ${initialCoords.lng}`,
          mapboxId: null,
        }
      : null,
  );
  const pendingRef = useRef(pending);
  const bindSidenavScroll = useSidenavScrollFade();

  useEffect(() => {
    mapboxRef.current = mapbox;
  }, [mapbox]);
  useEffect(() => {
    pendingRef.current = pending;
  }, [pending]);

  useEffect(() => {
    if (typeof navigator === "undefined" || !navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        userProximityRef.current = {
          lng: pos.coords.longitude,
          lat: pos.coords.latitude,
        };
      },
      () => {},
      { enableHighAccuracy: false, maximumAge: 300_000, timeout: 8_000 },
    );
  }, []);

  useEffect(() => {
    void loadMapboxToken();
  }, []);

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
  const previewOnMapRef = useRef(previewOnMap);
  previewOnMapRef.current = previewOnMap;

  // Keep search + pin in sync when the session location field picks a place
  // (or when the parent otherwise updates name/url while this panel is open).
  useEffect(() => {
    skipNextSearchRef.current = true;
    setInputText(locationName);
    const coords = parseLatLngFromMapsUrl(locationUrl);
    if (!coords) {
      setConfirmed(false);
      if (!locationName.trim()) {
        setPending(null);
        markerRef.current?.remove();
        markerRef.current = null;
      }
      return;
    }
    const next: SelectedLocation = {
      lng: coords.lng,
      lat: coords.lat,
      address: locationName.trim() || `${coords.lat}, ${coords.lng}`,
      mapboxId: null,
    };
    pendingRef.current = next;
    setPending(next);
    setConfirmed(true);
    setSuggestions([]);
    setSearchOpen(false);
    previewOnMapRef.current(next);
  }, [locationName, locationUrl]);

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

  const commitSelection = (next: SelectedLocation) => {
    skipNextSearchRef.current = true;
    pendingRef.current = next;
    setPending(next);
    setInputText(next.address);
    setSuggestions([]);
    setSearchOpen(false);
    onConfirm({
      name: next.address,
      longitude: next.lng,
      latitude: next.lat,
      locationUrl: googleMapsSearchUrl({
        query: next.address,
        lat: next.lat,
        lng: next.lng,
      }),
    });
    setConfirmed(true);
  };

  applyCoordsRef.current = async (lng, lat) => {
    setGeocodeBusy(true);
    reverseAbortRef.current?.abort();
    const ctrl = new AbortController();
    reverseAbortRef.current = ctrl;
    try {
      const reversed = await reverseGeocode(lng, lat, { signal: ctrl.signal });
      const address =
        reversed?.placeName ?? `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
      const next = {
        lng,
        lat,
        address,
        mapboxId: reversed?.id ?? null,
      };
      commitSelection(next);
      const mod = mapboxRef.current;
      if (mod && mapRef.current) placeMarkerRef.current(lng, lat, mod);
    } catch (err) {
      if ((err as { name?: string })?.name === "AbortError") return;
      const next = {
        lng,
        lat,
        address: `${lat.toFixed(5)}, ${lng.toFixed(5)}`,
        mapboxId: null,
      };
      commitSelection(next);
      const mod = mapboxRef.current;
      if (mod && mapRef.current) placeMarkerRef.current(lng, lat, mod);
    } finally {
      setGeocodeBusy(false);
    }
  };

  const selectSuggestion = async (s: MapboxSuggestResult) => {
    skipNextSearchRef.current = true;
    setSearchLoading(true);
    setSuggestions([]);
    setSearchOpen(false);
    setInputText(s.placeName);
    try {
      const retrieved = await retrieveSuggestion(s.id, {
        sessionToken: sessionTokenRef.current,
      });
      sessionTokenRef.current = createSearchSessionToken();
      if (!retrieved) return;
      const next: SelectedLocation = {
        lng: retrieved.lng,
        lat: retrieved.lat,
        address: retrieved.placeName,
        mapboxId: retrieved.id,
      };
      previewOnMap(next);
      commitSelection(next);
    } finally {
      setSearchLoading(false);
    }
  };

  const confirmLocation = async () => {
    if (confirming) return;
    setConfirming(true);
    try {
      let next = pendingRef.current;
      if (!next && inputText.trim().length >= 2) {
        setGeocodeBusy(true);
        try {
          const results = await forwardGeocode(inputText.trim(), {
            proximity: resolveProximity(mapRef.current, userProximityRef.current),
            limit: 1,
          });
          if (results[0]) {
            next = {
              lng: results[0].lng,
              lat: results[0].lat,
              address: results[0].placeName,
              mapboxId: results[0].id,
            };
            setPending(next);
            setInputText(next.address);
            previewOnMap(next);
          }
        } finally {
          setGeocodeBusy(false);
        }
      }
      if (!next) return;
      commitSelection(next);
    } finally {
      setConfirming(false);
    }
  };

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
      setSearchOpen(false);
      setSearchLoading(false);
      return;
    }
    setSearchLoading(true);
    const t = window.setTimeout(async () => {
      searchAbortRef.current?.abort();
      const ctrl = new AbortController();
      searchAbortRef.current = ctrl;
      try {
        const results = await suggestPlaces(q, {
          sessionToken: sessionTokenRef.current,
          proximity: resolveProximity(mapRef.current, userProximityRef.current),
          signal: ctrl.signal,
        });
        if (ctrl.signal.aborted) return;
        setSuggestions(results);
        setSearchOpen(true);
      } catch (err) {
        if ((err as { name?: string })?.name === "AbortError") return;
        setSuggestions([]);
        setSearchOpen(true);
      } finally {
        setSearchLoading(false);
      }
    }, 300);
    return () => window.clearTimeout(t);
  }, [inputText, searchFocused]);

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
      "SessionLocationMapPanel",
      () => {
        if (cancelled || mapRef.current || map) return;

        const token = getCachedMapboxToken();
        if (token) {
          mapbox.default.accessToken = token;
        } else if (!mapbox.default.accessToken) {
          setMapError("Mapbox token unavailable");
          return;
        }

        const seed = pendingRef.current;
        const center: [number, number] = seed
          ? [seed.lng, seed.lat]
          : DEFAULT_CENTER;
        const zoom = seed ? 14 : 5;

        try {
          map = new mapbox.default.Map({
            container,
            style: STREET_STYLE,
            center,
            zoom,
            attributionControl: false,
          });
        } catch (err) {
          console.error("[mapbox] SessionLocationMapPanel constructor threw:", err);
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

        mapRef.current = map;
        if (seed) placeMarkerRef.current(seed.lng, seed.lat, mapbox);

        rafId = window.requestAnimationFrame(() => {
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
        }, 120);
        ro = new ResizeObserver(() => {
          try {
            map?.resize();
          } catch {
            /* ignore */
          }
        });
        ro.observe(container);
      },
    );

    return () => {
      cancelled = true;
      stopWatching();
      window.cancelAnimationFrame(rafId);
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

  return (
    <div
      className={`flex h-full min-h-0 flex-col ${SESSION_PANEL_SHELL_CLASS}`}
      style={SESSION_PANEL_SHELL_STYLE}
      onMouseDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="flex items-center justify-end px-3 pt-2">
        <button
          type="button"
          aria-label="Close map"
          onClick={(e) => {
            e.stopPropagation();
            onClose();
          }}
          onMouseDown={(e) => e.stopPropagation()}
          className="grid h-7 w-7 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-secondary hover:text-ink"
        >
          <X className="h-4 w-4" strokeWidth={2.25} />
        </button>
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-3 px-3 pb-3 pt-1">
        <div className="relative shrink-0">
          <div className="flex h-7 items-center rounded-md bg-secondary pr-1 text-ink">
            <span className="grid h-7 w-7 shrink-0 place-items-center text-ink" aria-hidden>
              {searchLoading || geocodeBusy ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
              ) : (
                <Search className="h-4 w-4" />
              )}
            </span>
            <input
              type="text"
              value={inputText}
              onChange={(e) => {
                setInputText(e.target.value);
                setConfirmed(false);
                setPending(null);
              }}
              onFocus={() => {
                setSearchFocused(true);
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
                  e.stopPropagation();
                  void confirmLocation();
                } else if (e.key === "Escape") {
                  setSearchOpen(false);
                  (e.target as HTMLInputElement).blur();
                }
              }}
              placeholder="Search location"
              aria-label="Search location"
              aria-autocomplete="list"
              aria-expanded={searchOpen}
              className="min-w-0 flex-1 bg-transparent text-[12px] text-ink placeholder:text-muted-foreground/70 focus:outline-none"
            />
            {inputText || pending || confirmed ? (
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  skipNextSearchRef.current = true;
                  setInputText("");
                  setSuggestions([]);
                  setSearchOpen(false);
                  setConfirmed(false);
                  setPending(null);
                  markerRef.current?.remove();
                  markerRef.current = null;
                  onClear?.();
                }}
                aria-label="Clear location"
                data-map-search-clear=""
                className="ml-1 grid h-5 w-5 shrink-0 place-items-center rounded text-muted-foreground transition-colors hover:bg-white/60 hover:text-ink"
              >
                <X className="h-3 w-3" />
              </button>
            ) : null}
            {confirmed ? (
              <span
                aria-label="Location set"
                title="Location set"
                className="ml-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-md bg-[#D1FAE5] text-[#047857]"
              >
                <Check className="h-3.5 w-3.5" strokeWidth={2.5} />
              </span>
            ) : null}
          </div>

          {searchOpen && suggestions.length > 0 ? (
            <ul
              ref={bindSidenavScroll}
              role="listbox"
              className="sidenav-scroll absolute left-0 right-0 top-[calc(100%+4px)] z-30 max-h-[220px] overflow-y-auto rounded-[10px] border border-black/8 bg-white/95 py-1 shadow-[0_8px_28px_rgba(0,0,0,0.18)] backdrop-blur-xl"
              data-location-results=""
            >
              {suggestions.map((s) => (
                <li key={s.id} role="option">
                  <button
                    type="button"
                    onMouseDown={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      void selectSuggestion(s);
                    }}
                    onClick={(e) => e.stopPropagation()}
                    className="flex w-full items-start gap-2 px-3 py-2 text-left text-ink hover:bg-secondary"
                  >
                    <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                    <span className="min-w-0 flex-1">
                      <span className="line-clamp-1 text-[12px] font-medium">
                        {s.placeName}
                      </span>
                      {s.secondaryText ? (
                        <span className="mt-0.5 block line-clamp-1 text-[11px] text-muted-foreground">
                          {s.secondaryText}
                        </span>
                      ) : null}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
          {searchOpen &&
          !searchLoading &&
          inputText.trim().length >= 2 &&
          suggestions.length === 0 ? (
            <div
              data-location-results=""
              className="absolute left-0 right-0 top-[calc(100%+4px)] z-30 rounded-[10px] border border-black/8 bg-white/95 px-3 py-2 text-[12px] text-muted-foreground shadow-[0_8px_28px_rgba(0,0,0,0.18)] backdrop-blur-xl"
            >
              No places found
            </div>
          ) : null}
        </div>

        <div className="relative min-h-0 flex-1 overflow-hidden rounded-[10px] border border-hairline bg-secondary/20">
          <div
            id={`session-loc-map-${containerId}`}
            ref={containerRef}
            className="absolute inset-0 h-full w-full"
          />
          {!mapbox && !mapError ? (
            <div className="absolute inset-0 grid place-items-center text-[12px] text-muted-foreground">
              Loading map…
            </div>
          ) : null}
          {mapError ? (
            <div className="absolute inset-0 grid place-items-center px-4 text-center text-[12px] text-[#B42318]">
              {mapError}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
});

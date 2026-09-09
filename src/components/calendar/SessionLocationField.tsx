/**
 * Session location field — title-sized input with a left MapPin aligned
 * like the activity color dot (`left-3` / `pl-7`).
 * Typing shows Mapbox place suggestions (same stack as the map modal);
 * clicking a result sets the name + map URL.
 * When `locationUrl` is set, only the location text is a hyperlink (not the
 * whole field or pin). Double-click the text to edit.
 * Optional map toggle (square rounded Map icon) opens the location map panel.
 */

import { useEffect, useRef, useState } from "react";
import { Loader2, Map, MapPin, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { googleMapsHrefForLocation, googleMapsSearchUrl } from "@/lib/googleMapsUrl";
import { loadMapboxToken } from "@/lib/mapbox";
import {
  createSearchSessionToken,
  retrieveSuggestion,
  suggestPlaces,
  type MapboxSuggestResult,
} from "@/lib/mapbox-geocoding";
import { sessionPopoverFieldClass } from "./sessionPopoverField";
import { useSidenavScrollFade } from "./useSidenavScrollFade";
import type { SessionLocationMapSearchHandoff } from "./SessionLocationMapPanel";

const FIELD_SHELL = "rounded-[10px] bg-muted/70";

export type SessionLocationPlace = {
  name: string;
  locationUrl: string;
  latitude: number;
  longitude: number;
};

export function SessionLocationField({
  value,
  onChange,
  readOnly = false,
  placeholder = "Location",
  /** Match calendar popover title field (`py-3` + 13px) vs diary rows (`py-2.5` + 12px). */
  size = "calendar",
  locationUrl = null,
  onLocationUrlClear,
  onPlaceSelect,
  mapOpen = false,
  onMapToggle,
  showMapButton = true,
  searchHandoff = null,
  onSearchHandoffConsumed,
}: {
  value: string;
  onChange: (next: string) => void;
  readOnly?: boolean;
  placeholder?: string;
  size?: "calendar" | "compact";
  locationUrl?: string | null;
  /** Called when the user edits the text so parents can drop a stale map link. */
  onLocationUrlClear?: () => void;
  /** Called when the user picks a Mapbox suggestion (name + coordinates URL). */
  onPlaceSelect?: (place: SessionLocationPlace) => void;
  mapOpen?: boolean;
  onMapToggle?: () => void;
  showMapButton?: boolean;
  /** Seed from the map panel when it closes because the pane is too narrow. */
  searchHandoff?: SessionLocationMapSearchHandoff | null;
  onSearchHandoffConsumed?: () => void;
}) {
  const py = size === "calendar" ? "py-3" : "py-2.5";
  const text = size === "calendar" ? "text-[13px]" : "text-[12px]";
  const interactive = size === "calendar";
  const href = googleMapsHrefForLocation(value, locationUrl);
  const linked = href.length > 0;
  const [editing, setEditing] = useState(false);
  const showLink = linked && !editing;
  const mapBtn = showMapButton && !!onMapToggle;
  const hasLocation = value.trim().length > 0 || Boolean(locationUrl);
  const showClear = !readOnly && hasLocation;
  const endPad = mapBtn && showClear ? "pr-16" : mapBtn || showClear ? "pr-10" : "pr-3";

  const [focused, setFocused] = useState(false);
  const [fieldHeld, setFieldHeld] = useState(false);
  const [suggestions, setSuggestions] = useState<MapboxSuggestResult[]>([]);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchLoading, setSearchLoading] = useState(false);
  const skipNextSearchRef = useRef(false);
  const searchAbortRef = useRef<AbortController | null>(null);
  const sessionTokenRef = useRef(createSearchSessionToken());
  const rootRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [focusAfterClear, setFocusAfterClear] = useState(false);
  const [focusAfterImport, setFocusAfterImport] = useState(false);
  const bindSidenavScroll = useSidenavScrollFade();

  useEffect(() => {
    void loadMapboxToken();
  }, []);

  useEffect(() => {
    if (!fieldHeld) return;
    const onPointerDown = (e: PointerEvent) => {
      if (rootRef.current?.contains(e.target as Node)) return;
      setFieldHeld(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [fieldHeld]);

  useEffect(() => {
    if (readOnly || showLink) {
      setSuggestions([]);
      setSearchOpen(false);
      setSearchLoading(false);
      return;
    }
    if (skipNextSearchRef.current) {
      skipNextSearchRef.current = false;
      return;
    }
    if (!focused) {
      setSearchOpen(false);
      setSearchLoading(false);
      return;
    }
    const q = value.trim();
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
          proximity: "ip",
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
  }, [value, focused, readOnly, showLink]);

  useEffect(
    () => () => {
      searchAbortRef.current?.abort();
    },
    [],
  );

  useEffect(() => {
    if (!focusAfterClear) return;
    const el = inputRef.current;
    if (!el) return;
    el.focus({ preventScroll: true });
    try {
      el.setSelectionRange(0, 0);
    } catch {
      /* type=text always exposes a selection range */
    }
    setFocusAfterClear(false);
  }, [focusAfterClear, value, locationUrl]);

  useEffect(() => {
    if (!focusAfterImport) return;
    const el = inputRef.current;
    if (!el) return;
    el.focus({ preventScroll: true });
    const end = el.value.length;
    try {
      el.setSelectionRange(end, end);
    } catch {
      /* type=text always exposes a selection range */
    }
    setFocusAfterImport(false);
  }, [focusAfterImport, value]);

  useEffect(() => {
    if (!searchHandoff) return;
    skipNextSearchRef.current = true;
    const query = searchHandoff.query;
    if (query !== value) {
      onChange(query);
      onLocationUrlClear?.();
    }
    setSuggestions(searchHandoff.suggestions);
    setSearchOpen(
      searchHandoff.suggestions.length > 0 || query.trim().length >= 2,
    );
    setEditing(true);
    setFocused(true);
    setFieldHeld(true);
    setFocusAfterImport(true);
    onSearchHandoffConsumed?.();
    // Parent clears `searchHandoff` in onSearchHandoffConsumed; run once per payload.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchHandoff]);

  const handleChange = (next: string) => {
    if (linked && next !== value) onLocationUrlClear?.();
    onChange(next);
  };

  const clearLocation = () => {
    skipNextSearchRef.current = true;
    setSuggestions([]);
    setSearchOpen(false);
    setSearchLoading(false);
    setEditing(true);
    setFocused(true);
    setFieldHeld(true);
    onChange("");
    onLocationUrlClear?.();
    setFocusAfterClear(true);
  };

  const selectSuggestion = async (s: MapboxSuggestResult) => {
    skipNextSearchRef.current = true;
    setSearchLoading(true);
    setSuggestions([]);
    setSearchOpen(false);
    onChange(s.placeName);
    try {
      const retrieved = await retrieveSuggestion(s.id, {
        sessionToken: sessionTokenRef.current,
      });
      sessionTokenRef.current = createSearchSessionToken();
      if (!retrieved) return;
      skipNextSearchRef.current = true;
      const place: SessionLocationPlace = {
        name: retrieved.placeName,
        latitude: retrieved.lat,
        longitude: retrieved.lng,
        locationUrl: googleMapsSearchUrl({
          query: retrieved.placeName,
          lat: retrieved.lat,
          lng: retrieved.lng,
        }),
      };
      onChange(place.name);
      if (onPlaceSelect) {
        onPlaceSelect(place);
      } else {
        // Parents without onPlaceSelect still get the display name;
        // they keep clearing URL on free-text via onLocationUrlClear.
      }
      setEditing(false);
      setFocused(false);
    } finally {
      setSearchLoading(false);
    }
  };

  const dropdown =
    !readOnly &&
    !showLink &&
    searchOpen &&
    (suggestions.length > 0 ||
      (!searchLoading && value.trim().length >= 2 && suggestions.length === 0)) ? (
      <div className="absolute left-0 right-0 top-[calc(100%+4px)] z-40">
        {suggestions.length > 0 ? (
          <ul
            ref={bindSidenavScroll}
            role="listbox"
            className="sidenav-scroll max-h-[220px] overflow-y-auto rounded-[10px] border border-black/8 bg-white/95 py-1 shadow-[0_8px_28px_rgba(0,0,0,0.18)] backdrop-blur-xl"
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
        ) : (
          <div className="rounded-[10px] border border-black/8 bg-white/95 px-3 py-2 text-[12px] text-muted-foreground shadow-[0_8px_28px_rgba(0,0,0,0.18)] backdrop-blur-xl">
            No places found
          </div>
        )}
      </div>
    ) : null;

  return (
    <div className="relative" ref={rootRef}>
      {searchLoading && focused && !showLink ? (
        <Loader2
          aria-hidden
          className="pointer-events-none absolute left-3 top-1/2 z-[1] h-3.5 w-3.5 -translate-y-1/2 animate-spin text-muted-foreground"
          strokeWidth={2.25}
        />
      ) : (
        <MapPin
          aria-hidden
          className="pointer-events-none absolute left-3 top-1/2 z-[1] h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground"
          strokeWidth={2.25}
        />
      )}
      <div
        className={[
          "relative",
          interactive
            ? sessionPopoverFieldClass((focused || mapOpen || fieldHeld) && !readOnly)
            : FIELD_SHELL,
        ].join(" ")}
        onPointerDown={
          interactive && !readOnly
            ? () => setFieldHeld(true)
            : undefined
        }
      >
        {showLink ? (
          <div
            className={`flex w-full items-center bg-transparent pl-7 ${endPad} ${py}`}
            onDoubleClick={
              readOnly
                ? undefined
                : (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setEditing(true);
                    setFocused(true);
                  }
            }
          >
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              title={readOnly ? "Open in map" : "Open in map · double-click to edit"}
              className={`inline-block max-w-full cursor-pointer truncate ${text} text-ink underline decoration-ink/30 underline-offset-2 hover:decoration-ink/60`}
              onMouseDown={(e) => e.stopPropagation()}
              onClick={(e) => e.stopPropagation()}
              onDoubleClick={
                readOnly
                  ? undefined
                  : (e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setEditing(true);
                      setFocused(true);
                    }
              }
            >
              {value || (
                <span className="text-muted-foreground/60 no-underline">{placeholder}</span>
              )}
            </a>
          </div>
        ) : (
          <input
            ref={inputRef}
            type="text"
            value={value}
            autoFocus={editing}
            onChange={(e) => handleChange(e.target.value)}
            onFocus={() => {
              setFocused(true);
              if (!sessionTokenRef.current) {
                sessionTokenRef.current = createSearchSessionToken();
              }
            }}
            onBlur={() => {
              setFocused(false);
              setEditing(false);
              window.setTimeout(() => setSearchOpen(false), 180);
            }}
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                setSearchOpen(false);
                (e.target as HTMLInputElement).blur();
              }
            }}
            placeholder={placeholder}
            readOnly={readOnly}
            tabIndex={readOnly ? -1 : 0}
            aria-autocomplete="list"
            aria-expanded={searchOpen}
            onMouseDown={readOnly ? (e) => e.preventDefault() : undefined}
            className={[
              `block w-full bg-transparent pl-7 ${endPad} ${py} ${text} text-ink outline-none placeholder:text-muted-foreground/60`,
              readOnly
                ? "cursor-default select-text caret-transparent"
                : interactive
                  ? "cursor-default"
                  : "",
            ].join(" ")}
          />
        )}
        {showClear ? (
          <button
            type="button"
            aria-label="Clear location"
            title="Clear location"
            onMouseDown={(e) => {
              e.preventDefault();
              e.stopPropagation();
            }}
            onClick={(e) => {
              e.stopPropagation();
              clearLocation();
            }}
            className={cn(
              "absolute top-1/2 z-[2] grid h-7 w-7 -translate-y-1/2 place-items-center rounded-md transition-colors",
              mapBtn ? "right-9" : "right-1.5",
              interactive
                ? "text-muted-foreground hover:bg-black/[0.06] hover:text-ink"
                : "text-muted-foreground hover:bg-secondary/70 hover:text-ink",
            )}
          >
            <X className="h-3 w-3" />
          </button>
        ) : null}
        {mapBtn ? (
          <button
            type="button"
            aria-label={mapOpen ? "Close map" : "Open map"}
            aria-pressed={mapOpen}
            title={mapOpen ? "Close map" : "Open map"}
            onClick={(e) => {
              e.stopPropagation();
              onMapToggle?.();
            }}
            onMouseDown={(e) => e.stopPropagation()}
            className={cn(
              "absolute right-1.5 top-1/2 z-[2] grid h-7 w-7 -translate-y-1/2 place-items-center rounded-md transition-colors",
              mapOpen
                ? interactive
                  ? "text-ink"
                  : "bg-secondary text-ink"
                : interactive
                  ? "text-muted-foreground hover:bg-black/[0.06] hover:text-ink"
                  : "text-muted-foreground hover:bg-secondary/70 hover:text-ink",
            )}
          >
            <Map className="h-3.5 w-3.5" strokeWidth={2.25} />
          </button>
        ) : null}
      </div>
      {dropdown}
    </div>
  );
}

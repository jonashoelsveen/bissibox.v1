import { useEffect, useId, useRef, useState } from "react";
import type { Map as MapboxMap, Marker } from "mapbox-gl";
import { useMapbox, useMapStyle, MAP_STYLES, observeVisibleMapContainer } from "@/lib/mapbox";
import { MapStylePicker } from "./MapStylePicker";

const PIN_COLOR = "#dc2626";

interface Props {
  pin: { lat: number; lng: number } | null;
  /** Optional stable id so the per-instance map style is remembered. */
  scopeId?: string;
}

export function ReadOnlyPinMap({ pin, scopeId }: Props) {
  const containerId = useId().replace(/:/g, "-");
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapboxMap | null>(null);
  const markerRef = useRef<Marker | null>(null);
  const mapbox = useMapbox();
  const [style, setStyle] = useMapStyle(scopeId ? `pin:${scopeId}` : null);

  // Init map
  useEffect(() => {
    if (!mapbox || !containerRef.current || mapRef.current) return;
    const container = containerRef.current;
    let map: MapboxMap | null = null;
    let rafId = 0;
    let delayedResizeId = 0;
    let ro: ResizeObserver | null = null;

    const stopWatchingVisibility = observeVisibleMapContainer(container, "ReadOnlyPinMap", () => {
      if (mapRef.current || map) return;
      const center: [number, number] = pin ? [pin.lng, pin.lat] : [10.7522, 59.9139];
      try {
        map = new mapbox.default.Map({
          container,
          style: MAP_STYLES[style].url,
          center,
          zoom: pin ? 14 : 5,
          attributionControl: false,
        });
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error("[mapbox] ReadOnlyPinMap constructor threw:", err);
        return;
      }
      map.addControl(new mapbox.default.NavigationControl({ showCompass: false }), "bottom-right");
      map.addControl(new mapbox.default.AttributionControl({ compact: true }));
      map.on("error", (e) => {
        // eslint-disable-next-line no-console
        console.error("[mapbox] ReadOnlyPinMap runtime error:", (e as any)?.error ?? e);
      });
      rafId = requestAnimationFrame(() => {
        try { map?.resize(); } catch { /* ignore */ }
      });
      delayedResizeId = window.setTimeout(() => {
        try { map?.resize(); } catch { /* ignore */ }
      }, 100);
      ro = new ResizeObserver(() => {
        try { map?.resize(); } catch { /* ignore */ }
      });
      ro.observe(container);
      mapRef.current = map;
    });

    return () => {
      stopWatchingVisibility();
      cancelAnimationFrame(rafId);
      window.clearTimeout(delayedResizeId);
      ro?.disconnect();
      map?.remove();
      mapRef.current = null;
      markerRef.current = null;
    };
  }, [mapbox]); // eslint-disable-line react-hooks/exhaustive-deps

  // Switch style on demand. Mapbox preserves added Markers across setStyle,
  // so no re-add is required for marker-only maps.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (map.getStyle()?.sprite?.includes(style)) return; // best-effort no-op
    map.setStyle(MAP_STYLES[style].url);
  }, [style]);

  // Sync marker
  useEffect(() => {
    if (!mapbox || !mapRef.current) return;
    if (markerRef.current) {
      markerRef.current.remove();
      markerRef.current = null;
    }
    if (pin) {
      const el = document.createElement("div");
      el.style.width = "24px";
      el.style.height = "30px";
      el.style.filter = "drop-shadow(0 1px 2px rgba(0,0,0,0.4))";
      el.innerHTML = `<svg width="24" height="30" viewBox="0 0 24 30" xmlns="http://www.w3.org/2000/svg"><path d="M12 1 C6 1 2 5 2 11 C2 18 12 29 12 29 C12 29 22 18 22 11 C22 5 18 1 12 1 Z" fill="${PIN_COLOR}" stroke="#fff" stroke-width="1.5"/><circle cx="12" cy="11" r="3.5" fill="#fff"/></svg>`;
      const m = new mapbox.default.Marker({ element: el, anchor: "bottom" })
        .setLngLat([pin.lng, pin.lat])
        .addTo(mapRef.current);
      markerRef.current = m;
      try {
        mapRef.current.flyTo({ center: [pin.lng, pin.lat], zoom: 14, duration: 600 });
      } catch {
        /* ignore */
      }
    }
  }, [mapbox, pin]);

  return (
    <div className="relative h-full w-full" style={{ minHeight: 400 }}>
      <div
        id={`readonly-pin-map-${containerId}`}
        ref={containerRef}
        className="absolute inset-0 bg-secondary"
        style={{ zIndex: 1, minHeight: 400, width: "100%", height: "100%" }}
      />
      <div className="absolute right-3 top-3 z-10">
        <MapStylePicker value={style} onChange={setStyle} compact />
      </div>
    </div>
  );
}

/**
 * MapItemView — placeholder map view shown when an item is opened from the
 * Map page. Detailed map UI (with right sidebar like the Course map editor in
 * Events) arrives in the next round of instructions.
 *
 * Robust init checklist (matches troubleshooting brief):
 *   - explicit width/height on the container (h-full + min-h-0 inside grid)
 *   - call map.resize() on a rAF after construction (handles 0×0 race)
 *   - ResizeObserver on the container so layout shifts trigger resize
 *   - map.on("error", …) to surface engine errors in the console
 *   - map.remove() on unmount to release the WebGL context
 */

import type { MapItem } from "./MapPage";
import { useMapbox, useMapStyle, MAP_STYLES } from "@/lib/mapbox";
import { MapStylePicker } from "@/components/MapStylePicker";
import { useEffect, useRef } from "react";
import type { Map as MapboxMap } from "mapbox-gl";

export function MapItemView({ item }: { item: MapItem }) {
  const mapbox = useMapbox();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapboxMap | null>(null);
  const [style, setStyle] = useMapStyle(`map-item:${item.id}`);

  // Init map once mapbox module + token are ready and the container is in the DOM.
  useEffect(() => {
    if (!mapbox || !containerRef.current || mapRef.current) return;

    let map: MapboxMap;
    try {
      map = new mapbox.default.Map({
        container: containerRef.current,
        style: MAP_STYLES[style].url,
        center: [10.7522, 59.9139],
        zoom: 5,
        attributionControl: false,
      });
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error("[mapbox] Map() constructor threw — likely WebGL unavailable:", err);
      return;
    }

    map.addControl(new mapbox.default.NavigationControl({ showCompass: false }), "bottom-right");
    map.addControl(new mapbox.default.AttributionControl({ compact: true }));

    map.on("error", (e) => {
      // eslint-disable-next-line no-console
      console.error("[mapbox] runtime error:", e?.error ?? e);
    });

    // Force a resize after first paint — handles the case where the container
    // had 0×0 dimensions when the constructor ran (CSS not yet applied).
    const rafId = requestAnimationFrame(() => {
      try { map.resize(); } catch { /* ignore */ }
    });

    // Keep the canvas in sync with any later layout changes (sidebar toggles,
    // window resizes, parent grid track changes, etc.).
    const ro = new ResizeObserver(() => {
      try { map.resize(); } catch { /* ignore */ }
    });
    if (containerRef.current) ro.observe(containerRef.current);

    mapRef.current = map;
    return () => {
      cancelAnimationFrame(rafId);
      ro.disconnect();
      map.remove();
      mapRef.current = null;
    };
    // We intentionally only depend on `mapbox`; style changes are handled below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapbox]);

  // Switch basemap when the user picks a new style.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    map.setStyle(MAP_STYLES[style].url);
  }, [style]);

  return (
    <div className="mt-4 grid h-[calc(100vh-12rem)] min-h-0 gap-4 md:grid-cols-[1fr_320px]">
      <div className="relative h-full min-h-0 overflow-hidden rounded-lg border border-hairline">
        <div ref={containerRef} className="absolute inset-0 z-0 h-full w-full bg-secondary" />
        <div className="absolute right-3 top-3 z-10">
          <MapStylePicker value={style} onChange={setStyle} compact />
        </div>
      </div>
      <aside className="flex flex-col gap-3 rounded-lg border border-hairline bg-card p-4">
        <div>
          <div className="text-[11px] uppercase tracking-wider text-muted-foreground">
            {item.kind}
          </div>
          <h1 className="mt-1 text-lg font-semibold text-ink">{item.name}</h1>
          {item.folder && (
            <div className="mt-0.5 text-xs text-muted-foreground">in {item.folder}</div>
          )}
        </div>
        <div className="rounded-md border border-dashed border-hairline p-4 text-xs text-muted-foreground">
          Detailed sidebar arrives with the next round of instructions.
        </div>
      </aside>
    </div>
  );
}

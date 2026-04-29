/**
 * MapItemView — placeholder map view shown when an item is opened from the
 * Map page. Detailed map UI (with right sidebar like the Course map editor in
 * Events) arrives in the next round of instructions.
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

  useEffect(() => {
    if (!mapbox || !containerRef.current || mapRef.current) return;
    const map = new mapbox.default.Map({
      container: containerRef.current,
      style: MAP_STYLES[style].url,
      center: [10.7522, 59.9139],
      zoom: 5,
      attributionControl: false,
    });
    map.addControl(new mapbox.default.NavigationControl({ showCompass: false }), "bottom-right");
    map.addControl(new mapbox.default.AttributionControl({ compact: true }));
    mapRef.current = map;
    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, [mapbox]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    map.setStyle(MAP_STYLES[style].url);
  }, [style]);

  return (
    <div className="mt-4 grid h-[calc(100vh-12rem)] gap-4 md:grid-cols-[1fr_320px]">
      <div className="relative overflow-hidden rounded-lg border border-hairline">
        <div ref={containerRef} className="absolute inset-0 z-0 bg-secondary" />
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

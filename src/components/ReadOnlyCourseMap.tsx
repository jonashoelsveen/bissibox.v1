import { useEffect, useRef } from "react";
import type { Map as MapboxMap, Marker } from "mapbox-gl";
import type { LatLng, SplitPoint, SplitKind } from "@/components/CourseMapEditor";
import { useMapbox, useMapStyle, MAP_STYLES } from "@/lib/mapbox";
import { MapStylePicker } from "./MapStylePicker";

const LINE_COLOR = "#6366F1";
const LINE_CASING_COLOR = "#FFFFFF";
const PATH_SOURCE = "course-path";
const PATH_LAYER = "course-path-line";
const CASING_LAYER = "course-path-casing";

const KIND_COLOR: Record<SplitKind, string> = {
  start: "#16a34a",
  finish: "#dc2626",
  split: "#2563eb",
  fuel: "#f59e0b",
  marker: "#7c3aed",
};

interface Props {
  path: LatLng[];
  splits: SplitPoint[];
  selectedSplitId?: string | null;
  hoverPosition?: LatLng | null;
  scopeId?: string;
}

function pathToGeoJSON(path: LatLng[]): GeoJSON.FeatureCollection {
  if (path.length < 2) return { type: "FeatureCollection", features: [] };
  return {
    type: "FeatureCollection",
    features: [
      {
        type: "Feature",
        properties: {},
        geometry: {
          type: "LineString",
          // GeoJSON is [lng, lat]
          coordinates: path.map((p) => [p[1], p[0]]),
        },
      },
    ],
  };
}

function splitMarkerEl(sp: SplitPoint, isSel: boolean): HTMLDivElement {
  const el = document.createElement("div");
  const color = KIND_COLOR[sp.kind] ?? "#7c3aed";
  if (sp.kind === "start" || sp.kind === "finish") {
    el.style.width = "28px";
    el.style.height = "34px";
    el.style.filter = isSel
      ? "drop-shadow(0 0 4px rgba(99,102,241,0.9))"
      : "drop-shadow(0 1px 2px rgba(0,0,0,0.4))";
    el.innerHTML = `<svg width="28" height="34" viewBox="0 0 28 34" xmlns="http://www.w3.org/2000/svg">
      <line x1="6" y1="2" x2="6" y2="33" stroke="#1f2937" stroke-width="2" stroke-linecap="round"/>
      <path d="M7 3 L24 6 L20 11 L24 16 L7 13 Z" fill="${color}" stroke="#fff" stroke-width="1.2" stroke-linejoin="round"/>
      <circle cx="6" cy="33" r="2" fill="#1f2937"/>
    </svg>`;
  } else {
    const dim = isSel ? 16 : 12;
    el.style.background = color;
    el.style.border = "2px solid #fff";
    el.style.borderRadius = "9999px";
    el.style.width = `${dim}px`;
    el.style.height = `${dim}px`;
    el.style.boxShadow = "0 1px 3px rgba(0,0,0,0.4)";
  }
  el.title = sp.label;
  return el;
}

export function ReadOnlyCourseMap({ path, splits, selectedSplitId, hoverPosition, scopeId }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapboxMap | null>(null);
  const markersRef = useRef<Marker[]>([]);
  const hoverMarkerRef = useRef<Marker | null>(null);
  const styleLoadedRef = useRef(false);
  const mapbox = useMapbox();
  const [style, setStyle] = useMapStyle(scopeId ? `course-ro:${scopeId}` : null);

  // Init map
  useEffect(() => {
    if (!mapbox || !containerRef.current || mapRef.current) return;
    const center: [number, number] = path[0]
      ? [path[0][1], path[0][0]]
      : splits[0]
        ? [splits[0].position[1], splits[0].position[0]]
        : [10.7522, 59.9139];
    let map: MapboxMap;
    try {
      map = new mapbox.default.Map({
        container: containerRef.current,
        style: MAP_STYLES[style].url,
        center,
        zoom: path.length ? 14 : 12,
        attributionControl: false,
      });
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error("[mapbox] ReadOnlyCourseMap constructor threw:", err);
      return;
    }
    map.addControl(new mapbox.default.NavigationControl({ showCompass: false }), "bottom-right");
    map.addControl(new mapbox.default.AttributionControl({ compact: true }));
    map.on("error", (e) => {
      // eslint-disable-next-line no-console
      console.error("[mapbox] ReadOnlyCourseMap runtime error:", (e as any)?.error ?? e);
    });
    map.on("style.load", () => {
      styleLoadedRef.current = true;
      addCourseLayers(map);
    });
    const rafId = requestAnimationFrame(() => {
      try { map.resize(); } catch { /* ignore */ }
    });
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
      markersRef.current = [];
      hoverMarkerRef.current = null;
      styleLoadedRef.current = false;
    };
  }, [mapbox]); // eslint-disable-line react-hooks/exhaustive-deps

  // Style switching — re-add the course source/layers on style.load.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    styleLoadedRef.current = false;
    map.setStyle(MAP_STYLES[style].url);
  }, [style]);

  // Add (or re-add) the course source + layers, then push current data.
  const addCourseLayers = (map: MapboxMap) => {
    if (!map.getSource(PATH_SOURCE)) {
      map.addSource(PATH_SOURCE, {
        type: "geojson",
        data: pathToGeoJSON(path),
      });
      map.addLayer({
        id: CASING_LAYER,
        type: "line",
        source: PATH_SOURCE,
        layout: { "line-cap": "round", "line-join": "round" },
        paint: { "line-color": LINE_CASING_COLOR, "line-width": 9, "line-opacity": 0.95 },
      });
      map.addLayer({
        id: PATH_LAYER,
        type: "line",
        source: PATH_SOURCE,
        layout: { "line-cap": "round", "line-join": "round" },
        paint: { "line-color": LINE_COLOR, "line-width": 5 },
      });
    }
    if (path.length >= 2) {
      try {
        const bounds = new (mapbox as any).default.LngLatBounds();
        path.forEach((p) => bounds.extend([p[1], p[0]]));
        map.fitBounds(bounds, { padding: 30, duration: 0 });
      } catch {
        /* ignore */
      }
    }
  };

  // Update path data when it changes
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !styleLoadedRef.current) return;
    const src = map.getSource(PATH_SOURCE) as any;
    if (src) src.setData(pathToGeoJSON(path));
  }, [path]);

  // Sync split markers
  useEffect(() => {
    if (!mapbox || !mapRef.current) return;
    markersRef.current.forEach((m) => m.remove());
    markersRef.current = [];
    splits.forEach((sp) => {
      const isSel = sp.id === selectedSplitId;
      const el = splitMarkerEl(sp, isSel);
      const isFlag = sp.kind === "start" || sp.kind === "finish";
      const m = new mapbox.default.Marker({ element: el, anchor: isFlag ? "bottom-left" : "center" })
        .setLngLat([sp.position[1], sp.position[0]])
        .addTo(mapRef.current!);
      markersRef.current.push(m);
    });
  }, [mapbox, splits, selectedSplitId]);

  // Hover marker
  useEffect(() => {
    if (!mapbox || !mapRef.current) return;
    if (hoverMarkerRef.current) {
      hoverMarkerRef.current.remove();
      hoverMarkerRef.current = null;
    }
    if (hoverPosition) {
      const el = document.createElement("div");
      el.style.width = "14px";
      el.style.height = "14px";
      el.style.borderRadius = "9999px";
      el.style.background = "#6366F1";
      el.style.border = "2px solid #fff";
      el.style.boxShadow = "0 0 0 3px rgba(99,102,241,0.35), 0 1px 4px rgba(0,0,0,0.3)";
      el.style.pointerEvents = "none";
      hoverMarkerRef.current = new mapbox.default.Marker({ element: el, anchor: "center" })
        .setLngLat([hoverPosition[1], hoverPosition[0]])
        .addTo(mapRef.current);
    }
  }, [mapbox, hoverPosition]);

  return (
    <div className="relative h-full w-full">
      <div ref={containerRef} className="absolute inset-0 z-0 bg-secondary" />
      <div className="absolute right-3 top-3 z-10">
        <MapStylePicker value={style} onChange={setStyle} compact />
      </div>
    </div>
  );
}

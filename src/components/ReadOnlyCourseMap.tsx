import { useEffect, useRef, useState } from "react";
import type { LatLng, SplitPoint, SplitKind } from "@/components/CourseMapEditor";

const LINE_COLOR = "#6366F1";
const LINE_CASING_COLOR = "#FFFFFF";

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
}

export function ReadOnlyCourseMap({ path, splits, selectedSplitId, hoverPosition }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<any>(null);
  const layerRef = useRef<any[]>([]);
  const hoverMarkerRef = useRef<any>(null);
  const [L, setL] = useState<any>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const leaflet = await import("leaflet");
      if (typeof document !== "undefined" && !document.getElementById("leaflet-css")) {
        const link = document.createElement("link");
        link.id = "leaflet-css";
        link.rel = "stylesheet";
        link.href = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
        document.head.appendChild(link);
      }
      if (!cancelled) setL(leaflet);
    })();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!L || !containerRef.current || mapRef.current) return;
    const center: LatLng = path[0] ?? splits[0]?.position ?? [59.9139, 10.7522];
    const map = L.map(containerRef.current, { zoomControl: false, scrollWheelZoom: true })
      .setView(center, path.length ? 14 : 12);
    L.control.zoom({ position: "bottomright" }).addTo(map);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: "© OpenStreetMap",
      maxZoom: 19,
    }).addTo(map);
    mapRef.current = map;
    return () => {
      map.remove();
      mapRef.current = null;
      layerRef.current = [];
      hoverMarkerRef.current = null;
    };
  }, [L]);

  useEffect(() => {
    if (!L || !mapRef.current) return;
    const map = mapRef.current;
    layerRef.current.forEach((l) => map.removeLayer(l));
    layerRef.current = [];

    if (path.length >= 2) {
      const casing = L.polyline(path, {
        color: LINE_CASING_COLOR,
        weight: 9,
        opacity: 0.95,
        lineCap: "round",
        lineJoin: "round",
        interactive: false,
      }).addTo(map);
      layerRef.current.push(casing);

      const pl = L.polyline(path, {
        color: LINE_COLOR,
        weight: 5,
        opacity: 1,
        lineCap: "round",
        lineJoin: "round",
      }).addTo(map);
      layerRef.current.push(pl);
      try { map.fitBounds(pl.getBounds(), { padding: [30, 30] }); } catch {}
    }

    splits.forEach((sp) => {
      const color = KIND_COLOR[sp.kind] ?? "#7c3aed";
      const isSel = sp.id === selectedSplitId;
      let html: string;
      let size: [number, number];
      let anchor: [number, number];

      if (sp.kind === "start" || sp.kind === "finish") {
        const ringFilter = isSel
          ? "filter:drop-shadow(0 0 4px rgba(99,102,241,0.9));"
          : "filter:drop-shadow(0 1px 2px rgba(0,0,0,0.4));";
        html = `<div style="position:relative;width:28px;height:34px;${ringFilter}">
          <svg width="28" height="34" viewBox="0 0 28 34" xmlns="http://www.w3.org/2000/svg">
            <line x1="6" y1="2" x2="6" y2="33" stroke="#1f2937" stroke-width="2" stroke-linecap="round"/>
            <path d="M7 3 L24 6 L20 11 L24 16 L7 13 Z" fill="${color}" stroke="#fff" stroke-width="1.2" stroke-linejoin="round"/>
            <circle cx="6" cy="33" r="2" fill="#1f2937"/>
          </svg>
        </div>`;
        size = [28, 34];
        anchor = [6, 33];
      } else {
        const dim = isSel ? 16 : 12;
        html = `<div style="background:${color};border:2px solid #fff;border-radius:9999px;width:${dim}px;height:${dim}px;box-shadow:0 1px 3px rgba(0,0,0,0.4);"></div>`;
        size = [dim, dim];
        anchor = [dim / 2, dim / 2];
      }

      const icon = L.divIcon({ html, className: "", iconSize: size, iconAnchor: anchor });
      const m = L.marker(sp.position, { icon }).addTo(map);
      m.bindTooltip(sp.label, { direction: "top", offset: [0, -8] });
      layerRef.current.push(m);
    });
  }, [L, path, splits, selectedSplitId]);

  // Hover marker — synced from elevation curve
  useEffect(() => {
    if (!L || !mapRef.current) return;
    const map = mapRef.current;
    if (hoverMarkerRef.current) {
      map.removeLayer(hoverMarkerRef.current);
      hoverMarkerRef.current = null;
    }
    if (hoverPosition) {
      const html = `<div style="width:14px;height:14px;border-radius:9999px;background:#6366F1;border:2px solid #fff;box-shadow:0 0 0 3px rgba(99,102,241,0.35), 0 1px 4px rgba(0,0,0,0.3);"></div>`;
      const icon = L.divIcon({ html, className: "", iconSize: [14, 14], iconAnchor: [7, 7] });
      hoverMarkerRef.current = L.marker(hoverPosition, { icon, interactive: false, zIndexOffset: 2000 }).addTo(map);
    }
  }, [L, hoverPosition]);

  return <div ref={containerRef} className="h-full w-full" />;
}

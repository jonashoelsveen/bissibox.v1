import { useEffect, useRef, useState } from "react";

const PIN_COLOR = "#dc2626";

interface Props {
  pin: { lat: number; lng: number } | null;
}

export function ReadOnlyPinMap({ pin }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<any>(null);
  const markerRef = useRef<any>(null);
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
    const center: [number, number] = pin ? [pin.lat, pin.lng] : [59.9139, 10.7522];
    const map = L.map(containerRef.current, { zoomControl: false, scrollWheelZoom: true })
      .setView(center, pin ? 14 : 5);
    L.control.zoom({ position: "bottomright" }).addTo(map);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: "© OpenStreetMap",
      maxZoom: 19,
    }).addTo(map);
    mapRef.current = map;
    return () => {
      map.remove();
      mapRef.current = null;
      markerRef.current = null;
    };
  }, [L]);

  useEffect(() => {
    if (!L || !mapRef.current) return;
    const map = mapRef.current;
    if (markerRef.current) {
      map.removeLayer(markerRef.current);
      markerRef.current = null;
    }
    if (pin) {
      const html = `<div style="position:relative;width:24px;height:30px;filter:drop-shadow(0 1px 2px rgba(0,0,0,0.4));">
        <svg width="24" height="30" viewBox="0 0 24 30" xmlns="http://www.w3.org/2000/svg">
          <path d="M12 1 C6 1 2 5 2 11 C2 18 12 29 12 29 C12 29 22 18 22 11 C22 5 18 1 12 1 Z" fill="${PIN_COLOR}" stroke="#fff" stroke-width="1.5"/>
          <circle cx="12" cy="11" r="3.5" fill="#fff"/>
        </svg>
      </div>`;
      const icon = L.divIcon({ html, className: "", iconSize: [24, 30], iconAnchor: [12, 29] });
      markerRef.current = L.marker([pin.lat, pin.lng], { icon }).addTo(map);
      try { map.flyTo([pin.lat, pin.lng], 14, { duration: 0.6 }); } catch {}
    }
  }, [L, pin]);

  return <div ref={containerRef} className="h-full w-full" />;
}

import { useEffect, useRef, useState } from "react";
import { MapPin, Save, Trash2, Search, Loader2, X } from "lucide-react";
import { toast } from "sonner";

interface Props {
  pin: { lat: number; lng: number } | null;
  description: string;
  onChange: (next: { pin: { lat: number; lng: number } | null; description: string }) => void;
  onSave?: () => void;
  saving?: boolean;
  title?: string;
  showDescription?: boolean;
}

/**
 * Simple single-pin map for Meeting / Event types.
 * Click anywhere on the map to drop or move the pin.
 */
export function SimplePinMap({ pin, description, onChange, onSave, saving, title, showDescription = true }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<any>(null);
  const markerRef = useRef<any>(null);
  const [L, setL] = useState<any>(null);
  const [search, setSearch] = useState("");
  const [searching, setSearching] = useState(false);
  const onChangeRef = useRef(onChange);
  const pinRef = useRef(pin);
  const descRef = useRef(description);

  useEffect(() => { onChangeRef.current = onChange; }, [onChange]);
  useEffect(() => { pinRef.current = pin; }, [pin]);
  useEffect(() => { descRef.current = description; }, [description]);

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
    const initial = pin ?? { lat: 59.9139, lng: 10.7522 };
    const map = L.map(containerRef.current, { zoomControl: true }).setView([initial.lat, initial.lng], pin ? 14 : 6);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: "© OpenStreetMap contributors",
      maxZoom: 19,
    }).addTo(map);

    map.on("click", (e: any) => {
      const ll = { lat: e.latlng.lat, lng: e.latlng.lng };
      onChangeRef.current({ pin: ll, description: descRef.current });
    });

    mapRef.current = map;
  }, [L, pin]);

  // Sync marker
  useEffect(() => {
    if (!L || !mapRef.current) return;
    if (markerRef.current) {
      mapRef.current.removeLayer(markerRef.current);
      markerRef.current = null;
    }
    if (pin) {
      const icon = L.divIcon({
        className: "",
        html: `<div style="width:28px;height:28px;transform:translate(-50%,-100%);"><svg viewBox='0 0 24 32' width='28' height='32' xmlns='http://www.w3.org/2000/svg'><path d='M12 0C5.4 0 0 5.4 0 12c0 9 12 20 12 20s12-11 12-20C24 5.4 18.6 0 12 0z' fill='#dc2626' stroke='white' stroke-width='1.5'/><circle cx='12' cy='12' r='4' fill='white'/></svg></div>`,
        iconSize: [28, 32],
        iconAnchor: [14, 32],
      });
      const m = L.marker([pin.lat, pin.lng], { icon, draggable: true }).addTo(mapRef.current);
      m.on("dragend", () => {
        const ll = m.getLatLng();
        onChangeRef.current({ pin: { lat: ll.lat, lng: ll.lng }, description: descRef.current });
      });
      markerRef.current = m;
    }
  }, [L, pin]);

  async function doSearch() {
    if (!search.trim()) return;
    setSearching(true);
    try {
      const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(search)}&limit=1`);
      const data = await res.json();
      if (data?.[0]) {
        const lat = parseFloat(data[0].lat);
        const lng = parseFloat(data[0].lon);
        mapRef.current?.setView([lat, lng], 14);
        onChangeRef.current({ pin: { lat, lng }, description: descRef.current });
      } else {
        toast.error("No results.");
      }
    } catch (e) {
      toast.error("Search failed.");
    } finally {
      setSearching(false);
    }
  }

  return (
    <div className="flex h-full min-h-[480px] flex-col">
      <div className="flex items-center gap-2 border-b border-hairline bg-background px-3 py-2">
        <MapPin className="h-4 w-4 text-muted-foreground" />
        <span className="text-xs text-muted-foreground">{title || "Click map to drop pin"}</span>
        <div className="ml-auto flex items-center gap-2">
          <div className="flex items-center gap-1 rounded-md border border-hairline bg-card px-2">
            <Search className="h-3 w-3 text-muted-foreground" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && doSearch()}
              placeholder="Search address"
              className="w-48 bg-transparent py-1 text-xs text-ink outline-none"
            />
            {searching && <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />}
          </div>
          {pin && (
            <button
              onClick={() => onChangeRef.current({ pin: null, description: descRef.current })}
              className="inline-flex items-center gap-1 rounded-md border border-hairline bg-card px-2 py-1 text-xs text-muted-foreground transition hover:text-destructive"
            >
              <Trash2 className="h-3 w-3" />
              Clear pin
            </button>
          )}
          {onSave && (
            <button
              onClick={onSave}
              disabled={saving}
              className="inline-flex items-center gap-1 rounded-md bg-primary px-2.5 py-1 text-xs font-medium text-primary-foreground transition hover:opacity-90 disabled:opacity-50"
            >
              <Save className="h-3 w-3" />
              {saving ? "Saving…" : "Save"}
            </button>
          )}
        </div>
      </div>

      <div ref={containerRef} className="flex-1" style={{ minHeight: 400 }} />

      {showDescription && (
        <div className="border-t border-hairline bg-background px-3 py-2">
          <label className="block">
            <span className="mono mb-1 block text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
              Pin description (optional)
            </span>
            <textarea
              value={description}
              onChange={(e) => onChangeRef.current({ pin: pinRef.current, description: e.target.value })}
              rows={2}
              placeholder="e.g. Meet at the main entrance, parking on the south side."
              className="w-full resize-none rounded-md border border-hairline bg-card px-3 py-2 text-sm text-ink outline-none focus:border-primary"
            />
          </label>
        </div>
      )}
    </div>
  );
}

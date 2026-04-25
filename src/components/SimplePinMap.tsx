import { useEffect, useRef, useState } from "react";
import { MapPin, Save, Trash2, Search, Loader2, X, Hand, Undo2, Redo2 } from "lucide-react";

type Pin = { lat: number; lng: number } | null;

interface Props {
  pin: Pin;
  description: string;
  name?: string;
  onChange: (next: { pin: Pin; description: string; name: string }) => void;
  onSave?: () => void;
  saving?: boolean;
  title?: string;
  /** When true, shows the description textarea in the right sidebar. */
  showDescription?: boolean;
  /** When true, shows the pin name input (e.g. "Meeting room 3D"). */
  showName?: boolean;
  /** Label noun for the location: "Meeting" or "Event". */
  kindLabel?: string;
}

type Tool = "pan" | "pin";

const PIN_COLOR = "#dc2626";

/**
 * Simple single-pin map for Meeting / Event types.
 * UI mirrors CourseMapEditor: floating top-left toolbar (Pan / Pin / Undo / Redo),
 * centered search bar, top-right Save / Delete, and a right sidebar describing
 * the location (with optional description for Event type).
 */
export function SimplePinMap({
  pin,
  description,
  onChange,
  onSave,
  saving,
  title,
  showDescription = true,
  kindLabel = "location",
}: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<any>(null);
  const markerRef = useRef<any>(null);
  const [L, setL] = useState<any>(null);
  const [tool, setTool] = useState<Tool>("pan");
  const toolRef = useRef<Tool>("pan");

  const onChangeRef = useRef(onChange);
  const pinRef = useRef(pin);
  const descRef = useRef(description);
  useEffect(() => { onChangeRef.current = onChange; }, [onChange]);
  useEffect(() => { pinRef.current = pin; }, [pin]);
  useEffect(() => { descRef.current = description; }, [description]);
  useEffect(() => { toolRef.current = tool; }, [tool]);

  // Undo/redo history
  type Snap = { pin: Pin; description: string };
  const historyRef = useRef<Snap[]>([{ pin, description }]);
  const historyIdxRef = useRef(0);
  const skipNextHistoryRef = useRef(false);
  const [, forceTick] = useState(0);

  const pushHistory = (snap: Snap) => {
    const cur = historyRef.current[historyIdxRef.current];
    if (cur && JSON.stringify(cur) === JSON.stringify(snap)) return;
    const trimmed = historyRef.current.slice(0, historyIdxRef.current + 1);
    trimmed.push(snap);
    if (trimmed.length > 100) trimmed.shift();
    historyRef.current = trimmed;
    historyIdxRef.current = trimmed.length - 1;
    forceTick((n) => n + 1);
  };

  const trackedChange = (next: Snap) => {
    onChangeRef.current(next);
    if (skipNextHistoryRef.current) {
      skipNextHistoryRef.current = false;
      return;
    }
    pushHistory(next);
  };

  const undo = () => {
    if (historyIdxRef.current <= 0) return;
    historyIdxRef.current -= 1;
    const snap = historyRef.current[historyIdxRef.current];
    skipNextHistoryRef.current = true;
    onChangeRef.current(snap);
    forceTick((n) => n + 1);
  };
  const redo = () => {
    if (historyIdxRef.current >= historyRef.current.length - 1) return;
    historyIdxRef.current += 1;
    const snap = historyRef.current[historyIdxRef.current];
    skipNextHistoryRef.current = true;
    onChangeRef.current(snap);
    forceTick((n) => n + 1);
  };
  const canUndo = historyIdxRef.current > 0;
  const canRedo = historyIdxRef.current < historyRef.current.length - 1;

  // Location search
  type GeoResult = { display_name: string; lat: string; lon: string; boundingbox?: [string, string, string, string]; place_id: number };
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<GeoResult[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const searchAbortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    const q = searchQuery.trim();
    if (q.length < 3) {
      setSearchResults([]);
      setSearchLoading(false);
      return;
    }
    setSearchLoading(true);
    const t = setTimeout(async () => {
      searchAbortRef.current?.abort();
      const ctrl = new AbortController();
      searchAbortRef.current = ctrl;
      try {
        const url = `https://nominatim.openstreetmap.org/search?format=json&addressdetails=0&limit=6&q=${encodeURIComponent(q)}`;
        const res = await fetch(url, { signal: ctrl.signal, headers: { "Accept-Language": navigator.language || "en" } });
        const data: GeoResult[] = await res.json();
        setSearchResults(data);
        setSearchOpen(true);
      } catch (err: any) {
        if (err?.name !== "AbortError") setSearchResults([]);
      } finally {
        setSearchLoading(false);
      }
    }, 300);
    return () => clearTimeout(t);
  }, [searchQuery]);

  const flyToResult = (r: GeoResult) => {
    const map = mapRef.current;
    if (!map) return;
    if (r.boundingbox && r.boundingbox.length === 4) {
      const [s, n, w, e] = r.boundingbox;
      map.flyToBounds(
        [
          [parseFloat(s), parseFloat(w)],
          [parseFloat(n), parseFloat(e)],
        ],
        { duration: 0.8, maxZoom: 16 },
      );
    } else {
      map.flyTo([parseFloat(r.lat), parseFloat(r.lon)], 14, { duration: 0.8 });
    }
    setSearchQuery(r.display_name.split(",")[0] ?? "");
    setSearchOpen(false);
  };

  // Load Leaflet
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

  // Init map
  useEffect(() => {
    if (!L || !containerRef.current || mapRef.current) return;
    const initial = pinRef.current ?? { lat: 59.9139, lng: 10.7522 };
    const map = L.map(containerRef.current, { zoomControl: false }).setView(
      [initial.lat, initial.lng],
      pinRef.current ? 14 : 6,
    );
    L.control.zoom({ position: "bottomright" }).addTo(map);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: "© OpenStreetMap",
      maxZoom: 19,
    }).addTo(map);

    map.on("click", (e: any) => {
      if (toolRef.current !== "pin") return;
      const ll = { lat: e.latlng.lat, lng: e.latlng.lng };
      trackedChange({ pin: ll, description: descRef.current });
    });

    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
      markerRef.current = null;
    };
  }, [L]);

  // Cursor
  useEffect(() => {
    if (!containerRef.current) return;
    containerRef.current.style.cursor = tool === "pin" ? "crosshair" : "";
  }, [tool, L]);

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
        html: `<div style="width:28px;height:32px;"><svg viewBox='0 0 24 32' width='28' height='32' xmlns='http://www.w3.org/2000/svg'><path d='M12 0C5.4 0 0 5.4 0 12c0 9 12 20 12 20s12-11 12-20C24 5.4 18.6 0 12 0z' fill='${PIN_COLOR}' stroke='white' stroke-width='1.5'/><circle cx='12' cy='12' r='4' fill='white'/></svg></div>`,
        iconSize: [28, 32],
        iconAnchor: [14, 32],
      });
      const m = L.marker([pin.lat, pin.lng], { icon, draggable: true }).addTo(mapRef.current);
      m.on("dragend", () => {
        const ll = m.getLatLng();
        trackedChange({ pin: { lat: ll.lat, lng: ll.lng }, description: descRef.current });
      });
      markerRef.current = m;
    }
  }, [L, pin]);

  const clearPin = () => trackedChange({ pin: null, description: descRef.current });

  const sidebarTitle = title || `${kindLabel} location`;
  const noun = kindLabel || "location";

  return (
    <div className="flex h-full w-full flex-1">
      {/* Left: map */}
      <div className="relative min-h-[480px] flex-1">
        <div ref={containerRef} className="absolute inset-0 z-0 bg-secondary" />

        {/* Top-left: toolbar + search (mirrors CourseMapEditor) */}
        <div className="pointer-events-none absolute left-4 top-4 z-[400] flex flex-col gap-2">
          <div className="pointer-events-auto flex flex-wrap items-center gap-1 rounded-xl border border-hairline bg-card/95 p-1.5 shadow-md backdrop-blur">
            <ToolBtn active={tool === "pan"} onClick={() => setTool("pan")} title="Pan & select">
              <Hand className="h-4 w-4" />
              <span className="text-sm">Pan</span>
            </ToolBtn>
            <ToolBtn active={tool === "pin"} onClick={() => setTool("pin")} title="Place pin">
              <MapPin className="h-4 w-4" style={{ color: PIN_COLOR }} />
              <span className="text-sm">Pin</span>
            </ToolBtn>
            <span className="mx-1 h-5 w-px bg-hairline" />
            <ToolBtn onClick={undo} title="Undo" disabled={!canUndo}>
              <Undo2 className="h-4 w-4" />
            </ToolBtn>
            <ToolBtn onClick={redo} title="Redo" disabled={!canRedo}>
              <Redo2 className="h-4 w-4" />
            </ToolBtn>
          </div>

          <div className="pointer-events-auto relative w-[320px] max-w-[calc(100vw-2rem)]">
            <div className="flex h-[42px] items-center gap-2 rounded-xl border border-hairline bg-card/95 px-3 shadow-md backdrop-blur">
              {searchLoading ? (
                <Loader2 className="h-4 w-4 shrink-0 animate-spin text-muted-foreground" />
              ) : (
                <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
              )}
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onFocus={() => searchResults.length > 0 && setSearchOpen(true)}
                onBlur={() => setTimeout(() => setSearchOpen(false), 150)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && searchResults[0]) {
                    e.preventDefault();
                    flyToResult(searchResults[0]);
                  } else if (e.key === "Escape") {
                    setSearchOpen(false);
                    (e.target as HTMLInputElement).blur();
                  }
                }}
                placeholder="Search location, city, address…"
                className="h-full flex-1 bg-transparent text-sm text-ink outline-none placeholder:text-muted-foreground"
              />
              {searchQuery && (
                <button
                  onClick={() => {
                    setSearchQuery("");
                    setSearchResults([]);
                    setSearchOpen(false);
                  }}
                  className="shrink-0 rounded p-0.5 text-muted-foreground hover:bg-secondary hover:text-ink"
                  title="Clear"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
            {searchOpen && searchResults.length > 0 && (
              <div className="absolute left-0 right-0 top-[calc(100%+4px)] max-h-[280px] overflow-y-auto rounded-xl border border-hairline bg-card shadow-lg backdrop-blur">
                {searchResults.map((r) => (
                  <button
                    key={r.place_id}
                    onMouseDown={(e) => {
                      e.preventDefault();
                      flyToResult(r);
                    }}
                    className="flex w-full items-start gap-2 border-b border-hairline px-3 py-2 text-left text-sm last:border-b-0 hover:bg-secondary"
                  >
                    <Search className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                    <span className="line-clamp-2 text-ink">{r.display_name}</span>
                  </button>
                ))}
              </div>
            )}
            {searchOpen && !searchLoading && searchQuery.trim().length >= 3 && searchResults.length === 0 && (
              <div className="absolute left-0 right-0 top-[calc(100%+4px)] rounded-xl border border-hairline bg-card px-3 py-2 text-sm text-muted-foreground shadow-lg">
                No locations found
              </div>
            )}
          </div>
        </div>

        {/* Bottom-left: status (mirrors CourseMapEditor) */}
        <div className="pointer-events-none absolute bottom-4 left-4 z-[400] rounded-md border border-hairline bg-card/95 px-3 py-1.5 text-xs text-muted-foreground shadow-sm backdrop-blur">
          <span className="text-ink">{sidebarTitle} · </span>
          <span className="num">{pin ? 1 : 0}</span> pin
          {tool === "pin" && (
            <span className="ml-2 text-primary">· click map to place pin</span>
          )}
        </div>

        {/* Top-right: Save / Delete (mirrors CourseMapEditor) */}
        {(onSave || pin) && (
          <div className="pointer-events-none absolute right-4 top-4 z-[400] flex gap-2">
            {pin && (
              <button
                onClick={clearPin}
                className="pointer-events-auto inline-flex items-center gap-1.5 rounded-md border border-hairline bg-card/95 px-3 py-1.5 text-xs text-muted-foreground shadow-sm backdrop-blur hover:text-destructive"
              >
                <Trash2 className="h-3.5 w-3.5" /> Delete pin
              </button>
            )}
            {onSave && (
              <button
                onClick={onSave}
                disabled={saving}
                className="pointer-events-auto inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground shadow-sm hover:opacity-90 disabled:opacity-50"
              >
                <Save className="h-3.5 w-3.5" /> {saving ? "Saving…" : "Save map"}
              </button>
            )}
          </div>
        )}

        {!L && (
          <div className="absolute inset-0 z-[500] flex items-center justify-center bg-secondary text-sm text-muted-foreground">
            Loading map…
          </div>
        )}
      </div>

      {/* Right sidebar — mirrors CourseMapEditor sidebar */}
      <aside className="w-96 shrink-0 overflow-y-auto border-l border-hairline bg-background px-3 py-3">
        <div className="border-b border-hairline px-1 pb-3">
          <p className="mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">Location</p>
          <p className="mt-0.5 text-sm text-ink">{sidebarTitle}</p>
        </div>

        <div className="flex flex-col gap-3 pt-3">
          {!pin ? (
            <div className="rounded-md border border-dashed border-hairline bg-card/50 px-3 py-6 text-center">
              <MapPin className="mx-auto mb-2 h-5 w-5 text-muted-foreground" />
              <p className="text-sm text-ink">Select location for this {noun}.</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Pick the <span className="text-ink">Pin</span> tool, then click anywhere on the map.
              </p>
            </div>
          ) : (
            <div className="overflow-hidden rounded-md border border-primary bg-primary/5">
              <div className="flex items-start gap-2 px-3 py-3">
                <span
                  className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full"
                  style={{ background: PIN_COLOR }}
                >
                  <MapPin className="h-3 w-3 text-white" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-ink">{noun} pin</p>
                  <p className="mono mt-0.5 text-[10px] text-muted-foreground">
                    {pin.lat.toFixed(5)}, {pin.lng.toFixed(5)}
                  </p>
                </div>
                <button
                  onClick={clearPin}
                  className="rounded p-1 text-muted-foreground hover:text-destructive"
                  title="Remove pin"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>

              {showDescription && (
                <div className="border-t border-hairline bg-card/50 px-3 py-3">
                  <label className="block">
                    <span className="mono mb-1 block text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
                      Pin description (optional)
                    </span>
                    <textarea
                      value={description}
                      onChange={(e) =>
                        trackedChange({ pin: pinRef.current, description: e.target.value })
                      }
                      rows={3}
                      placeholder="e.g. Meet at the main entrance, parking on the south side."
                      className="w-full resize-none rounded-md border border-hairline bg-card px-3 py-2 text-sm text-ink outline-none focus:border-primary"
                    />
                  </label>
                </div>
              )}
            </div>
          )}
        </div>
      </aside>
    </div>
  );
}

function ToolBtn({
  active,
  onClick,
  title,
  children,
  disabled,
}: {
  active?: boolean;
  onClick: () => void;
  title: string;
  children: React.ReactNode;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      disabled={disabled}
      className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 transition disabled:cursor-not-allowed disabled:opacity-40 ${
        active ? "bg-primary text-primary-foreground" : "text-ink hover:bg-secondary"
      }`}
    >
      {children}
    </button>
  );
}

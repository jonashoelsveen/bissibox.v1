import { useEffect, useRef, useState } from "react";
import { Pencil, MapPin, Droplet, Flag, Trash2, Save, X, Eraser } from "lucide-react";

export type LatLng = [number, number];
export type SplitKind = "split" | "fuel" | "start" | "finish" | "marker";
export interface SplitPoint {
  id: string;
  kind: SplitKind;
  label: string;
  position: LatLng;
}

interface Props {
  path: LatLng[];
  splits: SplitPoint[];
  onChange: (next: { path: LatLng[]; splits: SplitPoint[] }) => void;
  onSave?: () => void;
  onDelete?: () => void;
  saving?: boolean;
  title?: string;
}

type Tool = "pan" | "draw" | "split" | "fuel" | "marker";

const KIND_META: Record<SplitKind, { color: string; label: string; icon: typeof MapPin }> = {
  start: { color: "#16a34a", label: "Start", icon: Flag },
  finish: { color: "#dc2626", label: "Finish", icon: Flag },
  split: { color: "#2563eb", label: "Split", icon: MapPin },
  fuel: { color: "#f59e0b", label: "Fuel", icon: Droplet },
  marker: { color: "#7c3aed", label: "Marker", icon: MapPin },
};

export function CourseMapEditor({ path, splits, onChange, onSave, onDelete, saving, title }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<any>(null);
  const polylineRef = useRef<any>(null);
  const markersRef = useRef<any[]>([]);
  const [L, setL] = useState<any>(null);
  const [tool, setTool] = useState<Tool>("pan");
  const toolRef = useRef<Tool>("pan");
  const pathRef = useRef<LatLng[]>(path);
  const splitsRef = useRef<SplitPoint[]>(splits);
  const onChangeRef = useRef(onChange);

  useEffect(() => {
    toolRef.current = tool;
  }, [tool]);
  useEffect(() => {
    pathRef.current = path;
  }, [path]);
  useEffect(() => {
    splitsRef.current = splits;
  }, [splits]);
  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  // Load Leaflet client-side only
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const leaflet = await import("leaflet");
      // CSS
      if (typeof document !== "undefined" && !document.getElementById("leaflet-css")) {
        const link = document.createElement("link");
        link.id = "leaflet-css";
        link.rel = "stylesheet";
        link.href = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
        document.head.appendChild(link);
      }
      if (!cancelled) setL(leaflet);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Init map
  useEffect(() => {
    if (!L || !containerRef.current || mapRef.current) return;
    const center: LatLng = path[0] ?? [59.9139, 10.7522]; // Oslo default
    const map = L.map(containerRef.current, { zoomControl: true }).setView(center, path.length ? 14 : 12);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: "© OpenStreetMap",
      maxZoom: 19,
    }).addTo(map);
    mapRef.current = map;

    map.on("click", (e: any) => {
      const t = toolRef.current;
      const ll: LatLng = [e.latlng.lat, e.latlng.lng];
      if (t === "draw") {
        const next = [...pathRef.current, ll];
        onChangeRef.current({ path: next, splits: splitsRef.current });
      } else if (t === "split" || t === "fuel" || t === "marker") {
        const kind: SplitKind = t === "split" ? "split" : t === "fuel" ? "fuel" : "marker";
        const same = splitsRef.current.filter((s) => s.kind === kind).length;
        const sp: SplitPoint = {
          id: crypto.randomUUID(),
          kind,
          label: kind === "split" ? `Split ${same + 1}` : kind === "fuel" ? `Fuel ${same + 1}` : `Marker ${same + 1}`,
          position: ll,
        };
        onChangeRef.current({ path: pathRef.current, splits: [...splitsRef.current, sp] });
      }
    });

    return () => {
      map.remove();
      mapRef.current = null;
      polylineRef.current = null;
      markersRef.current = [];
    };
  }, [L]);

  // Render path
  useEffect(() => {
    if (!L || !mapRef.current) return;
    if (polylineRef.current) {
      mapRef.current.removeLayer(polylineRef.current);
      polylineRef.current = null;
    }
    if (path.length >= 2) {
      polylineRef.current = L.polyline(path, { color: "#2563eb", weight: 4, opacity: 0.85 }).addTo(mapRef.current);
    } else if (path.length === 1) {
      polylineRef.current = L.circleMarker(path[0], { radius: 5, color: "#2563eb" }).addTo(mapRef.current);
    }
  }, [L, path]);

  // Render split markers
  useEffect(() => {
    if (!L || !mapRef.current) return;
    markersRef.current.forEach((m) => mapRef.current.removeLayer(m));
    markersRef.current = [];
    splits.forEach((s) => {
      const meta = KIND_META[s.kind];
      const html = `<div style="background:${meta.color};color:#fff;border:2px solid #fff;border-radius:9999px;width:22px;height:22px;display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:600;box-shadow:0 1px 4px rgba(0,0,0,0.3)">${s.label.match(/\d+/)?.[0] ?? "•"}</div>`;
      const icon = L.divIcon({ html, className: "", iconSize: [22, 22], iconAnchor: [11, 11] });
      const marker = L.marker(s.position, { icon }).addTo(mapRef.current);
      marker.bindTooltip(`${meta.label} · ${s.label}`, { direction: "top" });
      marker.on("click", () => {
        if (toolRef.current === "pan") return;
        // Remove on click when in any add tool
        onChangeRef.current({
          path: pathRef.current,
          splits: splitsRef.current.filter((x) => x.id !== s.id),
        });
      });
      markersRef.current.push(marker);
    });
  }, [L, splits]);

  const undoLastPoint = () => {
    if (!path.length) return;
    onChange({ path: path.slice(0, -1), splits });
  };
  const clearAll = () => {
    onChange({ path: [], splits: [] });
  };

  return (
    <div className="relative h-full w-full">
      <div ref={containerRef} className="absolute inset-0 z-0 bg-secondary" />

      {/* Floating toolbar */}
      <div className="pointer-events-none absolute left-4 top-4 z-[400] flex flex-col gap-2">
        <div className="pointer-events-auto flex items-center gap-1 rounded-lg border border-hairline bg-card/95 p-1 shadow-md backdrop-blur">
          <ToolBtn active={tool === "pan"} onClick={() => setTool("pan")} title="Pan">
            <span className="px-1 text-xs">Pan</span>
          </ToolBtn>
          <ToolBtn active={tool === "draw"} onClick={() => setTool("draw")} title="Draw course">
            <Pencil className="h-3.5 w-3.5" />
            <span className="text-xs">Draw</span>
          </ToolBtn>
          <ToolBtn active={tool === "split"} onClick={() => setTool("split")} title="Add split">
            <MapPin className="h-3.5 w-3.5" style={{ color: KIND_META.split.color }} />
            <span className="text-xs">Split</span>
          </ToolBtn>
          <ToolBtn active={tool === "fuel"} onClick={() => setTool("fuel")} title="Add fuel station">
            <Droplet className="h-3.5 w-3.5" style={{ color: KIND_META.fuel.color }} />
            <span className="text-xs">Fuel</span>
          </ToolBtn>
          <ToolBtn active={tool === "marker"} onClick={() => setTool("marker")} title="Add marker">
            <MapPin className="h-3.5 w-3.5" style={{ color: KIND_META.marker.color }} />
            <span className="text-xs">Marker</span>
          </ToolBtn>
        </div>

        {(path.length > 0 || splits.length > 0) && (
          <div className="pointer-events-auto flex items-center gap-1 rounded-lg border border-hairline bg-card/95 p-1 shadow-md backdrop-blur">
            <ToolBtn onClick={undoLastPoint} title="Undo last point">
              <span className="text-xs">Undo</span>
            </ToolBtn>
            <ToolBtn onClick={clearAll} title="Clear">
              <Eraser className="h-3.5 w-3.5" />
              <span className="text-xs">Clear</span>
            </ToolBtn>
          </div>
        )}
      </div>

      {/* Status bar */}
      <div className="pointer-events-none absolute bottom-4 left-4 z-[400] rounded-md border border-hairline bg-card/95 px-3 py-1.5 text-xs text-muted-foreground shadow-sm backdrop-blur">
        {title && <span className="text-ink">{title} · </span>}
        <span className="num">{path.length}</span> pts ·{" "}
        <span className="num">{splits.length}</span> markers
        {tool !== "pan" && <span className="ml-2 text-primary">· click map to add {tool}</span>}
      </div>

      {/* Save / delete */}
      {(onSave || onDelete) && (
        <div className="pointer-events-none absolute right-4 top-4 z-[400] flex gap-2">
          {onDelete && (path.length > 0 || splits.length > 0) && (
            <button
              onClick={onDelete}
              className="pointer-events-auto inline-flex items-center gap-1.5 rounded-md border border-hairline bg-card/95 px-3 py-1.5 text-xs text-muted-foreground shadow-sm backdrop-blur hover:text-destructive"
            >
              <Trash2 className="h-3.5 w-3.5" /> Delete map
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
  );
}

function ToolBtn({
  active,
  onClick,
  title,
  children,
}: {
  active?: boolean;
  onClick: () => void;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      className={`inline-flex items-center gap-1 rounded-md px-2 py-1 transition ${
        active ? "bg-primary text-primary-foreground" : "text-ink hover:bg-secondary"
      }`}
    >
      {children}
    </button>
  );
}

export function emptySplit(): SplitPoint {
  return { id: crypto.randomUUID(), kind: "marker", label: "Marker", position: [0, 0] };
}

export { X };

import { useEffect, useRef, useState } from "react";
import { Pencil, MapPin, Droplet, Flag, Trash2, Save, X, Eraser, Hand, Timer } from "lucide-react";

export type LatLng = [number, number];
export type SplitKind = "split" | "fuel" | "start" | "finish" | "marker";
export interface SplitPoint {
  id: string;
  kind: SplitKind;
  label: string;
  position: LatLng;
  note?: string;
}

interface Props {
  path: LatLng[];
  splits: SplitPoint[];
  onChange: (next: { path: LatLng[]; splits: SplitPoint[] }) => void;
  onSave?: () => void;
  onDelete?: () => void;
  saving?: boolean;
  title?: string;
  /** Externally selected split (for highlight + popup). */
  selectedSplitId?: string | null;
  onSelectSplit?: (id: string | null) => void;
}

type Tool = "pan" | "draw" | "split" | "fuel" | "marker";

// Periwinkle purple for the drawing line
const LINE_COLOR = "#8B8FE8";

const KIND_META: Record<SplitKind, { color: string; label: string }> = {
  start: { color: "#16a34a", label: "Start" },
  finish: { color: "#dc2626", label: "Finish" },
  split: { color: "#2563eb", label: "Split" },
  fuel: { color: "#f59e0b", label: "Fuel" },
  marker: { color: "#7c3aed", label: "Marker" },
};

// Pen SVG cursor (encoded) — simple pencil tip
const PEN_CURSOR =
  "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='28' height='28' viewBox='0 0 24 24' fill='none' stroke='%238B8FE8' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'><path d='M12 19l7-7 3 3-7 7-3-3z'/><path d='M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z'/><path d='M2 2l7.586 7.586'/><circle cx='11' cy='11' r='2'/></svg>\") 2 26, crosshair";

export function CourseMapEditor({
  path,
  splits,
  onChange,
  onSave,
  onDelete,
  saving,
  title,
  selectedSplitId,
  onSelectSplit,
}: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<any>(null);
  const polylineRef = useRef<any>(null);
  const markersRef = useRef<Record<string, any>>({});
  const [L, setL] = useState<any>(null);
  const [tool, setTool] = useState<Tool>("pan");
  const toolRef = useRef<Tool>("pan");
  const pathRef = useRef<LatLng[]>(path);
  const splitsRef = useRef<SplitPoint[]>(splits);
  const onChangeRef = useRef(onChange);
  const onSelectRef = useRef(onSelectSplit);

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
  useEffect(() => {
    onSelectRef.current = onSelectSplit;
  }, [onSelectSplit]);

  // Load Leaflet client-side only
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
    return () => {
      cancelled = true;
    };
  }, []);

  // Init map — zoom control in bottom-right
  useEffect(() => {
    if (!L || !containerRef.current || mapRef.current) return;
    const center: LatLng = path[0] ?? [59.9139, 10.7522];
    const map = L.map(containerRef.current, { zoomControl: false }).setView(center, path.length ? 14 : 12);
    L.control.zoom({ position: "bottomright" }).addTo(map);
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
          note: "",
        };
        onChangeRef.current({ path: pathRef.current, splits: [...splitsRef.current, sp] });
        onSelectRef.current?.(sp.id);
      } else {
        // pan: clicking empty map clears selection
        onSelectRef.current?.(null);
      }
    });

    return () => {
      map.remove();
      mapRef.current = null;
      polylineRef.current = null;
      markersRef.current = {};
    };
  }, [L]);

  // Update cursor on map container based on tool
  useEffect(() => {
    if (!containerRef.current) return;
    if (tool === "draw") containerRef.current.style.cursor = PEN_CURSOR;
    else if (tool === "split" || tool === "fuel" || tool === "marker")
      containerRef.current.style.cursor = "crosshair";
    else containerRef.current.style.cursor = "";
  }, [tool, L]);

  // Render path
  useEffect(() => {
    if (!L || !mapRef.current) return;
    if (polylineRef.current) {
      mapRef.current.removeLayer(polylineRef.current);
      polylineRef.current = null;
    }
    if (path.length >= 2) {
      polylineRef.current = L.polyline(path, { color: LINE_COLOR, weight: 5, opacity: 0.9 }).addTo(mapRef.current);
    } else if (path.length === 1) {
      polylineRef.current = L.circleMarker(path[0], { radius: 5, color: LINE_COLOR }).addTo(mapRef.current);
    }
  }, [L, path]);

  // Render split markers — selected gets ring
  useEffect(() => {
    if (!L || !mapRef.current) return;
    Object.values(markersRef.current).forEach((m) => mapRef.current.removeLayer(m));
    markersRef.current = {};
    splits.forEach((s) => {
      const meta = KIND_META[s.kind];
      const isSelected = s.id === selectedSplitId;
      const ring = isSelected ? "box-shadow:0 0 0 4px rgba(139,143,232,0.55), 0 1px 4px rgba(0,0,0,0.3);" : "box-shadow:0 1px 4px rgba(0,0,0,0.3);";
      const html = `<div style="background:${meta.color};color:#fff;border:2px solid #fff;border-radius:9999px;width:24px;height:24px;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:600;${ring}">${s.label.match(/\d+/)?.[0] ?? "•"}</div>`;
      const icon = L.divIcon({ html, className: "", iconSize: [24, 24], iconAnchor: [12, 12] });
      const marker = L.marker(s.position, { icon }).addTo(mapRef.current);
      marker.bindTooltip(`${meta.label} · ${s.label}`, { direction: "top" });
      marker.on("click", (ev: any) => {
        ev.originalEvent?.stopPropagation?.();
        if (toolRef.current === "pan") {
          onSelectRef.current?.(s.id);
        } else {
          // any add tool removes on click
          onChangeRef.current({
            path: pathRef.current,
            splits: splitsRef.current.filter((x) => x.id !== s.id),
          });
        }
      });
      markersRef.current[s.id] = marker;
    });
  }, [L, splits, selectedSplitId]);

  // Pan to selected split when changed externally
  useEffect(() => {
    if (!selectedSplitId || !mapRef.current) return;
    const sp = splits.find((s) => s.id === selectedSplitId);
    if (sp) mapRef.current.panTo(sp.position);
  }, [selectedSplitId, splits]);

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

      {/* Floating toolbar — slightly larger */}
      <div className="pointer-events-none absolute left-4 top-4 z-[400] flex flex-col gap-2">
        <div className="pointer-events-auto flex items-center gap-1 rounded-xl border border-hairline bg-card/95 p-1.5 shadow-md backdrop-blur">
          <ToolBtn active={tool === "pan"} onClick={() => setTool("pan")} title="Pan">
            <Hand className="h-4 w-4" />
            <span className="text-sm">Pan</span>
          </ToolBtn>
          <ToolBtn active={tool === "draw"} onClick={() => setTool("draw")} title="Draw course">
            <Pencil className="h-4 w-4" />
            <span className="text-sm">Draw</span>
          </ToolBtn>
          <ToolBtn active={tool === "split"} onClick={() => setTool("split")} title="Add split">
            <Timer className="h-4 w-4" style={{ color: KIND_META.split.color }} />
            <span className="text-sm">Split</span>
          </ToolBtn>
          <ToolBtn active={tool === "fuel"} onClick={() => setTool("fuel")} title="Add fuel station">
            <Droplet className="h-4 w-4" style={{ color: KIND_META.fuel.color }} />
            <span className="text-sm">Fuel</span>
          </ToolBtn>
          <ToolBtn active={tool === "marker"} onClick={() => setTool("marker")} title="Add marker">
            <MapPin className="h-4 w-4" style={{ color: KIND_META.marker.color }} />
            <span className="text-sm">Marker</span>
          </ToolBtn>
        </div>

        {(path.length > 0 || splits.length > 0) && (
          <div className="pointer-events-auto flex items-center gap-1 rounded-xl border border-hairline bg-card/95 p-1.5 shadow-md backdrop-blur">
            <ToolBtn onClick={undoLastPoint} title="Undo last point">
              <span className="text-sm">Undo</span>
            </ToolBtn>
            <ToolBtn onClick={clearAll} title="Clear">
              <Eraser className="h-4 w-4" />
              <span className="text-sm">Clear</span>
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
      className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 transition ${
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

import { useEffect, useRef, useState } from "react";
import { Pencil, Droplet, Flag, Trash2, Save, Eraser, Hand, Timer, Undo2, Redo2 } from "lucide-react";

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
  selectedSplitId?: string | null;
  onSelectSplit?: (id: string | null) => void;
}

type Tool = "pan" | "draw" | "split" | "fuel" | "marker" | "start" | "finish";

// Periwinkle purple for the drawing line
const LINE_COLOR = "#8B8FE8";

const KIND_META: Record<SplitKind, { color: string; label: string }> = {
  start: { color: "#16a34a", label: "Start" },
  finish: { color: "#dc2626", label: "Finish" },
  split: { color: "#2563eb", label: "Split" },
  fuel: { color: "#f59e0b", label: "Fuel" },
  marker: { color: "#7c3aed", label: "Marker" },
};

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
  const splitMarkersRef = useRef<Record<string, any>>({});
  const vertexMarkersRef = useRef<any[]>([]);
  const midMarkersRef = useRef<any[]>([]);
  const [L, setL] = useState<any>(null);
  const [tool, setTool] = useState<Tool>("pan");
  const toolRef = useRef<Tool>("pan");
  const pathRef = useRef<LatLng[]>(path);
  const splitsRef = useRef<SplitPoint[]>(splits);
  const onChangeRef = useRef(onChange);
  const onSelectRef = useRef(onSelectSplit);

  useEffect(() => { toolRef.current = tool; }, [tool]);
  useEffect(() => { pathRef.current = path; }, [path]);
  useEffect(() => { splitsRef.current = splits; }, [splits]);
  useEffect(() => { onChangeRef.current = onChange; }, [onChange]);
  useEffect(() => { onSelectRef.current = onSelectSplit; }, [onSelectSplit]);

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
        onChangeRef.current({ path: [...pathRef.current, ll], splits: splitsRef.current });
      } else if (t === "split" || t === "fuel" || t === "marker" || t === "start" || t === "finish") {
        const kind: SplitKind = t as SplitKind;
        // Start/Finish are unique — replace existing
        if (kind === "start" || kind === "finish") {
          const filtered = splitsRef.current.filter((s) => s.kind !== kind);
          const sp: SplitPoint = {
            id: crypto.randomUUID(),
            kind,
            label: kind === "start" ? "Start" : "Finish",
            position: ll,
          };
          onChangeRef.current({ path: pathRef.current, splits: [...filtered, sp] });
        } else {
          const same = splitsRef.current.filter((s) => s.kind === kind).length;
          const sp: SplitPoint = {
            id: crypto.randomUUID(),
            kind,
            label:
              kind === "split" ? `Split ${same + 1}` : kind === "fuel" ? `Fuel ${same + 1}` : `Marker ${same + 1}`,
            position: ll,
          };
          onChangeRef.current({ path: pathRef.current, splits: [...splitsRef.current, sp] });
          onSelectRef.current?.(sp.id);
        }
      } else {
        onSelectRef.current?.(null);
      }
    });

    return () => {
      map.remove();
      mapRef.current = null;
      polylineRef.current = null;
      splitMarkersRef.current = {};
      vertexMarkersRef.current = [];
      midMarkersRef.current = [];
    };
  }, [L]);

  // Cursor
  useEffect(() => {
    if (!containerRef.current) return;
    if (tool === "draw") containerRef.current.style.cursor = PEN_CURSOR;
    else if (tool !== "pan") containerRef.current.style.cursor = "crosshair";
    else containerRef.current.style.cursor = "";
  }, [tool, L]);

  // Render polyline + vertex/midpoint handles (Google My Maps style)
  useEffect(() => {
    if (!L || !mapRef.current) return;
    const map = mapRef.current;

    // Clear previous
    if (polylineRef.current) {
      map.removeLayer(polylineRef.current);
      polylineRef.current = null;
    }
    vertexMarkersRef.current.forEach((m) => map.removeLayer(m));
    midMarkersRef.current.forEach((m) => map.removeLayer(m));
    vertexMarkersRef.current = [];
    midMarkersRef.current = [];

    if (path.length >= 2) {
      const pl = L.polyline(path, { color: LINE_COLOR, weight: 5, opacity: 0.9, interactive: tool === "draw" }).addTo(map);
      polylineRef.current = pl;

      // Click on the line itself in draw mode → insert vertex at click location (closest segment)
      if (tool === "draw") {
        pl.on("click", (e: any) => {
          (L as any).DomEvent.stopPropagation(e);
          const ll: LatLng = [e.latlng.lat, e.latlng.lng];
          const insertIdx = findInsertIndex(path, ll);
          const next = [...path];
          next.splice(insertIdx, 0, ll);
          onChangeRef.current({ path: next, splits: splitsRef.current });
        });
      }
    } else if (path.length === 1) {
      polylineRef.current = L.circleMarker(path[0], { radius: 5, color: LINE_COLOR }).addTo(map);
    }

    // Show drag handles only in draw mode
    if (tool === "draw" && path.length > 0) {
      const vertexHtml = `<div style="background:#fff;border:2px solid ${LINE_COLOR};border-radius:9999px;width:12px;height:12px;box-shadow:0 1px 3px rgba(0,0,0,0.3);"></div>`;
      const vertexIcon = L.divIcon({ html: vertexHtml, className: "", iconSize: [12, 12], iconAnchor: [6, 6] });

      path.forEach((pt, idx) => {
        const m = L.marker(pt, { icon: vertexIcon, draggable: true, zIndexOffset: 1000 }).addTo(map);
        m.on("drag", (ev: any) => {
          const ll = ev.target.getLatLng();
          // live update polyline only (avoid React re-render flood)
          if (polylineRef.current && polylineRef.current.setLatLngs) {
            const live = [...pathRef.current];
            live[idx] = [ll.lat, ll.lng];
            polylineRef.current.setLatLngs(live);
          }
        });
        m.on("dragend", (ev: any) => {
          const ll = ev.target.getLatLng();
          const next = [...pathRef.current];
          next[idx] = [ll.lat, ll.lng];
          onChangeRef.current({ path: next, splits: splitsRef.current });
        });
        m.on("click", (ev: any) => {
          (L as any).DomEvent.stopPropagation(ev);
          // Click vertex in draw mode → delete it
          const next = pathRef.current.filter((_, i) => i !== idx);
          onChangeRef.current({ path: next, splits: splitsRef.current });
        });
        m.bindTooltip("Drag to move · click to delete", { direction: "top" });
        vertexMarkersRef.current.push(m);
      });

      // Midpoint ghost handles to insert vertices between existing points
      if (path.length >= 2) {
        const midHtml = `<div style="background:${LINE_COLOR};opacity:0.55;border:2px solid #fff;border-radius:9999px;width:9px;height:9px;"></div>`;
        const midIcon = L.divIcon({ html: midHtml, className: "", iconSize: [9, 9], iconAnchor: [4.5, 4.5] });
        for (let i = 0; i < path.length - 1; i++) {
          const a = path[i];
          const b = path[i + 1];
          const mid: LatLng = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
          const mm = L.marker(mid, { icon: midIcon, draggable: true, zIndexOffset: 900, opacity: 0.85 }).addTo(map);
          mm.bindTooltip("Drag to insert point", { direction: "top" });
          mm.on("dragstart", () => {
            // Insert immediately on dragstart so subsequent drag updates the new vertex
            const ll = mm.getLatLng();
            const next = [...pathRef.current];
            next.splice(i + 1, 0, [ll.lat, ll.lng]);
            // Update synchronously and rebuild handles after React re-render
            onChangeRef.current({ path: next, splits: splitsRef.current });
          });
          midMarkersRef.current.push(mm);
        }
      }
    }
  }, [L, path, tool]);

  // Render split markers
  useEffect(() => {
    if (!L || !mapRef.current) return;
    Object.values(splitMarkersRef.current).forEach((m) => mapRef.current.removeLayer(m));
    splitMarkersRef.current = {};
    splits.forEach((s) => {
      const meta = KIND_META[s.kind];
      const isSelected = s.id === selectedSplitId;
      let html: string;
      let size: [number, number];
      let anchor: [number, number];

      if (s.kind === "start" || s.kind === "finish") {
        // Flag-pin: pole + waving flag
        const ringFilter = isSelected
          ? "filter:drop-shadow(0 0 4px rgba(139,143,232,0.9));"
          : "filter:drop-shadow(0 1px 2px rgba(0,0,0,0.4));";
        html = `<div style="position:relative;width:28px;height:34px;${ringFilter}">
          <svg width="28" height="34" viewBox="0 0 28 34" xmlns="http://www.w3.org/2000/svg">
            <line x1="6" y1="2" x2="6" y2="33" stroke="#1f2937" stroke-width="2" stroke-linecap="round"/>
            <path d="M7 3 L24 6 L20 11 L24 16 L7 13 Z" fill="${meta.color}" stroke="#fff" stroke-width="1.2" stroke-linejoin="round"/>
            <circle cx="6" cy="33" r="2" fill="#1f2937"/>
          </svg>
        </div>`;
        size = [28, 34];
        anchor = [6, 33];
      } else {
        const ring = isSelected
          ? "box-shadow:0 0 0 4px rgba(139,143,232,0.55), 0 1px 4px rgba(0,0,0,0.3);"
          : "box-shadow:0 1px 4px rgba(0,0,0,0.3);";
        const inner = s.label.match(/\d+/)?.[0] ?? "•";
        html = `<div style="background:${meta.color};color:#fff;border:2px solid #fff;border-radius:9999px;width:24px;height:24px;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;${ring}">${inner}</div>`;
        size = [24, 24];
        anchor = [12, 12];
      }

      const icon = L.divIcon({ html, className: "", iconSize: size, iconAnchor: anchor });
      const marker = L.marker(s.position, { icon }).addTo(mapRef.current);
      marker.bindTooltip(`${meta.label} · ${s.label}`, { direction: "top" });
      marker.on("click", (ev: any) => {
        ev.originalEvent?.stopPropagation?.();
        if (toolRef.current === "pan") {
          onSelectRef.current?.(s.id);
        } else {
          onChangeRef.current({
            path: pathRef.current,
            splits: splitsRef.current.filter((x) => x.id !== s.id),
          });
        }
      });
      splitMarkersRef.current[s.id] = marker;
    });
  }, [L, splits, selectedSplitId]);

  const undoLastPoint = () => {
    if (!path.length) return;
    onChange({ path: path.slice(0, -1), splits });
  };
  const clearAll = () => onChange({ path: [], splits: [] });

  return (
    <div className="relative h-full w-full">
      <div ref={containerRef} className="absolute inset-0 z-0 bg-secondary" />

      <div className="pointer-events-none absolute left-4 top-4 z-[400] flex flex-col gap-2">
        <div className="pointer-events-auto flex flex-wrap items-center gap-1 rounded-xl border border-hairline bg-card/95 p-1.5 shadow-md backdrop-blur">
          <ToolBtn active={tool === "pan"} onClick={() => setTool("pan")} title="Pan & select">
            <Hand className="h-4 w-4" />
            <span className="text-sm">Pan</span>
          </ToolBtn>
          <ToolBtn active={tool === "draw"} onClick={() => setTool("draw")} title="Draw course (drag vertices, click line to insert)">
            <Pencil className="h-4 w-4" />
            <span className="text-sm">Draw</span>
          </ToolBtn>
          <span className="mx-1 h-5 w-px bg-hairline" />
          <ToolBtn active={tool === "start"} onClick={() => setTool("start")} title="Place start">
            <Flag className="h-4 w-4" style={{ color: KIND_META.start.color }} />
            <span className="text-sm">Start</span>
          </ToolBtn>
          <ToolBtn active={tool === "finish"} onClick={() => setTool("finish")} title="Place finish">
            <Flag className="h-4 w-4" style={{ color: KIND_META.finish.color }} />
            <span className="text-sm">Finish</span>
          </ToolBtn>
          <ToolBtn active={tool === "split"} onClick={() => setTool("split")} title="Add split">
            <Timer className="h-4 w-4" style={{ color: KIND_META.split.color }} />
            <span className="text-sm">Split</span>
          </ToolBtn>
          <ToolBtn active={tool === "fuel"} onClick={() => setTool("fuel")} title="Add fuel station">
            <Droplet className="h-4 w-4" style={{ color: KIND_META.fuel.color }} />
            <span className="text-sm">Fuel</span>
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

      <div className="pointer-events-none absolute bottom-4 left-4 z-[400] rounded-md border border-hairline bg-card/95 px-3 py-1.5 text-xs text-muted-foreground shadow-sm backdrop-blur">
        {title && <span className="text-ink">{title} · </span>}
        <span className="num">{path.length}</span> pts ·{" "}
        <span className="num">{splits.length}</span> markers
        {tool === "draw" && (
          <span className="ml-2 text-primary">· click map to add · drag dots to move · click dot to delete</span>
        )}
        {tool !== "pan" && tool !== "draw" && (
          <span className="ml-2 text-primary">· click map to place {tool}</span>
        )}
      </div>

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

// Find which segment a clicked latlng belongs to → returns insert index
function findInsertIndex(path: LatLng[], pt: LatLng): number {
  let bestIdx = path.length;
  let bestDist = Infinity;
  for (let i = 0; i < path.length - 1; i++) {
    const d = pointToSegmentDist(pt, path[i], path[i + 1]);
    if (d < bestDist) {
      bestDist = d;
      bestIdx = i + 1;
    }
  }
  return bestIdx;
}

function pointToSegmentDist(p: LatLng, a: LatLng, b: LatLng): number {
  const [px, py] = p, [ax, ay] = a, [bx, by] = b;
  const dx = bx - ax, dy = by - ay;
  if (dx === 0 && dy === 0) return Math.hypot(px - ax, py - ay);
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

export function emptySplit(): SplitPoint {
  return { id: crypto.randomUUID(), kind: "marker", label: "Marker", position: [0, 0] };
}



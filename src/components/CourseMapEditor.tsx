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
const LINE_COLOR = "#6366F1";
const LINE_CASING_COLOR = "#FFFFFF";

const KIND_META: Record<SplitKind, { color: string; label: string }> = {
  start: { color: "#16a34a", label: "Start" },
  finish: { color: "#dc2626", label: "Finish" },
  split: { color: "#2563eb", label: "Split" },
  fuel: { color: "#f59e0b", label: "Fuel" },
  marker: { color: "#7c3aed", label: "Marker" },
};

// Pen cursor — angled fountain pen, hotspot at the nib tip (bottom-left)
const PEN_CURSOR =
  "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='32' height='32' viewBox='0 0 32 32'><defs><filter id='s' x='-20%25' y='-20%25' width='140%25' height='140%25'><feDropShadow dx='0.5' dy='1' stdDeviation='0.6' flood-opacity='0.45'/></filter></defs><g filter='url(%23s)'><path d='M22 4 L28 10 L13 25 L7 25 L7 19 Z' fill='%238B8FE8' stroke='white' stroke-width='1.2' stroke-linejoin='round'/><path d='M7 25 L4 28 L7 25 Z' fill='white' stroke='%231f2937' stroke-width='1' stroke-linejoin='round'/><circle cx='4' cy='28' r='1.2' fill='%231f2937'/><line x1='17' y1='9' x2='23' y2='15' stroke='white' stroke-width='1.2'/></g></svg>\") 4 28, crosshair";

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
  const polylineCasingRef = useRef<any>(null);
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

  // Undo/redo history
  type Snap = { path: LatLng[]; splits: SplitPoint[] };
  const historyRef = useRef<Snap[]>([{ path, splits }]);
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

  // Wrap onChange so external updates are tracked
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
        trackedChange({ path: [...pathRef.current, ll], splits: splitsRef.current });
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
          trackedChange({ path: pathRef.current, splits: [...filtered, sp] });
        } else {
          const same = splitsRef.current.filter((s) => s.kind === kind).length;
          const sp: SplitPoint = {
            id: crypto.randomUUID(),
            kind,
            label:
              kind === "split" ? `Split ${same + 1}` : kind === "fuel" ? `Fuel ${same + 1}` : `Marker ${same + 1}`,
            position: ll,
          };
          trackedChange({ path: pathRef.current, splits: [...splitsRef.current, sp] });
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
    if (polylineCasingRef.current) {
      map.removeLayer(polylineCasingRef.current);
      polylineCasingRef.current = null;
    }
    if (polylineRef.current) {
      map.removeLayer(polylineRef.current);
      polylineRef.current = null;
    }
    vertexMarkersRef.current.forEach((m) => map.removeLayer(m));
    midMarkersRef.current.forEach((m) => map.removeLayer(m));
    vertexMarkersRef.current = [];
    midMarkersRef.current = [];

    if (path.length >= 2) {
      // White casing underneath for legibility on any basemap
      const casing = L.polyline(path, {
        color: LINE_CASING_COLOR,
        weight: 9,
        opacity: 0.95,
        lineCap: "round",
        lineJoin: "round",
        interactive: false,
      }).addTo(map);
      polylineCasingRef.current = casing;

      const pl = L.polyline(path, {
        color: LINE_COLOR,
        weight: 5,
        opacity: 1,
        lineCap: "round",
        lineJoin: "round",
        interactive: tool === "draw",
      }).addTo(map);
      polylineRef.current = pl;

      // Click on the line itself in draw mode → insert vertex at click location (closest segment)
      if (tool === "draw") {
        pl.on("click", (e: any) => {
          (L as any).DomEvent.stopPropagation(e);
          const ll: LatLng = [e.latlng.lat, e.latlng.lng];
          const insertIdx = findInsertIndex(path, ll);
          const next = [...path];
          next.splice(insertIdx, 0, ll);
          trackedChange({ path: next, splits: splitsRef.current });
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
          trackedChange({ path: next, splits: splitsRef.current });
        });
        m.on("click", (ev: any) => {
          (L as any).DomEvent.stopPropagation(ev);
          // Click vertex in draw mode → delete it
          const next = pathRef.current.filter((_, i) => i !== idx);
          trackedChange({ path: next, splits: splitsRef.current });
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
            trackedChange({ path: next, splits: splitsRef.current });
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
          trackedChange({
            path: pathRef.current,
            splits: splitsRef.current.filter((x) => x.id !== s.id),
          });
        }
      });
      splitMarkersRef.current[s.id] = marker;
    });
  }, [L, splits, selectedSplitId]);

  const clearAll = () => trackedChange({ path: [], splits: [] });

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
          <span className="mx-1 h-5 w-px bg-hairline" />
          <ToolBtn onClick={undo} title="Undo" disabled={!canUndo}>
            <Undo2 className="h-4 w-4" />
          </ToolBtn>
          <ToolBtn onClick={redo} title="Redo" disabled={!canRedo}>
            <Redo2 className="h-4 w-4" />
          </ToolBtn>
          <span className="mx-1 h-5 w-px bg-hairline" />
          <ToolBtn
            onClick={clearAll}
            title="Clear"
            disabled={path.length === 0 && splits.length === 0}
          >
            <Eraser className="h-4 w-4" />
            <span className="text-sm">Clear</span>
          </ToolBtn>
        </div>
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
      className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 transition disabled:opacity-40 disabled:cursor-not-allowed ${
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



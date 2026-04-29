import { useEffect, useId, useRef, useState } from "react";
import type { Map as MapboxMap, Marker, LngLatBoundsLike } from "mapbox-gl";
import { Pencil, Droplet, Flag, Trash2, Save, Hand, Timer, Undo2, Redo2, Search, Loader2, X, Wand2, Sparkles, Pencil as PencilEdit } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useMapbox, useMapStyle, MAP_STYLES, getCachedMapboxToken, observeVisibleMapContainer } from "@/lib/mapbox";
import { MapStylePicker } from "./MapStylePicker";

export type LatLng = [number, number]; // [lat, lng] — Leaflet-compatible public API
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
  hoverPosition?: LatLng | null;
  panToTarget?: LatLng | null;
  /** Stable id so the per-instance map style survives navigation. */
  scopeId?: string;
}

type Tool = "pan" | "draw" | "split" | "fuel" | "marker" | "start" | "finish";

const LINE_COLOR = "#6366F1";
const LINE_CASING_COLOR = "#FFFFFF";

const PATH_SOURCE = "course-path";
const PATH_LAYER = "course-path-line";
const CASING_LAYER = "course-path-casing";
const AI_SOURCE = "course-ai-path";
const AI_LAYER = "course-ai-path-line";
const AI_CASING_LAYER = "course-ai-path-casing";

const KIND_META: Record<SplitKind, { color: string; label: string }> = {
  start: { color: "#16a34a", label: "Start" },
  finish: { color: "#dc2626", label: "Finish" },
  split: { color: "#2563eb", label: "Split" },
  fuel: { color: "#f59e0b", label: "Fuel" },
  marker: { color: "#7c3aed", label: "Marker" },
};

const PEN_CURSOR =
  "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='32' height='32' viewBox='0 0 32 32'><defs><filter id='s' x='-20%25' y='-20%25' width='140%25' height='140%25'><feDropShadow dx='0.5' dy='1' stdDeviation='0.6' flood-opacity='0.45'/></filter></defs><g filter='url(%23s)'><path d='M22 4 L28 10 L13 25 L7 25 L7 19 Z' fill='%238B8FE8' stroke='white' stroke-width='1.2' stroke-linejoin='round'/><path d='M7 25 L4 28 L7 25 Z' fill='white' stroke='%231f2937' stroke-width='1' stroke-linejoin='round'/><circle cx='4' cy='28' r='1.2' fill='%231f2937'/><line x1='17' y1='9' x2='23' y2='15' stroke='white' stroke-width='1.2'/></g></svg>\") 4 28, crosshair";

/* ─────────── helpers ─────────── */

function lineFC(path: LatLng[]): GeoJSON.FeatureCollection {
  if (path.length < 2) return { type: "FeatureCollection", features: [] };
  return {
    type: "FeatureCollection",
    features: [
      {
        type: "Feature",
        properties: {},
        geometry: { type: "LineString", coordinates: path.map((p) => [p[1], p[0]]) },
      },
    ],
  };
}

function vertexEl(): HTMLDivElement {
  const el = document.createElement("div");
  el.style.background = "#fff";
  el.style.border = `2px solid ${LINE_COLOR}`;
  el.style.borderRadius = "9999px";
  el.style.width = "12px";
  el.style.height = "12px";
  el.style.boxShadow = "0 1px 3px rgba(0,0,0,0.3)";
  el.style.cursor = "grab";
  return el;
}

function midEl(): HTMLDivElement {
  const el = document.createElement("div");
  el.style.background = LINE_COLOR;
  el.style.opacity = "0.55";
  el.style.border = "2px solid #fff";
  el.style.borderRadius = "9999px";
  el.style.width = "9px";
  el.style.height = "9px";
  el.style.cursor = "grab";
  return el;
}

function splitEl(s: SplitPoint, isSel: boolean): HTMLDivElement {
  const el = document.createElement("div");
  const meta = KIND_META[s.kind];
  if (s.kind === "start" || s.kind === "finish") {
    el.style.width = "28px";
    el.style.height = "34px";
    el.style.filter = isSel
      ? "drop-shadow(0 0 4px rgba(139,143,232,0.9))"
      : "drop-shadow(0 1px 2px rgba(0,0,0,0.4))";
    el.innerHTML = `<svg width="28" height="34" viewBox="0 0 28 34" xmlns="http://www.w3.org/2000/svg">
      <line x1="6" y1="2" x2="6" y2="33" stroke="#1f2937" stroke-width="2" stroke-linecap="round"/>
      <path d="M7 3 L24 6 L20 11 L24 16 L7 13 Z" fill="${meta.color}" stroke="#fff" stroke-width="1.2" stroke-linejoin="round"/>
      <circle cx="6" cy="33" r="2" fill="#1f2937"/>
    </svg>`;
  } else {
    const inner = s.label.match(/\d+/)?.[0] ?? "•";
    el.style.background = meta.color;
    el.style.color = "#fff";
    el.style.border = "2px solid #fff";
    el.style.borderRadius = "9999px";
    el.style.width = "24px";
    el.style.height = "24px";
    el.style.display = "flex";
    el.style.alignItems = "center";
    el.style.justifyContent = "center";
    el.style.fontSize = "11px";
    el.style.fontWeight = "700";
    el.style.boxShadow = isSel
      ? "0 0 0 4px rgba(139,143,232,0.55), 0 1px 4px rgba(0,0,0,0.3)"
      : "0 1px 4px rgba(0,0,0,0.3)";
    el.innerText = inner;
  }
  el.title = `${meta.label} · ${s.label}`;
  return el;
}

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
  hoverPosition,
  panToTarget,
  scopeId,
}: Props) {
  const containerId = useId().replace(/:/g, "-");
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapboxMap | null>(null);
  const splitMarkersRef = useRef<Record<string, Marker>>({});
  const vertexMarkersRef = useRef<Marker[]>([]);
  const midMarkersRef = useRef<Marker[]>([]);
  const hoverMarkerRef = useRef<Marker | null>(null);
  const styleLoadedRef = useRef(false);

  const mapbox = useMapbox();
  const [style, setStyle] = useMapStyle(scopeId ? `course-edit:${scopeId}` : null);

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

  // Location search
  type GeoResult = { display_name: string; lat: string; lon: string; boundingbox?: [string, string, string, string]; place_id: number };
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<GeoResult[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const searchAbortRef = useRef<AbortController | null>(null);

  // AI wizard
  const MAX_PROMPT_CHARS = 300;
  const [wizardOpen, setWizardOpen] = useState(false);
  const [wizardPrompt, setWizardPrompt] = useState("");
  const [wizardLoading, setWizardLoading] = useState(false);
  const [hasUsedWizard, setHasUsedWizard] = useState(false);
  const [aiDrawing, setAiDrawing] = useState(false);

  /* ─────────── refs sync ─────────── */
  useEffect(() => { toolRef.current = tool; }, [tool]);
  useEffect(() => { pathRef.current = path; }, [path]);
  useEffect(() => { splitsRef.current = splits; }, [splits]);
  useEffect(() => { onChangeRef.current = onChange; }, [onChange]);
  useEffect(() => { onSelectRef.current = onSelectSplit; }, [onSelectSplit]);

  /* ─────────── history ─────────── */
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

  /* ─────────── search ─────────── */
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
      map.fitBounds(
        [
          [parseFloat(w), parseFloat(s)],
          [parseFloat(e), parseFloat(n)],
        ],
        { duration: 800, maxZoom: 16 },
      );
    } else {
      map.flyTo({ center: [parseFloat(r.lon), parseFloat(r.lat)], zoom: 14, duration: 800 });
    }
    setSearchQuery(r.display_name.split(",")[0] ?? "");
    setSearchOpen(false);
  };

  /* ─────────── style/source plumbing ─────────── */

  const ensureCourseLayers = (map: MapboxMap) => {
    if (!map.getSource(PATH_SOURCE)) {
      map.addSource(PATH_SOURCE, { type: "geojson", data: lineFC(pathRef.current) });
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
      // Click-on-line in draw mode → insert vertex at click point
      map.on("click", PATH_LAYER, (e) => {
        if (toolRef.current !== "draw") return;
        e.originalEvent.stopPropagation();
        const ll: LatLng = [e.lngLat.lat, e.lngLat.lng];
        const insertIdx = findInsertIndex(pathRef.current, ll);
        const next = [...pathRef.current];
        next.splice(insertIdx, 0, ll);
        trackedChange({ path: next, splits: splitsRef.current });
      });
    } else {
      (map.getSource(PATH_SOURCE) as any).setData(lineFC(pathRef.current));
    }
  };

  /* ─────────── init ─────────── */
  useEffect(() => {
    if (!mapbox || !containerRef.current || mapRef.current) return;
    const container = containerRef.current;
    let map: MapboxMap | null = null;
    let rafId = 0;
    let delayedResizeId = 0;
    let ro: ResizeObserver | null = null;

    const stopWatchingVisibility = observeVisibleMapContainer(container, "CourseMapEditor", () => {
      if (mapRef.current || map) return;
      const center: [number, number] = path[0] ? [path[0][1], path[0][0]] : [10.7522, 59.9139];
      const token = getCachedMapboxToken();
      // eslint-disable-next-line no-console
      console.log("Mapbox Token Status:", !!token);
      try {
        map = new mapbox.default.Map({
          container,
          style: MAP_STYLES[style].url,
          center,
          zoom: path.length ? 14 : 12,
          attributionControl: false,
        });
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error("[mapbox] CourseMapEditor constructor threw:", err);
        return;
      }
      map.addControl(new mapbox.default.NavigationControl({ showCompass: false }), "bottom-right");
      map.addControl(new mapbox.default.AttributionControl({ compact: true }));

      map.on("error", (e) => {
        // eslint-disable-next-line no-console
        console.error("[mapbox] CourseMapEditor runtime error:", (e as any)?.error ?? e);
      });

      map.on("style.load", () => {
        styleLoadedRef.current = true;
        ensureCourseLayers(map!);
      });

      map.on("click", (e) => {
        const t = toolRef.current;
        const ll: LatLng = [e.lngLat.lat, e.lngLat.lng];
        if (t === "draw") {
          const features = map!.queryRenderedFeatures(e.point, { layers: [PATH_LAYER] });
          if (features.length > 0) return;
          trackedChange({ path: [...pathRef.current, ll], splits: splitsRef.current });
        } else if (t === "split" || t === "fuel" || t === "marker" || t === "start" || t === "finish") {
          const kind: SplitKind = t as SplitKind;
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

      mapRef.current = map;
      rafId = requestAnimationFrame(() => {
        try { map?.resize(); } catch { /* ignore */ }
      });
      delayedResizeId = window.setTimeout(() => {
        try { map?.resize(); } catch { /* ignore */ }
      }, 100);
      ro = new ResizeObserver(() => {
        try { map?.resize(); } catch { /* ignore */ }
      });
      ro.observe(container);
    });

    return () => {
      stopWatchingVisibility();
      cancelAnimationFrame(rafId);
      window.clearTimeout(delayedResizeId);
      ro?.disconnect();
      map?.remove();
      mapRef.current = null;
      splitMarkersRef.current = {};
      vertexMarkersRef.current = [];
      midMarkersRef.current = [];
      hoverMarkerRef.current = null;
      styleLoadedRef.current = false;
    };
  }, [mapbox]); // eslint-disable-line react-hooks/exhaustive-deps

  /* ─────────── style switching ─────────── */
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    styleLoadedRef.current = false;
    map.setStyle(MAP_STYLES[style].url);
    // Markers (vertex/mid/split/hover) survive setStyle automatically.
    // Course line is re-added in the style.load handler above.
  }, [style]);

  /* ─────────── pan-to-target on first mount ─────────── */
  const didPanToTargetRef = useRef(false);
  useEffect(() => {
    if (!mapbox || !mapRef.current || !panToTarget) return;
    if (didPanToTargetRef.current) return;
    if (path.length > 0 || splits.length > 0) {
      didPanToTargetRef.current = true;
      return;
    }
    try {
      mapRef.current.flyTo({ center: [panToTarget[1], panToTarget[0]], zoom: 14, duration: 900 });
      didPanToTargetRef.current = true;
    } catch {
      /* ignore */
    }
  }, [mapbox, panToTarget, path.length, splits.length]);

  /* ─────────── cursor ─────────── */
  useEffect(() => {
    if (!containerRef.current) return;
    if (tool === "draw") containerRef.current.style.cursor = PEN_CURSOR;
    else if (tool !== "pan") containerRef.current.style.cursor = "crosshair";
    else containerRef.current.style.cursor = "";
  }, [tool, mapbox]);

  /* ─────────── path data + handles ─────────── */
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapbox) return;
    if (styleLoadedRef.current) {
      const src = map.getSource(PATH_SOURCE) as any;
      if (src) src.setData(lineFC(path));
    }

    // Clear vertex/mid markers
    vertexMarkersRef.current.forEach((m) => m.remove());
    midMarkersRef.current.forEach((m) => m.remove());
    vertexMarkersRef.current = [];
    midMarkersRef.current = [];

    if (tool === "draw" && path.length > 0) {
      path.forEach((pt, idx) => {
        const el = vertexEl();
        const m = new mapbox.default.Marker({ element: el, draggable: true, anchor: "center" })
          .setLngLat([pt[1], pt[0]])
          .addTo(map);
        m.on("drag", () => {
          const ll = m.getLngLat();
          // Live-update line only (avoid React thrash)
          const live = [...pathRef.current];
          live[idx] = [ll.lat, ll.lng];
          const src = map.getSource(PATH_SOURCE) as any;
          if (src) src.setData(lineFC(live));
        });
        m.on("dragend", () => {
          const ll = m.getLngLat();
          const next = [...pathRef.current];
          next[idx] = [ll.lat, ll.lng];
          trackedChange({ path: next, splits: splitsRef.current });
        });
        // Click-to-delete vertex
        el.addEventListener("click", (ev) => {
          ev.stopPropagation();
          const next = pathRef.current.filter((_, i) => i !== idx);
          trackedChange({ path: next, splits: splitsRef.current });
        });
        el.title = "Drag to move · click to delete";
        vertexMarkersRef.current.push(m);
      });

      if (path.length >= 2) {
        for (let i = 0; i < path.length - 1; i++) {
          const a = path[i];
          const b = path[i + 1];
          const mid: LatLng = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
          const el = midEl();
          const mm = new mapbox.default.Marker({ element: el, draggable: true, anchor: "center" })
            .setLngLat([mid[1], mid[0]])
            .addTo(map);
          el.title = "Drag to insert point";
          mm.on("dragstart", () => {
            const ll = mm.getLngLat();
            const next = [...pathRef.current];
            next.splice(i + 1, 0, [ll.lat, ll.lng]);
            trackedChange({ path: next, splits: splitsRef.current });
          });
          midMarkersRef.current.push(mm);
        }
      }
    }
  }, [mapbox, path, tool]);

  /* ─────────── split markers ─────────── */
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapbox) return;
    Object.values(splitMarkersRef.current).forEach((m) => m.remove());
    splitMarkersRef.current = {};
    splits.forEach((s) => {
      const isSel = s.id === selectedSplitId;
      const el = splitEl(s, isSel);
      const isFlag = s.kind === "start" || s.kind === "finish";
      const m = new mapbox.default.Marker({
        element: el,
        anchor: isFlag ? "bottom-left" : "center",
      })
        .setLngLat([s.position[1], s.position[0]])
        .addTo(map);
      el.addEventListener("click", (ev) => {
        ev.stopPropagation();
        if (toolRef.current === "pan") {
          onSelectRef.current?.(s.id);
        } else {
          trackedChange({
            path: pathRef.current,
            splits: splitsRef.current.filter((x) => x.id !== s.id),
          });
        }
      });
      splitMarkersRef.current[s.id] = m;
    });
  }, [mapbox, splits, selectedSplitId]);

  /* ─────────── hover marker ─────────── */
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapbox) return;
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
        .addTo(map);
    }
  }, [mapbox, hoverPosition]);

  /* ─────────── AI wizard ─────────── */
  const animateDraw = (full: LatLng[], finalSplits: SplitPoint[]) => {
    const map = mapRef.current;
    if (!map || !mapbox || full.length < 2) {
      trackedChange({ path: full, splits: finalSplits });
      setAiDrawing(false);
      return;
    }
    try {
      const bounds = new (mapbox as any).default.LngLatBounds();
      full.forEach((p) => bounds.extend([p[1], p[0]]));
      map.fitBounds(bounds as LngLatBoundsLike, { padding: 40, maxZoom: 16, duration: 900 });
    } catch {
      /* ignore */
    }
    // Hide existing path during animation
    trackedChange({ path: [], splits: [] });

    setTimeout(() => {
      // Add an ephemeral source/layer for the animation
      if (!map.getSource(AI_SOURCE)) {
        map.addSource(AI_SOURCE, {
          type: "geojson",
          data: lineFC([full[0], full[0]]),
        });
        map.addLayer({
          id: AI_CASING_LAYER,
          type: "line",
          source: AI_SOURCE,
          layout: { "line-cap": "round", "line-join": "round" },
          paint: { "line-color": LINE_CASING_COLOR, "line-width": 9, "line-opacity": 0.95 },
        });
        map.addLayer({
          id: AI_LAYER,
          type: "line",
          source: AI_SOURCE,
          layout: { "line-cap": "round", "line-join": "round" },
          paint: { "line-color": LINE_COLOR, "line-width": 5 },
        });
      }
      const headEl = document.createElement("div");
      headEl.style.width = "14px";
      headEl.style.height = "14px";
      headEl.style.borderRadius = "9999px";
      headEl.style.background = LINE_COLOR;
      headEl.style.border = "2px solid #fff";
      headEl.style.pointerEvents = "none";
      const headMarker = new mapbox.default.Marker({ element: headEl, anchor: "center" })
        .setLngLat([full[0][1], full[0][0]])
        .addTo(map);

      const totalMs = Math.min(2400, Math.max(900, full.length * 28));
      const start = performance.now();
      const step = (now: number) => {
        const t = Math.min(1, (now - start) / totalMs);
        const ease = 1 - Math.pow(1 - t, 3);
        const cutIdx = Math.max(1, Math.floor(ease * (full.length - 1)));
        const slice = full.slice(0, cutIdx + 1);
        const src = map.getSource(AI_SOURCE) as any;
        if (src) src.setData(lineFC(slice));
        headMarker.setLngLat([full[cutIdx][1], full[cutIdx][0]]);
        if (t < 1) {
          requestAnimationFrame(step);
        } else {
          // Cleanup ephemeral animation layers/source
          if (map.getLayer(AI_LAYER)) map.removeLayer(AI_LAYER);
          if (map.getLayer(AI_CASING_LAYER)) map.removeLayer(AI_CASING_LAYER);
          if (map.getSource(AI_SOURCE)) map.removeSource(AI_SOURCE);
          headMarker.remove();
          trackedChange({ path: full, splits: finalSplits });
          setAiDrawing(false);
          toast.success("Course drawn — feel free to refine it.");
        }
      };
      requestAnimationFrame(step);
    }, 950);
  };

  const runWizard = async () => {
    const text = wizardPrompt.trim();
    if (!text) {
      toast.error("Describe the course you want the wizard to draw.");
      return;
    }
    setWizardLoading(true);
    try {
      const map = mapRef.current;
      const c = map?.getCenter?.();
      const contextCenter = c ? { lat: c.lat, lng: c.lng } : undefined;
      const anchors = splitsRef.current.map((s) => ({
        kind: s.kind,
        label: s.label,
        position: s.position,
      }));
      const { data, error } = await supabase.functions.invoke("ai-draw-course", {
        body: { prompt: text, contextCenter, anchors },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      const aiPath: LatLng[] = ((data as any).path ?? []).map((p: number[]) => [p[0], p[1]]);
      if (aiPath.length < 2) throw new Error("The wizard could not build a route from that description.");
      const startPos: LatLng | undefined = (data as any).startPosition;
      const finishPos: LatLng | undefined = (data as any).finishPosition;
      const aiSplits: { kind: "split" | "fuel"; label: string; position: LatLng }[] = (data as any).splits ?? [];
      const newSplits: SplitPoint[] = [];
      if (startPos) newSplits.push({ id: crypto.randomUUID(), kind: "start", label: "Start", position: startPos });
      if (finishPos) newSplits.push({ id: crypto.randomUUID(), kind: "finish", label: "Finish", position: finishPos });
      aiSplits.forEach((s, i) => newSplits.push({
        id: crypto.randomUUID(),
        kind: s.kind,
        label: s.label || (s.kind === "split" ? `Split ${i + 1}` : `Fuel ${i + 1}`),
        position: s.position,
      }));
      setWizardOpen(false);
      setHasUsedWizard(true);
      setAiDrawing(true);
      animateDraw(aiPath, newSplits);
    } catch (e: any) {
      console.error(e);
      toast.error(e?.message || "The wizard ran into a problem. Try a more specific description.");
    } finally {
      setWizardLoading(false);
    }
  };

  return (
    <div className="relative h-full w-full" style={{ minHeight: 400 }}>
      <div
        id={`course-map-editor-${containerId}`}
        ref={containerRef}
        className="absolute inset-0 bg-secondary"
        style={{ zIndex: 1, minHeight: 400, width: "100%", height: "100%" }}
      />

      <div className="pointer-events-none absolute left-4 top-4 z-[400] flex flex-col gap-2">
        <div className="pointer-events-auto flex flex-wrap items-center gap-1 rounded-xl border border-hairline bg-card/95 p-1.5 shadow-md backdrop-blur">
          <button
            onClick={() => setWizardOpen((o) => !o)}
            title={hasUsedWizard ? "Edit AI course prompt" : "Draw course with AI wizard"}
            className={`relative inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 transition ${
              wizardOpen
                ? "bg-gradient-to-br from-indigo-500 to-purple-600 text-white shadow-sm"
                : "text-ink hover:bg-secondary"
            }`}
          >
            <span className="relative inline-flex">
              <Wand2 className={`h-4 w-4 ${wizardOpen ? "" : "text-indigo-500"}`} />
              {hasUsedWizard && !wizardOpen && (
                <span className="absolute -bottom-1 -right-1 flex h-3 w-3 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-sm">
                  <PencilEdit className="h-2 w-2" />
                </span>
              )}
            </span>
          </button>
          <span className="mx-1 h-5 w-px bg-hairline" />
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

        {wizardOpen && (
          <div className="pointer-events-auto w-[420px] max-w-[calc(100vw-2rem)] rounded-xl border border-hairline bg-card/95 p-3 shadow-lg backdrop-blur animate-in fade-in slide-in-from-top-2 duration-200">
            <div className="mb-2 flex items-center gap-2">
              <span className="inline-flex h-6 w-6 items-center justify-center rounded-md bg-gradient-to-br from-indigo-500 to-purple-600 text-white">
                <Wand2 className="h-3.5 w-3.5" />
              </span>
              <div className="text-sm font-medium text-ink">AI course wizard</div>
              <button
                onClick={() => setWizardOpen(false)}
                className="ml-auto rounded p-1 text-muted-foreground hover:bg-secondary hover:text-ink"
                title="Close"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
            {splits.length > 0 && (
              <div className="mb-2 rounded-md border border-indigo-200 bg-indigo-50 px-2.5 py-1.5 text-xs text-indigo-900 dark:border-indigo-900/50 dark:bg-indigo-950/40 dark:text-indigo-200">
                <Sparkles className="mr-1 inline h-3 w-3" />
                Using {splits.length} placed point{splits.length === 1 ? "" : "s"} as anchors
                {(() => {
                  const counts = splits.reduce<Record<string, number>>((a, s) => ((a[s.kind] = (a[s.kind] ?? 0) + 1), a), {});
                  const parts = Object.entries(counts).map(([k, n]) => `${n} ${KIND_META[k as SplitKind].label.toLowerCase()}`);
                  return parts.length ? ` (${parts.join(", ")})` : "";
                })()}
                . The wizard will route through them in order.
              </div>
            )}
            <textarea
              value={wizardPrompt}
              onChange={(e) => setWizardPrompt(e.target.value.slice(0, MAX_PROMPT_CHARS))}
              placeholder={
                splits.length > 0
                  ? "Add details — terrain, loop vs out-and-back, landmarks between your points…"
                  : "Tip: place Start/Finish/Splits on the map first, then describe the route. e.g. Sentrumsløpet, start Karl Johan, up to the Royal Palace, through Vigelandsparken, finish at Rådhusplassen."
              }
              rows={4}
              disabled={wizardLoading}
              className="w-full resize-none rounded-md border border-hairline bg-background px-3 py-2 text-sm text-ink outline-none transition placeholder:text-muted-foreground focus:border-indigo-400 focus:ring-1 focus:ring-indigo-400 disabled:opacity-60"
            />
            <div className="mt-2 flex items-center justify-between gap-2">
              <span
                className={`text-xs tabular-nums ${
                  wizardPrompt.length >= MAX_PROMPT_CHARS
                    ? "text-destructive"
                    : wizardPrompt.length > MAX_PROMPT_CHARS * 0.85
                      ? "text-amber-600"
                      : "text-muted-foreground"
                }`}
              >
                {wizardPrompt.length}/{MAX_PROMPT_CHARS}
              </span>
              <button
                onClick={runWizard}
                disabled={wizardLoading || wizardPrompt.trim().length === 0}
                className="inline-flex items-center gap-1.5 rounded-md bg-gradient-to-br from-indigo-500 to-purple-600 px-3 py-1.5 text-xs font-medium text-white shadow-sm transition hover:opacity-90 disabled:opacity-50"
              >
                {wizardLoading ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" /> Drawing…
                  </>
                ) : (
                  <>
                    <Sparkles className="h-3.5 w-3.5" /> Draw course
                  </>
                )}
              </button>
            </div>
          </div>
        )}
      </div>

      {aiDrawing && (
        <div className="pointer-events-none absolute left-1/2 top-4 z-[450] -translate-x-1/2 rounded-full border border-hairline bg-card/95 px-4 py-1.5 text-xs text-ink shadow-md backdrop-blur animate-in fade-in slide-in-from-top-2">
          <span className="inline-flex items-center gap-2">
            <Sparkles className="h-3.5 w-3.5 animate-pulse text-indigo-500" />
            The wizard is drawing your course…
          </span>
        </div>
      )}

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

      {/* Top-right: style picker + Save / Delete */}
      <div className="pointer-events-none absolute right-4 top-4 z-[400] flex items-center gap-2">
        <MapStylePicker value={style} onChange={setStyle} />
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

      {!mapbox && (
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

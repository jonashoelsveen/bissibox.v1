import { useEffect, useMemo, useRef, useState } from "react";
import type { LatLng, SplitPoint, SplitKind } from "@/components/CourseMapEditor";

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
  onSelectSplit?: (id: string | null) => void;
  /** Called as the user hovers the curve. Position is on the path. */
  onHover?: (pos: LatLng | null) => void;
  /** External hover position to render a vertical crosshair on the curve. */
  hoverPosition?: LatLng | null;
  height?: number;
}

/* ---------------- Geo + path math ---------------- */

const R = 6371000; // metres
function haversine(a: LatLng, b: LatLng): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b[0] - a[0]);
  const dLon = toRad(b[1] - a[1]);
  const lat1 = toRad(a[0]);
  const lat2 = toRad(b[0]);
  const x =
    Math.sin(dLat / 2) ** 2 +
    Math.sin(dLon / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);
  return 2 * R * Math.asin(Math.sqrt(x));
}

/** Returns cumulative distances along the polyline (in metres), len = path.length. */
function cumulativeDistances(path: LatLng[]): number[] {
  const out = [0];
  for (let i = 1; i < path.length; i++) {
    out.push(out[i - 1] + haversine(path[i - 1], path[i]));
  }
  return out;
}

/** Interpolate a point on the polyline at distance d (metres). */
function pointAtDistance(path: LatLng[], cum: number[], d: number): LatLng {
  if (path.length === 0) return [0, 0];
  if (d <= 0) return path[0];
  const total = cum[cum.length - 1];
  if (d >= total) return path[path.length - 1];
  // binary search
  let lo = 0, hi = cum.length - 1;
  while (lo < hi - 1) {
    const mid = (lo + hi) >> 1;
    if (cum[mid] <= d) lo = mid;
    else hi = mid;
  }
  const segLen = cum[hi] - cum[lo] || 1;
  const t = (d - cum[lo]) / segLen;
  const a = path[lo], b = path[hi];
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
}

/** Project a point onto the polyline → returns cumulative distance (metres) of the closest point. */
function projectOntoPath(path: LatLng[], cum: number[], pt: LatLng): number {
  let bestD = 0;
  let bestDist2 = Infinity;
  for (let i = 0; i < path.length - 1; i++) {
    const a = path[i], b = path[i + 1];
    const ax = a[1], ay = a[0], bx = b[1], by = b[0], px = pt[1], py = pt[0];
    const dx = bx - ax, dy = by - ay;
    const len2 = dx * dx + dy * dy || 1;
    let t = ((px - ax) * dx + (py - ay) * dy) / len2;
    t = Math.max(0, Math.min(1, t));
    const cx = ax + t * dx, cy = ay + t * dy;
    const d2 = (px - cx) ** 2 + (py - cy) ** 2;
    if (d2 < bestDist2) {
      bestDist2 = d2;
      const segLen = cum[i + 1] - cum[i];
      bestD = cum[i] + t * segLen;
    }
  }
  return bestD;
}

/* ---------------- Elevation fetching (Open-Meteo, no key) ---------------- */

const elevationCache = new Map<string, number[]>();

function pathHash(samples: LatLng[]): string {
  // Lower precision keeps cache hits across small numerical noise
  return samples.map(([la, lo]) => `${la.toFixed(5)},${lo.toFixed(5)}`).join("|");
}

async function fetchElevations(samples: LatLng[]): Promise<number[]> {
  const key = pathHash(samples);
  const cached = elevationCache.get(key);
  if (cached) return cached;

  const out: number[] = [];
  // Open-Meteo allows up to 100 coords per request
  const CHUNK = 100;
  for (let i = 0; i < samples.length; i += CHUNK) {
    const chunk = samples.slice(i, i + CHUNK);
    const lat = chunk.map((p) => p[0].toFixed(5)).join(",");
    const lon = chunk.map((p) => p[1].toFixed(5)).join(",");
    const url = `https://api.open-meteo.com/v1/elevation?latitude=${lat}&longitude=${lon}`;
    const r = await fetch(url);
    if (!r.ok) throw new Error(`Elevation API ${r.status}`);
    const j = await r.json();
    const arr: number[] = Array.isArray(j.elevation) ? j.elevation : [];
    out.push(...arr);
  }
  elevationCache.set(key, out);
  return out;
}

/* ---------------- Component ---------------- */

export function ElevationProfile({
  path,
  splits,
  selectedSplitId,
  onSelectSplit,
  onHover,
  hoverPosition,
  height = 200,
}: Props) {
  const cum = useMemo(() => cumulativeDistances(path), [path]);
  const totalM = cum.length ? cum[cum.length - 1] : 0;
  const totalKm = totalM / 1000;

  // Sample the path at evenly-spaced cumulative distances
  const samples = useMemo<LatLng[]>(() => {
    if (path.length < 2 || totalM < 5) return [];
    const N = Math.min(120, Math.max(30, Math.round(totalM / 80))); // ~1 sample per 80m, cap 120
    const out: LatLng[] = [];
    for (let i = 0; i < N; i++) {
      const d = (i / (N - 1)) * totalM;
      out.push(pointAtDistance(path, cum, d));
    }
    return out;
  }, [path, cum, totalM]);

  const [elev, setElev] = useState<number[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const reqIdRef = useRef(0);

  // Debounced fetch
  useEffect(() => {
    if (samples.length < 2) {
      setElev([]);
      setErr(null);
      return;
    }
    const myId = ++reqIdRef.current;
    setLoading(true);
    setErr(null);
    const t = setTimeout(() => {
      void (async () => {
        try {
          const e = await fetchElevations(samples);
          if (reqIdRef.current === myId) {
            setElev(e);
            setLoading(false);
          }
        } catch (ex) {
          if (reqIdRef.current === myId) {
            setErr(ex instanceof Error ? ex.message : "Failed to load elevation");
            setLoading(false);
          }
        }
      })();
    }, 600);
    return () => clearTimeout(t);
  }, [samples]);

  /* ---------- SVG drawing ---------- */
  const PADDING = { top: 16, right: 16, bottom: 28, left: 44 };
  const [svgW, setSvgW] = useState(800);
  const wrapRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!wrapRef.current) return;
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width;
      if (w) setSvgW(Math.max(320, Math.floor(w)));
    });
    ro.observe(wrapRef.current);
    return () => ro.disconnect();
  }, []);

  const innerW = Math.max(50, svgW - PADDING.left - PADDING.right);
  const innerH = Math.max(60, height - PADDING.top - PADDING.bottom);

  const minE = elev.length ? Math.min(...elev) : 0;
  const maxE = elev.length ? Math.max(...elev) : 100;
  // Pad y range
  const yPadding = Math.max(5, (maxE - minE) * 0.15);
  const yMin = Math.floor((minE - yPadding) / 5) * 5;
  const yMax = Math.ceil((maxE + yPadding) / 5) * 5;
  const yRange = Math.max(1, yMax - yMin);

  const xFromKm = (km: number) =>
    PADDING.left + (totalKm > 0 ? (km / totalKm) * innerW : 0);
  const yFromM = (m: number) =>
    PADDING.top + innerH - ((m - yMin) / yRange) * innerH;

  // Build path d-attribute
  const linePath = useMemo(() => {
    if (elev.length < 2) return "";
    const N = elev.length;
    let d = "";
    for (let i = 0; i < N; i++) {
      const km = (i / (N - 1)) * totalKm;
      const x = xFromKm(km);
      const y = yFromM(elev[i]);
      d += (i === 0 ? "M" : "L") + x.toFixed(2) + "," + y.toFixed(2) + " ";
    }
    return d;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [elev, totalKm, innerW, innerH, yMin, yRange]);

  const areaPath = useMemo(() => {
    if (!linePath) return "";
    const baseY = PADDING.top + innerH;
    const last = `L ${xFromKm(totalKm).toFixed(2)},${baseY.toFixed(2)} L ${xFromKm(0).toFixed(2)},${baseY.toFixed(2)} Z`;
    return linePath + last;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [linePath, totalKm, innerW, innerH]);

  /* ---------- Y axis ticks ---------- */
  const yTicks = useMemo(() => {
    const desired = 5;
    const step = niceStep(yRange / desired);
    const out: number[] = [];
    const start = Math.ceil(yMin / step) * step;
    for (let v = start; v <= yMax + 0.001; v += step) out.push(Math.round(v));
    return out;
  }, [yMin, yMax, yRange]);

  const xTicks = useMemo(() => {
    if (totalKm <= 0) return [];
    const desired = 6;
    const step = niceStep(totalKm / desired);
    const out: number[] = [];
    for (let v = 0; v <= totalKm + 0.0001; v += step) out.push(v);
    return out;
  }, [totalKm]);

  /* ---------- Splits projected onto distance axis ---------- */
  const splitMarks = useMemo(() => {
    if (path.length < 2) return [];
    return splits.map((s) => {
      const dM = projectOntoPath(path, cum, s.position);
      return { id: s.id, kind: s.kind, label: s.label, km: dM / 1000 };
    });
  }, [path, cum, splits]);

  /* ---------- Hover handling ---------- */
  const [localHoverKm, setLocalHoverKm] = useState<number | null>(null);
  const onHoverRef = useRef(onHover);
  useEffect(() => { onHoverRef.current = onHover; }, [onHover]);

  // External hover position → derive km
  const externalHoverKm = useMemo(() => {
    if (!hoverPosition || path.length < 2) return null;
    const d = projectOntoPath(path, cum, hoverPosition);
    return d / 1000;
  }, [hoverPosition, path, cum]);

  const hoverKm = localHoverKm ?? externalHoverKm;
  const hoverElev = useMemo(() => {
    if (hoverKm == null || elev.length < 2 || totalKm <= 0) return null;
    const idxF = (hoverKm / totalKm) * (elev.length - 1);
    const i0 = Math.floor(idxF), i1 = Math.min(elev.length - 1, i0 + 1);
    const t = idxF - i0;
    return elev[i0] * (1 - t) + elev[i1] * t;
  }, [hoverKm, elev, totalKm]);

  const handleMove = (e: React.MouseEvent<SVGSVGElement>) => {
    if (totalKm <= 0) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const px = e.clientX - rect.left;
    const t = (px - PADDING.left) / innerW;
    const km = Math.max(0, Math.min(totalKm, t * totalKm));
    setLocalHoverKm(km);
    const ll = pointAtDistance(path, cum, km * 1000);
    onHoverRef.current?.(ll);
  };
  const handleLeave = () => {
    setLocalHoverKm(null);
    onHoverRef.current?.(null);
  };

  /* ---------- Stats ---------- */
  const { ascent, descent } = useMemo(() => {
    let up = 0, down = 0;
    for (let i = 1; i < elev.length; i++) {
      const d = elev[i] - elev[i - 1];
      if (d > 0) up += d;
      else down -= d;
    }
    return { ascent: Math.round(up), descent: Math.round(down) };
  }, [elev]);

  if (path.length < 2) {
    return (
      <div className="flex h-[160px] items-center justify-center rounded-lg border border-hairline bg-card text-xs text-muted-foreground">
        Draw at least two points to see the elevation profile.
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-hairline bg-card">
      <div className="flex items-center justify-between gap-3 border-b border-hairline px-4 py-2.5">
        <div className="flex items-baseline gap-4">
          <p className="mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
            Elevation profile
          </p>
          <p className="text-xs text-muted-foreground">
            <span className="num text-ink">{totalKm.toFixed(2)} km</span>
            {elev.length > 0 && (
              <>
                <span className="mx-2">·</span>
                <span className="text-emerald-600">↑ <span className="num">{ascent} m</span></span>
                <span className="mx-2">·</span>
                <span className="text-rose-600">↓ <span className="num">{descent} m</span></span>
                <span className="mx-2">·</span>
                <span>min <span className="num text-ink">{Math.round(minE)} m</span></span>
                <span className="mx-2">·</span>
                <span>max <span className="num text-ink">{Math.round(maxE)} m</span></span>
              </>
            )}
          </p>
        </div>
        {loading && <span className="text-xs text-muted-foreground">Loading elevation…</span>}
        {err && <span className="text-xs text-destructive">{err}</span>}
      </div>

      <div ref={wrapRef} className="px-2 py-2" style={{ height }}>
        <svg
          width={svgW}
          height={height}
          onMouseMove={handleMove}
          onMouseLeave={handleLeave}
          className="block select-none"
        >
          <defs>
            <linearGradient id="elev-fill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#6366F1" stopOpacity="0.45" />
              <stop offset="100%" stopColor="#6366F1" stopOpacity="0.05" />
            </linearGradient>
          </defs>

          {/* Grid + Y axis */}
          {yTicks.map((v) => {
            const y = yFromM(v);
            return (
              <g key={`y-${v}`}>
                <line
                  x1={PADDING.left}
                  x2={PADDING.left + innerW}
                  y1={y}
                  y2={y}
                  stroke="currentColor"
                  className="text-border"
                  strokeWidth={1}
                  strokeDasharray="2 3"
                  opacity={0.6}
                />
                <text
                  x={PADDING.left - 8}
                  y={y + 3}
                  fontSize="10"
                  textAnchor="end"
                  className="fill-muted-foreground"
                >
                  {v} m
                </text>
              </g>
            );
          })}

          {/* X axis ticks */}
          {xTicks.map((v, i) => {
            const x = xFromKm(v);
            return (
              <g key={`x-${i}`}>
                <line
                  x1={x}
                  x2={x}
                  y1={PADDING.top}
                  y2={PADDING.top + innerH}
                  stroke="currentColor"
                  className="text-border"
                  strokeWidth={1}
                  strokeDasharray="2 3"
                  opacity={0.4}
                />
                <text
                  x={x}
                  y={PADDING.top + innerH + 14}
                  fontSize="10"
                  textAnchor="middle"
                  className="fill-muted-foreground"
                >
                  {v.toFixed(v < 10 ? 1 : 0)} km
                </text>
              </g>
            );
          })}

          {/* Baseline */}
          <line
            x1={PADDING.left}
            x2={PADDING.left + innerW}
            y1={PADDING.top + innerH}
            y2={PADDING.top + innerH}
            stroke="currentColor"
            className="text-border"
            strokeWidth={1}
          />

          {/* Area + line */}
          {areaPath && <path d={areaPath} fill="url(#elev-fill)" stroke="none" />}
          {linePath && (
            <path
              d={linePath}
              fill="none"
              stroke="#6366F1"
              strokeWidth={2}
              strokeLinejoin="round"
              strokeLinecap="round"
            />
          )}

          {/* Loading skeleton */}
          {loading && elev.length === 0 && (
            <text
              x={PADDING.left + innerW / 2}
              y={PADDING.top + innerH / 2}
              fontSize="11"
              textAnchor="middle"
              className="fill-muted-foreground"
            >
              Fetching elevation data…
            </text>
          )}

          {/* Splits */}
          {splitMarks.map((m) => {
            const x = xFromKm(m.km);
            const color = KIND_COLOR[m.kind];
            const isSel = m.id === selectedSplitId;
            const yTop = PADDING.top;
            const yBot = PADDING.top + innerH;
            return (
              <g
                key={m.id}
                style={{ cursor: "pointer" }}
                onClick={(e) => { e.stopPropagation(); onSelectSplit?.(m.id); }}
              >
                <line
                  x1={x}
                  x2={x}
                  y1={yTop}
                  y2={yBot}
                  stroke={color}
                  strokeWidth={isSel ? 2 : 1.25}
                  strokeDasharray={m.kind === "fuel" ? "3 2" : undefined}
                  opacity={isSel ? 0.95 : 0.7}
                />
                {(m.kind === "start" || m.kind === "finish") ? (
                  <g transform={`translate(${x - 5}, ${yTop - 2})`}>
                    <line x1={5} x2={5} y1={0} y2={14} stroke="#1f2937" strokeWidth={1.5} />
                    <path d="M5.5 1 L14 3 L11.5 6 L14 9 L5.5 7 Z" fill={color} stroke="#fff" strokeWidth={0.8} />
                  </g>
                ) : (
                  <circle
                    cx={x}
                    cy={yTop + 6}
                    r={isSel ? 6 : 4.5}
                    fill={color}
                    stroke="#fff"
                    strokeWidth={1.5}
                  />
                )}
                <title>{m.label} · {m.km.toFixed(2)} km</title>
              </g>
            );
          })}

          {/* Hover crosshair */}
          {hoverKm != null && totalKm > 0 && (() => {
            const x = xFromKm(hoverKm);
            const y = hoverElev != null ? yFromM(hoverElev) : null;
            return (
              <g pointerEvents="none">
                <line
                  x1={x}
                  x2={x}
                  y1={PADDING.top}
                  y2={PADDING.top + innerH}
                  stroke="#6366F1"
                  strokeWidth={1}
                  opacity={0.6}
                />
                {y != null && hoverElev != null && (
                  <>
                    <circle cx={x} cy={y} r={5} fill="#6366F1" stroke="#fff" strokeWidth={2} />
                    <g transform={`translate(${Math.min(svgW - 110, Math.max(0, x + 8))}, ${PADDING.top + 4})`}>
                      <rect width={104} height={34} rx={6} className="fill-background" stroke="#6366F1" strokeWidth={1} opacity={0.95} />
                      <text x={8} y={14} fontSize="10" className="fill-muted-foreground">distance</text>
                      <text x={96} y={14} fontSize="11" textAnchor="end" className="fill-ink num">{hoverKm.toFixed(2)} km</text>
                      <text x={8} y={28} fontSize="10" className="fill-muted-foreground">elevation</text>
                      <text x={96} y={28} fontSize="11" textAnchor="end" className="fill-ink num">{Math.round(hoverElev)} m</text>
                    </g>
                  </>
                )}
              </g>
            );
          })()}
        </svg>
      </div>
    </div>
  );
}

function niceStep(rough: number): number {
  if (rough <= 0) return 1;
  const pow = Math.pow(10, Math.floor(Math.log10(rough)));
  const norm = rough / pow;
  let nice: number;
  if (norm < 1.5) nice = 1;
  else if (norm < 3) nice = 2;
  else if (norm < 7) nice = 5;
  else nice = 10;
  return nice * pow;
}

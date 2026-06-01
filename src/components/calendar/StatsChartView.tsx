/**
 * StatsChartView — Nordnet-style minimalist chart for the Diary.
 *
 * Aggregates per-day Distance (km / mi) and Duration (minutes) across the
 * currently selected range (week or month). Renders as an SVG line chart
 * with a horizontal grid, a follow-the-cursor crosshair, and a stock-style
 * value box pinned to the top-right.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import type { CalendarEvent } from "./yearStore";
import {
  formatDistance,
  kmToUnit,
  unitLabel,
  useDistanceUnit,
} from "@/lib/units";
import {
  useMetricColor,
  useMetricVisible,
  usePriorityMetric,
  useDistanceMax,
  useDurationMaxMinutes,
  type MetricScope,
} from "./metricsSettings";

interface StatsChartViewProps {
  events: CalendarEvent[];
  viewMode: "week" | "month" | "day";
  currentDate: Date;
}

function startOfDay(d: Date) {
  const r = new Date(d);
  r.setHours(0, 0, 0, 0);
  return r;
}
function startOfWeekMon(d: Date) {
  const r = startOfDay(d);
  // Monday-first: getDay() returns 0=Sun..6=Sat
  const dow = (r.getDay() + 6) % 7;
  r.setDate(r.getDate() - dow);
  return r;
}
function startOfMonth(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}
function endOfMonth(d: Date) {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0);
}
function daysBetween(a: Date, b: Date) {
  return Math.round((startOfDay(b).getTime() - startOfDay(a).getTime()) / 86400000);
}

function formatDuration(minutes: number): string {
  if (!minutes || minutes <= 0) return "0 min";
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  if (h <= 0) return `${m} min`;
  if (m === 0) return `${h} h`;
  return `${h} h ${m} min`;
}

export function StatsChartView({ events, viewMode, currentDate }: StatsChartViewProps) {
  const [unit] = useDistanceUnit();
  const [distVisible] = useMetricVisible("distance");
  const [durVisible] = useMetricVisible("duration");
  const [distColor] = useMetricColor("distance");
  const [durColor] = useMetricColor("duration");

  const { rangeStart, days } = useMemo(() => {
    let start: Date;
    let end: Date;
    if (viewMode === "month") {
      start = startOfMonth(currentDate);
      end = endOfMonth(currentDate);
    } else {
      start = startOfWeekMon(currentDate);
      end = new Date(start);
      end.setDate(end.getDate() + 6);
    }
    const n = daysBetween(start, end) + 1;
    return { rangeStart: start, days: n };
  }, [viewMode, currentDate]);

  /* Aggregate per-day */
  const series = useMemo(() => {
    const dist = new Array(days).fill(0); // km
    const dur = new Array(days).fill(0); // minutes
    for (const e of events) {
      const s = new Date(e.startISO);
      if (Number.isNaN(s.getTime())) continue;
      const idx = daysBetween(rangeStart, s);
      if (idx < 0 || idx >= days) continue;
      if (e.distanceKm && Number.isFinite(e.distanceKm)) dist[idx] += e.distanceKm;
      const en = new Date(e.endISO);
      if (!Number.isNaN(en.getTime())) {
        const mins = Math.max(0, (en.getTime() - s.getTime()) / 60000);
        dur[idx] += mins;
      }
    }
    return { dist, dur };
  }, [events, rangeStart, days]);

  const totalDistKm = series.dist.reduce((a, b) => a + b, 0);
  const totalDurMin = series.dur.reduce((a, b) => a + b, 0);

  /* Chart dims — measured from container so text stays at true pixel size */
  const containerRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 1000, h: 420 });
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      const r = el.getBoundingClientRect();
      if (r.width > 0 && r.height > 0) {
        setSize({ w: Math.round(r.width), h: Math.round(r.height) });
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const W = size.w;
  const H = size.h;
  const PAD_L = 56;
  const PAD_R = 56;
  const PAD_T = 20;
  const PAD_B = 28;
  const innerW = Math.max(1, W - PAD_L - PAD_R);
  const innerH = Math.max(1, H - PAD_T - PAD_B);

  const xFor = (i: number) =>
    days <= 1 ? PAD_L + innerW / 2 : PAD_L + (i / (days - 1)) * innerW;

  const distMax = Math.max(1, ...series.dist.map((v) => kmToUnit(v, unit)));
  const durMax = Math.max(1, ...series.dur);

  const niceMax = (v: number) => {
    if (v <= 0) return 1;
    const exp = Math.pow(10, Math.floor(Math.log10(v)));
    const norm = v / exp;
    const nice = norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 5 ? 5 : 10;
    return nice * exp;
  };
  const yDistMax = niceMax(distMax);
  const yDurMax = niceMax(durMax);
  const durInHours = yDurMax >= 60;

  const yDistFor = (kmVal: number) =>
    PAD_T + innerH - (kmToUnit(kmVal, unit) / yDistMax) * innerH;
  const yDurFor = (minVal: number) =>
    PAD_T + innerH - (minVal / yDurMax) * innerH;

  const buildPath = (vals: number[], yFn: (v: number) => number) => {
    if (vals.length === 0) return "";
    return vals
      .map((v, i) => `${i === 0 ? "M" : "L"} ${xFor(i).toFixed(2)} ${yFn(v).toFixed(2)}`)
      .join(" ");
  };

  const distPath = buildPath(series.dist, yDistFor);
  const durPath = buildPath(series.dur, yDurFor);

  /* Cursor / hover */
  const svgRef = useRef<SVGSVGElement>(null);
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

  const onMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const svg = svgRef.current;
    if (!svg) return;
    const pt = svg.createSVGPoint();
    pt.x = e.clientX;
    pt.y = e.clientY;
    const ctm = svg.getScreenCTM();
    if (!ctm) return;
    const loc = pt.matrixTransform(ctm.inverse());
    if (loc.x < PAD_L || loc.x > W - PAD_R || loc.y < PAD_T || loc.y > PAD_T + innerH) {
      setHoverIdx(null);
      return;
    }
    const ratio = (loc.x - PAD_L) / innerW;
    const idx = Math.max(0, Math.min(days - 1, Math.round(ratio * (days - 1))));
    setHoverIdx(idx);
  };

  const onLeave = () => setHoverIdx(null);

  /* Y-axis ticks (5 lines) */
  const ticks = [0, 0.25, 0.5, 0.75, 1];

  /* X labels */
  const xLabels = useMemo(() => {
    const labels: { i: number; label: string }[] = [];
    if (viewMode === "month") {
      // Show 1, 5, 10, 15, 20, 25, last
      const last = days;
      const set = new Set<number>([1, 5, 10, 15, 20, 25, last]);
      for (const day of Array.from(set).sort((a, b) => a - b)) {
        if (day >= 1 && day <= last) labels.push({ i: day - 1, label: String(day) });
      }
    } else {
      const names = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
      for (let i = 0; i < days; i++) labels.push({ i, label: names[i] ?? "" });
    }
    return labels;
  }, [viewMode, days]);

  const hoverDate = useMemo(() => {
    if (hoverIdx == null) return null;
    const d = new Date(rangeStart);
    d.setDate(d.getDate() + hoverIdx);
    return d;
  }, [hoverIdx, rangeStart]);

  const hoverDistKm = hoverIdx != null ? series.dist[hoverIdx] : 0;
  const hoverDurMin = hoverIdx != null ? series.dur[hoverIdx] : 0;

  return (
    <div className="relative flex h-full w-full flex-col bg-white px-4 pb-4 pt-2">
      {/* Top totals row */}
      <div className="mb-2 flex items-start justify-between gap-4">
        <div className="flex items-baseline gap-6">
          <div className="text-ink" style={{ visibility: distVisible ? "visible" : "hidden" }}>
            <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Distance</div>
            <div className="text-xl font-semibold tabular-nums">
              {formatDistance(totalDistKm, unit, 1)}
            </div>
          </div>
          <div className="text-ink" style={{ visibility: durVisible ? "visible" : "hidden" }}>
            <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Duration</div>
            <div className="text-xl font-semibold tabular-nums">
              {formatDuration(totalDurMin)}
            </div>
          </div>
        </div>

        {hoverDate && (
          <div className="pointer-events-none absolute right-4 top-2 z-10 w-[260px] rounded-md border border-hairline bg-muted px-4 py-3 shadow-sm">
            <div className="text-xs uppercase tracking-wide text-muted-foreground">
              {hoverDate.toLocaleDateString(undefined, {
                weekday: "short",
                day: "2-digit",
                month: "short",
              })}
            </div>
            <div className="mt-1.5 space-y-1.5">
              <div
                className="flex items-center gap-3 text-base tabular-nums"
                style={{ visibility: distVisible ? "visible" : "hidden" }}
              >
                <span
                  className="inline-block h-3.5 w-3.5 rounded-full shrink-0"
                  style={{ background: distColor }}
                />
                <span className="text-ink font-medium">{formatDistance(hoverDistKm, unit, 1)}</span>
              </div>
              <div
                className="flex items-center gap-3 text-base tabular-nums"
                style={{ visibility: durVisible ? "visible" : "hidden" }}
              >
                <span
                  className="inline-block h-3.5 w-3.5 rounded-full shrink-0"
                  style={{ background: durColor }}
                />
                <span className="text-ink font-medium">{formatDuration(hoverDurMin)}</span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Chart */}
      <div ref={containerRef} className="relative flex-1 min-h-0">
        <svg
          ref={svgRef}
          width={W}
          height={H}
          className="block select-none"
          onMouseMove={onMove}
          onMouseLeave={onLeave}
        >
          {/* horizontal grid lines + y axis labels */}
          {ticks.map((t) => {
            const y = PAD_T + innerH - t * innerH;
            const distVal = t * yDistMax;
            const distLbl = `${distVal.toFixed(yDistMax >= 10 ? 0 : 1)} ${unitLabel(unit)}`;
            const durValMin = t * yDurMax;
            const durLbl = durInHours
              ? `${(durValMin / 60).toFixed(yDurMax / 60 >= 10 ? 0 : 1)}h`
              : `${Math.round(durValMin)}m`;
            return (
              <g key={t}>
                <line
                  x1={PAD_L}
                  x2={W - PAD_R}
                  y1={y}
                  y2={y}
                  stroke="#e5e7eb"
                  strokeWidth={1}
                  shapeRendering="crispEdges"
                />
                {distVisible && (
                  <text
                    x={PAD_L - 8}
                    y={y + 3}
                    textAnchor="end"
                    fontSize={10}
                    fill="#6b7280"
                  >
                    {distLbl}
                  </text>
                )}
                {durVisible && (
                  <text
                    x={W - PAD_R + 8}
                    y={y + 3}
                    textAnchor="start"
                    fontSize={10}
                    fill="#6b7280"
                  >
                    {durLbl}
                  </text>
                )}
              </g>
            );
          })}

          {/* x axis baseline */}
          <line
            x1={PAD_L}
            x2={W - PAD_R}
            y1={PAD_T + innerH}
            y2={PAD_T + innerH}
            stroke="#9ca3af"
            strokeWidth={1}
            shapeRendering="crispEdges"
          />

          {/* x labels */}
          {xLabels.map(({ i, label }) => (
            <text
              key={`${i}-${label}`}
              x={xFor(i)}
              y={PAD_T + innerH + 18}
              textAnchor="middle"
              fontSize={10}
              fill="#6b7280"
            >
              {label}
            </text>
          ))}

          {/* duration line */}
          {durVisible && (
            <path
              d={durPath}
              fill="none"
              stroke={durColor}
              strokeWidth={1.75}
              strokeLinejoin="round"
              strokeLinecap="round"
            />
          )}
          {/* distance line */}
          {distVisible && (
            <path
              d={distPath}
              fill="none"
              stroke={distColor}
              strokeWidth={1.75}
              strokeLinejoin="round"
              strokeLinecap="round"
            />
          )}

          {/* crosshair */}
          {hoverIdx != null && (
            <>
              <line
                x1={xFor(hoverIdx)}
                x2={xFor(hoverIdx)}
                y1={PAD_T}
                y2={PAD_T + innerH}
                stroke="#9ca3af"
                strokeWidth={1}
                strokeDasharray="3 3"
              />
              {distVisible && (
                <circle
                  cx={xFor(hoverIdx)}
                  cy={yDistFor(series.dist[hoverIdx])}
                  r={3}
                  fill={distColor}
                />
              )}
              {durVisible && (
                <circle
                  cx={xFor(hoverIdx)}
                  cy={yDurFor(series.dur[hoverIdx])}
                  r={3}
                  fill={durColor}
                />
              )}
            </>
          )}
        </svg>
      </div>
    </div>
  );
}

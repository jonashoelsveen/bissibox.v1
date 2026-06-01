/**
 * StatsChartView — Nordnet-style minimalist chart for the Diary.
 *
 * Self-contained timeframe controls (1D / 1W / 1M / 3M / 6M / 1Y / 3Y / 5Y /
 * 10Y / Max) live at the bottom of the chart and gate themselves on how far
 * back the user has data — exactly like a stock trading platform that
 * surfaces 5Y/10Y only once a stock has been public that long.
 *
 * The x-axis granularity (Day / Week / Month / Year) is controlled from a
 * dropdown in the page header (lifted to YearCalendarView) and passed in.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import type { CalendarEvent } from "./yearStore";
import { kmToUnit, unitLabel, useDistanceUnit } from "@/lib/units";
import {
  useMetricColor,
  useMetricVisible,
  usePriorityMetric,
} from "./metricsSettings";

export type XBucket = "day" | "week" | "month" | "year";
export type TimeframeKey =
  | "1D"
  | "1W"
  | "1M"
  | "3M"
  | "6M"
  | "1Y"
  | "3Y"
  | "5Y"
  | "10Y"
  | "MAX";

interface StatsChartViewProps {
  events: CalendarEvent[];
  xBucket: XBucket;
  timeframe: TimeframeKey;
  onTimeframeChange: (tf: TimeframeKey) => void;
  /** Earliest event date for this user, used to gate timeframe buttons. */
  earliestDataDate: Date | null;
}

const MONTHS_NB_SHORT = [
  "Jan", "Feb", "Mar", "Apr", "Mai", "Jun",
  "Jul", "Aug", "Sep", "Okt", "Nov", "Des",
];

function startOfDay(d: Date) {
  const r = new Date(d);
  r.setHours(0, 0, 0, 0);
  return r;
}
function startOfWeekMon(d: Date) {
  const r = startOfDay(d);
  const dow = (r.getDay() + 6) % 7;
  r.setDate(r.getDate() - dow);
  return r;
}
function addDays(d: Date, n: number) {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}
function daysBetween(a: Date, b: Date) {
  return Math.round((startOfDay(b).getTime() - startOfDay(a).getTime()) / 86400000);
}
function isoWeek(d: Date): number {
  const x = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const day = x.getUTCDay() || 7;
  x.setUTCDate(x.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(x.getUTCFullYear(), 0, 1));
  return Math.ceil(((x.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
}

/** Days included in each Nordnet-style timeframe. */
const TF_DAYS: Record<TimeframeKey, number> = {
  "1D": 1,
  "1W": 7,
  "1M": 30,
  "3M": 91,
  "6M": 182,
  "1Y": 365,
  "3Y": 365 * 3,
  "5Y": 365 * 5,
  "10Y": 365 * 10,
  MAX: Number.POSITIVE_INFINITY,
};

const TF_LABEL: Record<TimeframeKey, string> = {
  "1D": "1 D",
  "1W": "1 U",
  "1M": "1 M",
  "3M": "3 M",
  "6M": "6 M",
  "1Y": "1 År",
  "3Y": "3 År",
  "5Y": "5 År",
  "10Y": "10 År",
  MAX: "Maks",
};

/** Allowed x-axis buckets for a given timeframe. */
export function allowedBucketsForTimeframe(tf: TimeframeKey): XBucket[] {
  switch (tf) {
    case "1D":
      return ["day"];
    case "1W":
      return ["day", "week"];
    case "1M":
    case "3M":
    case "6M":
    case "1Y":
      return ["day", "week", "month"];
    case "3Y":
    case "5Y":
    case "10Y":
    case "MAX":
      return ["week", "month", "year"];
  }
}

/** Pick which Nordnet timeframe buttons are visible given the user's data span. */
export function visibleTimeframes(spanDays: number): TimeframeKey[] {
  const all: TimeframeKey[] = ["1D", "1W", "1M", "3M", "6M", "1Y", "3Y", "5Y", "10Y"];
  const out: TimeframeKey[] = [];
  for (const k of all) {
    // 1D / 1W / 1M always shown (low bar).
    if (k === "1D" || k === "1W" || k === "1M") {
      out.push(k);
      continue;
    }
    if (spanDays >= TF_DAYS[k]) out.push(k);
  }
  out.push("MAX");
  return out;
}

function DistanceValue({ km, unit, digits = 1 }: { km: number | null | undefined; unit: "km" | "mi"; digits?: number }) {
  if (km == null || Number.isNaN(km)) return <>—</>;
  const num = kmToUnit(km, unit).toFixed(digits);
  return (<>{num}<span className="font-light"> {unitLabel(unit)}</span></>);
}
function DurationValue({ minutes }: { minutes: number }) {
  if (!minutes || minutes <= 0) return (<>0<span className="font-light"> min</span></>);
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  if (h <= 0) return (<>{m}<span className="font-light"> min</span></>);
  if (m === 0) return (<>{h}<span className="font-light"> h</span></>);
  return (<>{h}<span className="font-light"> h </span>{m}<span className="font-light"> min</span></>);
}

export function StatsChartView({
  events,
  xBucket,
  timeframe,
  onTimeframeChange,
  earliestDataDate,
}: StatsChartViewProps) {
  const [unit] = useDistanceUnit();
  const [distVisible] = useMetricVisible("distance");
  const [durVisible] = useMetricVisible("duration");
  const [distColor] = useMetricColor("distance");
  const [durColor] = useMetricColor("duration");
  const [priority] = usePriorityMetric();

  /** Map timeframe → scope for per-scope max settings. */
  const scope: MetricScope =
    timeframe === "1Y" || timeframe === "3Y" || timeframe === "5Y" || timeframe === "10Y" || timeframe === "MAX"
      ? "year"
      : timeframe === "1M" || timeframe === "3M" || timeframe === "6M"
      ? "month"
      : "week";
  const [distMaxSetting] = useDistanceMax(scope);
  const [durMaxSettingMin] = useDurationMaxMinutes(scope);

  /** Trailing window ending today. */
  const { rangeStart, rangeEndExclusive } = useMemo(() => {
    const todayStart = startOfDay(new Date());
    const endExcl = addDays(todayStart, 1);
    if (timeframe === "MAX") {
      const start = earliestDataDate ? startOfDay(earliestDataDate) : addDays(todayStart, -6);
      return { rangeStart: start, rangeEndExclusive: endExcl };
    }
    const days = TF_DAYS[timeframe];
    const start = addDays(endExcl, -days);
    return { rangeStart: start, rangeEndExclusive: endExcl };
  }, [timeframe, earliestDataDate]);

  /** Build bucket starts based on xBucket. */
  const bucketStarts = useMemo(() => {
    const out: Date[] = [];
    if (xBucket === "day") {
      const d = startOfDay(rangeStart);
      while (d < rangeEndExclusive) {
        out.push(new Date(d));
        d.setDate(d.getDate() + 1);
      }
    } else if (xBucket === "week") {
      const d = startOfWeekMon(rangeStart);
      while (d < rangeEndExclusive) {
        out.push(new Date(d));
        d.setDate(d.getDate() + 7);
      }
    } else if (xBucket === "month") {
      const d = new Date(rangeStart.getFullYear(), rangeStart.getMonth(), 1);
      while (d < rangeEndExclusive) {
        out.push(new Date(d));
        d.setMonth(d.getMonth() + 1);
      }
    } else {
      const d = new Date(rangeStart.getFullYear(), 0, 1);
      while (d < rangeEndExclusive) {
        out.push(new Date(d));
        d.setFullYear(d.getFullYear() + 1);
      }
    }
    if (out.length === 0) out.push(startOfDay(rangeStart));
    return out;
  }, [rangeStart, rangeEndExclusive, xBucket]);

  const buckets = bucketStarts.length;

  const bucketIndexFor = (d: Date): number => {
    if (xBucket === "day") return daysBetween(bucketStarts[0], d);
    if (xBucket === "week") return Math.floor(daysBetween(bucketStarts[0], d) / 7);
    if (xBucket === "month") {
      const b0 = bucketStarts[0];
      return (d.getFullYear() - b0.getFullYear()) * 12 + (d.getMonth() - b0.getMonth());
    }
    return d.getFullYear() - bucketStarts[0].getFullYear();
  };

  /* Aggregate per bucket (SUM distance km, SUM duration minutes) */
  const series = useMemo(() => {
    const dist = new Array(buckets).fill(0);
    const dur = new Array(buckets).fill(0);
    for (const e of events) {
      const s = new Date(e.startISO);
      if (Number.isNaN(s.getTime())) continue;
      if (s < rangeStart || s >= rangeEndExclusive) continue;
      const idx = bucketIndexFor(s);
      if (idx < 0 || idx >= buckets) continue;
      if (e.distanceKm && Number.isFinite(e.distanceKm)) dist[idx] += e.distanceKm;
      const en = new Date(e.endISO);
      if (!Number.isNaN(en.getTime())) {
        const mins = Math.max(0, (en.getTime() - s.getTime()) / 60000);
        dur[idx] += mins;
      }
    }
    return { dist, dur };
  }, [events, rangeStart, rangeEndExclusive, buckets, xBucket, bucketStarts]);

  const totalDistKm = series.dist.reduce((a, b) => a + b, 0);
  const totalDurMin = series.dur.reduce((a, b) => a + b, 0);

  /* Chart dims */
  const chartWrapRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 1000, h: 380 });
  useEffect(() => {
    const el = chartWrapRef.current;
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
  const PAD_B = 36;
  const innerW = Math.max(1, W - PAD_L - PAD_R);
  const innerH = Math.max(1, H - PAD_T - PAD_B);

  const xFor = (i: number) =>
    buckets <= 1 ? PAD_L + innerW / 2 : PAD_L + (i / (buckets - 1)) * innerW;

  const yDistMax = Math.max(1, distMaxSetting);
  const yDurMax = Math.max(1, durMaxSettingMin);
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

  /* Hover */
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
    const idx = Math.max(0, Math.min(buckets - 1, Math.round(ratio * (buckets - 1))));
    setHoverIdx(idx);
  };
  const onLeave = () => setHoverIdx(null);

  const ticks = [0, 0.25, 0.5, 0.75, 1];

  /* X-axis label formatting based on xBucket. */
  const xLabels = useMemo(() => {
    const labels: { i: number; label: string }[] = [];
    const stride = buckets <= 12 ? 1 : Math.ceil(buckets / 12);

    if (xBucket === "day") {
      // Single-day timeframe → just today
      if (buckets === 1) {
        const d = bucketStarts[0];
        labels.push({ i: 0, label: `${d.getDate()}.${d.getMonth() + 1}` });
      } else {
        for (let i = 0; i < buckets; i += stride) {
          const d = bucketStarts[i];
          labels.push({ i, label: `${d.getDate()}.${d.getMonth() + 1}` });
        }
      }
    } else if (xBucket === "week") {
      // Show "Uke NN" if buckets are few enough; else just "NN" to avoid clutter.
      const displayCount = Math.ceil(buckets / stride);
      const withPrefix = displayCount <= 8;
      for (let i = 0; i < buckets; i += stride) {
        const d = bucketStarts[i];
        const wk = isoWeek(d);
        labels.push({ i, label: withPrefix ? `Uke ${wk}` : String(wk) });
      }
    } else if (xBucket === "month") {
      for (let i = 0; i < buckets; i += stride) {
        const d = bucketStarts[i];
        const lbl =
          d.getMonth() === 0 && buckets > 12
            ? String(d.getFullYear())
            : MONTHS_NB_SHORT[d.getMonth()] ?? "";
        labels.push({ i, label: lbl });
      }
    } else {
      for (let i = 0; i < buckets; i += stride) {
        labels.push({ i, label: String(bucketStarts[i].getFullYear()) });
      }
    }
    return labels;
  }, [xBucket, buckets, bucketStarts]);

  const hoverDate = hoverIdx != null ? bucketStarts[hoverIdx] ?? null : null;
  const hoverLabel = useMemo(() => {
    if (!hoverDate) return "";
    if (xBucket === "year") return String(hoverDate.getFullYear());
    if (xBucket === "month")
      return `${MONTHS_NB_SHORT[hoverDate.getMonth()]} ${hoverDate.getFullYear()}`;
    if (xBucket === "week") {
      const end = addDays(hoverDate, 6);
      return `Uke ${isoWeek(hoverDate)} · ${hoverDate.getDate()} ${MONTHS_NB_SHORT[hoverDate.getMonth()]} – ${end.getDate()} ${MONTHS_NB_SHORT[end.getMonth()]}`;
    }
    return `${hoverDate.getDate()}.${hoverDate.getMonth() + 1}.${hoverDate.getFullYear()}`;
  }, [hoverDate, xBucket]);

  const hoverDistKm = hoverIdx != null ? series.dist[hoverIdx] : 0;
  const hoverDurMin = hoverIdx != null ? series.dur[hoverIdx] : 0;

  /* Nordnet-style timeframe buttons (gated by user's data span) */
  const spanDays = earliestDataDate
    ? Math.max(1, daysBetween(earliestDataDate, new Date()) + 1)
    : 1;
  const tfVisible = useMemo(() => visibleTimeframes(spanDays), [spanDays]);

  return (
    <div className="relative flex h-full w-full flex-col bg-white px-4 pb-2 pt-2">
      {/* Top totals row */}
      <div className="mb-2 flex items-start justify-between gap-4">
        <div className="flex items-baseline gap-6">
          {(priority === "distance"
            ? (["distance", "duration"] as const)
            : (["duration", "distance"] as const)
          ).map((m) =>
            m === "distance" ? (
              <div key="distance" className="text-ink" style={{ visibility: distVisible ? "visible" : "hidden" }}>
                <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Distance</div>
                <div className="text-xl font-semibold tabular-nums">
                  <DistanceValue km={totalDistKm} unit={unit} digits={1} />
                </div>
              </div>
            ) : (
              <div key="duration" className="text-ink" style={{ visibility: durVisible ? "visible" : "hidden" }}>
                <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Duration</div>
                <div className="text-xl font-semibold tabular-nums">
                  <DurationValue minutes={totalDurMin} />
                </div>
              </div>
            ),
          )}
        </div>

        {hoverDate && (
          <div className="pointer-events-none absolute right-4 top-2 z-10 w-[260px] rounded-md border border-hairline bg-muted px-4 py-3 shadow-sm">
            <div className="text-xs uppercase tracking-wide text-muted-foreground">{hoverLabel}</div>
            <div className="mt-1.5 space-y-1.5">
              {(priority === "distance"
                ? (["distance", "duration"] as const)
                : (["duration", "distance"] as const)
              ).map((m) =>
                m === "distance" ? (
                  <div key="distance" className="flex items-center gap-3 text-base tabular-nums" style={{ visibility: distVisible ? "visible" : "hidden" }}>
                    <span className="inline-block h-3.5 w-3.5 rounded-full shrink-0" style={{ background: distColor }} />
                    <span className="text-ink font-medium"><DistanceValue km={hoverDistKm} unit={unit} digits={1} /></span>
                  </div>
                ) : (
                  <div key="duration" className="flex items-center gap-3 text-base tabular-nums" style={{ visibility: durVisible ? "visible" : "hidden" }}>
                    <span className="inline-block h-3.5 w-3.5 rounded-full shrink-0" style={{ background: durColor }} />
                    <span className="text-ink font-medium"><DurationValue minutes={hoverDurMin} /></span>
                  </div>
                ),
              )}
            </div>
          </div>
        )}
      </div>

      {/* Chart SVG */}
      <div ref={chartWrapRef} className="relative flex-1 min-h-0">
        <svg
          ref={svgRef}
          width={W}
          height={H}
          className="block select-none"
          onMouseMove={onMove}
          onMouseLeave={onLeave}
        >
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
                <line x1={PAD_L} x2={W - PAD_R} y1={y} y2={y} stroke="#e5e7eb" strokeWidth={1} shapeRendering="crispEdges" />
                {distVisible && (
                  <text
                    x={priority === "distance" ? PAD_L - 8 : W - PAD_R + 8}
                    y={y + 3}
                    textAnchor={priority === "distance" ? "end" : "start"}
                    fontSize={10}
                    fill="#6b7280"
                  >
                    {distLbl}
                  </text>
                )}
                {durVisible && (
                  <text
                    x={priority === "duration" ? PAD_L - 8 : W - PAD_R + 8}
                    y={y + 3}
                    textAnchor={priority === "duration" ? "end" : "start"}
                    fontSize={10}
                    fill="#6b7280"
                  >
                    {durLbl}
                  </text>
                )}
              </g>
            );
          })}

          <line x1={PAD_L} x2={W - PAD_R} y1={PAD_T + innerH} y2={PAD_T + innerH} stroke="#9ca3af" strokeWidth={1} shapeRendering="crispEdges" />

          {xLabels.map(({ i, label }) => (
            <text key={`${i}-${label}`} x={xFor(i)} y={PAD_T + innerH + 18} textAnchor="middle" fontSize={10} fill="#6b7280">
              {label}
            </text>
          ))}

          {durVisible && (
            <path d={durPath} fill="none" stroke={durColor} strokeWidth={1.75} strokeLinejoin="round" strokeLinecap="round" />
          )}
          {distVisible && (
            <path d={distPath} fill="none" stroke={distColor} strokeWidth={1.75} strokeLinejoin="round" strokeLinecap="round" />
          )}

          {hoverIdx != null && (
            <>
              <line x1={xFor(hoverIdx)} x2={xFor(hoverIdx)} y1={PAD_T} y2={PAD_T + innerH} stroke="#9ca3af" strokeWidth={1} strokeDasharray="3 3" />
              {distVisible && (
                <circle cx={xFor(hoverIdx)} cy={yDistFor(series.dist[hoverIdx])} r={3} fill={distColor} />
              )}
              {durVisible && (
                <circle cx={xFor(hoverIdx)} cy={yDurFor(series.dur[hoverIdx])} r={3} fill={durColor} />
              )}
            </>
          )}
        </svg>
      </div>

      {/* Nordnet-style timeframe button row */}
      <div className="mt-2 flex flex-none items-center justify-center gap-1 border-t border-hairline pt-2">
        {tfVisible.map((k) => {
          const active = k === timeframe;
          return (
            <button
              key={k}
              type="button"
              onClick={() => onTimeframeChange(k)}
              aria-pressed={active}
              className={`h-7 min-w-[44px] rounded-md px-2.5 text-xs font-medium tabular-nums transition-colors ${
                active
                  ? "bg-ink text-white"
                  : "text-muted-foreground hover:bg-secondary hover:text-ink"
              }`}
            >
              {TF_LABEL[k]}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/**
 * Diary metrics settings — visibility, color, priority axis, and per-scope
 * y-axis maximums for the Distance and Duration chart series.
 *
 * Persisted in localStorage so the Diary side nav, the chart, and the
 * settings page stay in sync without prop drilling.
 */
import { useLibrarySetting } from "@/lib/library-settings";

export type MetricKey = "distance" | "duration";
export type MetricScope = "year" | "month" | "week";

export const METRIC_DEFAULT_COLOR: Record<MetricKey, string> = {
  distance: "#8b5cf6", // purple
  duration: "#22c55e", // green
};

/** Default y-axis maximums for distance (stored & shown in user's display unit). */
export const DEFAULT_DISTANCE_MAX: Record<MetricScope, number> = {
  year: 4160,
  month: 320,
  week: 80,
};

/** Default y-axis maximums for duration, stored in minutes. */
export const DEFAULT_DURATION_MAX_MIN: Record<MetricScope, number> = {
  year: 200 * 60, // 200h
  month: 20 * 60, // 20h
  week: 5 * 60,   // 5h
};

const visibleKey = (m: MetricKey) => `diary:metric:${m}:visible`;
const colorKey = (m: MetricKey) => `diary:metric:${m}:color`;
const priorityKey = "diary:metric:priority";
const distMaxKey = (s: MetricScope) => `diary:metric:max:distance:${s}`;
const durMaxKey = (s: MetricScope) => `diary:metric:max:duration:${s}`;

export function useMetricVisible(m: MetricKey) {
  return useLibrarySetting<boolean>(visibleKey(m), true);
}
export function useMetricColor(m: MetricKey) {
  return useLibrarySetting<string>(colorKey(m), METRIC_DEFAULT_COLOR[m]);
}

/** Which metric is on the primary (left) axis. The other goes right. */
export function usePriorityMetric() {
  return useLibrarySetting<MetricKey>(priorityKey, "distance");
}

/** Distance y-axis max for a given scope (in user's display unit). */
export function useDistanceMax(scope: MetricScope) {
  return useLibrarySetting<number>(distMaxKey(scope), DEFAULT_DISTANCE_MAX[scope]);
}

/** Duration y-axis max for a given scope, stored as total minutes. */
export function useDurationMaxMinutes(scope: MetricScope) {
  return useLibrarySetting<number>(durMaxKey(scope), DEFAULT_DURATION_MAX_MIN[scope]);
}

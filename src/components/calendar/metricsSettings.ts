/**
 * Diary metrics settings — visibility + color for Distance and Duration
 * chart series, plus the active "statistics" view toggle.
 *
 * Persisted in localStorage so the Diary side nav (MetricsSection) and
 * the chart (StatsChartView) stay in sync without prop drilling.
 */
import { useLibrarySetting } from "@/lib/library-settings";

export type MetricKey = "distance" | "duration";

export const METRIC_DEFAULT_COLOR: Record<MetricKey, string> = {
  distance: "#3b82f6", // blue
  duration: "#f97316", // orange
};

const visibleKey = (m: MetricKey) => `diary:metric:${m}:visible`;
const colorKey = (m: MetricKey) => `diary:metric:${m}:color`;

export function useMetricVisible(m: MetricKey) {
  return useLibrarySetting<boolean>(visibleKey(m), true);
}
export function useMetricColor(m: MetricKey) {
  return useLibrarySetting<string>(colorKey(m), METRIC_DEFAULT_COLOR[m]);
}

// Types shared by the Import Calendar feature.

export interface DetectedCategory {
  id: string;
  name: string;
  count: number;
}

export interface ParsedEvent {
  title: string;
  start_time: string; // ISO 8601 local
  end_time?: string; // ISO 8601 local
  category: string;
  description?: string;
  reasoning_confidence?: number; // 1-100
}

export const MIN_CONFIDENCE = 80;

export interface ParsedImport {
  total_events_found: number;
  detected_categories: DetectedCategory[];
  events: ParsedEvent[];
}

export type ImportStep = "source" | "library" | "loading" | "preview";

/** A short, deterministic palette to color preview-event categories so each
 *  detected category has a stable distinct hue. Cycled by index. */
export const PREVIEW_PALETTE = [
  "#22C55E", // green-500 (default ghost)
  "#3B82F6", // blue
  "#F59E0B", // amber
  "#EC4899", // pink
  "#8B5CF6", // violet
  "#14B8A6", // teal
  "#EF4444", // red
  "#A855F7", // purple
];

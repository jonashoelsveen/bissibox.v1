import { Loader2 } from "lucide-react";
import type { ParsedImport } from "./types";

export function PreviewStep({
  data,
  visible,
  onToggle,
  onSave,
  saving,
  categoryColors,
}: {
  data: ParsedImport;
  visible: Set<string>;
  onToggle: (id: string) => void;
  onSave: () => void;
  saving: boolean;
  categoryColors: Record<string, string>;
}) {
  const visibleCount = data.events.filter((e) => visible.has(e.category)).length;
  const pastStatus = data.past_status ?? "none";
  return (
    <div>
      {pastStatus === "all_past" && (
        <div className="mb-3 rounded-md border border-amber-300/40 bg-amber-50/60 px-3 py-2 text-xs text-amber-900 dark:border-amber-400/30 dark:bg-amber-500/10 dark:text-amber-200">
          This file appears to contain only past events ({data.past_events_count ?? 0} dated before today). Review carefully before importing.
        </div>
      )}
      {pastStatus === "partly_past" && (
        <div className="mb-3 rounded-md border border-amber-300/40 bg-amber-50/60 px-3 py-2 text-xs text-amber-900 dark:border-amber-400/30 dark:bg-amber-500/10 dark:text-amber-200">
          {data.past_events_count ?? 0} past event{(data.past_events_count ?? 0) === 1 ? "" : "s"} from this file were hidden. Showing {data.future_events_count ?? data.total_events_found} upcoming event{(data.future_events_count ?? data.total_events_found) === 1 ? "" : "s"} only.
        </div>
      )}
      <div className="mb-3 text-sm text-ink">
        <span className="font-medium">{data.total_events_found}</span> events found,{" "}
        <span className="font-medium">{data.detected_categories.length}</span> categories detected.
      </div>
      <ul className="mb-4 flex max-h-[260px] flex-col gap-1 overflow-y-auto">
        {data.detected_categories.map((c) => {
          const checked = visible.has(c.id);
          const color = categoryColors[c.id] ?? "#22C55E";
          return (
            <li key={c.id}>
              <label className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-xs hover:bg-secondary/40">
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => onToggle(c.id)}
                  className="h-3.5 w-3.5 accent-primary"
                />
                <span
                  className="inline-block h-2.5 w-2.5 shrink-0 rounded-sm"
                  style={{ background: color }}
                />
                <span className="flex-1 text-ink">{c.name}</span>
                <span className="text-muted-foreground">({c.count})</span>
              </label>
            </li>
          );
        })}
      </ul>
      <button
        type="button"
        onClick={onSave}
        disabled={saving || visibleCount === 0}
        className="flex w-full items-center justify-center gap-2 rounded-md bg-primary px-3 py-2 text-xs font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
      >
        {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
        Save {visibleCount} {visibleCount === 1 ? "event" : "events"}
      </button>
    </div>
  );
}

import { useEffect, useRef, useState } from "react";
import { Loader2, X } from "lucide-react";
import type { ParsedImport } from "./types";

export interface InternalCategoryOption {
  value: string;
  label: string;
  color: string;
}

export function PreviewStep({
  data,
  visible,
  onToggle,
  onSave,
  saving,
  categoryColors,
  internalOptions,
  mappings,
  onMappingChange,
  onClose,
}: {
  data: ParsedImport;
  visible: Set<string>;
  onToggle: (id: string) => void;
  onSave: () => void;
  saving: boolean;
  categoryColors: Record<string, string>;
  internalOptions: InternalCategoryOption[];
  mappings: Record<string, string>;
  onMappingChange: (fileCategoryId: string, internal: string) => void;
  onClose: () => void;
}) {
  const visibleCount = data.events.filter((e) => visible.has(e.category)).length;
  const pastStatus = data.past_status ?? "none";

  // Drag state — Apple-like draggable window via the top bar.
  const cardRef = useRef<HTMLDivElement | null>(null);
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const dragRef = useRef<{ dx: number; dy: number } | null>(null);

  useEffect(() => {
    function onMove(e: MouseEvent) {
      if (!dragRef.current) return;
      setPos({ x: e.clientX - dragRef.current.dx, y: e.clientY - dragRef.current.dy });
    }
    function onUp() {
      dragRef.current = null;
      document.body.style.userSelect = "";
    }
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, []);

  const startDrag = (e: React.MouseEvent) => {
    const rect = cardRef.current?.getBoundingClientRect();
    if (!rect) return;
    dragRef.current = { dx: e.clientX - rect.left, dy: e.clientY - rect.top };
    if (!pos) setPos({ x: rect.left, y: rect.top });
    document.body.style.userSelect = "none";
  };

  return (
    <div
      ref={cardRef}
      className="pointer-events-auto fixed z-50 w-[380px] overflow-hidden rounded-xl border border-hairline bg-card shadow-2xl"
      style={
        pos
          ? { left: pos.x, top: pos.y }
          : { right: 24, top: 24 }
      }
    >
      {/* Apple-like draggable top bar */}
      <div
        onMouseDown={startDrag}
        className="flex cursor-grab items-center justify-between gap-2 border-b border-hairline bg-secondary/60 px-3 py-2 active:cursor-grabbing"
      >
        <span className="select-none text-xs font-medium text-ink">Review imported events</span>
        <button
          onClick={onClose}
          className="grid h-5 w-5 place-items-center rounded text-muted-foreground hover:bg-secondary hover:text-ink"
          aria-label="Close"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      <div className="p-4">
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
        <ul className="mb-4 flex max-h-[280px] flex-col gap-1 overflow-y-auto">
          {data.detected_categories.map((c) => {
            const checked = visible.has(c.id);
            const mapped = mappings[c.id] ?? internalOptions[0]?.value ?? "";
            const internalColor = internalOptions.find((o) => o.value === mapped)?.color;
            const color = internalColor ?? categoryColors[c.id] ?? "#22C55E";
            return (
              <li key={c.id}>
                <div className="flex items-center gap-2 rounded-md px-2 py-1.5 text-xs hover:bg-secondary/40">
                  <button
                    type="button"
                    onClick={() => onToggle(c.id)}
                    aria-pressed={checked}
                    aria-label={checked ? "Hide category" : "Show category"}
                    className="h-3 w-3 shrink-0 rounded-full border border-hairline transition-opacity"
                    style={{
                      background: checked ? color : "transparent",
                      borderColor: color,
                      opacity: checked ? 1 : 0.6,
                    }}
                  />
                  <span className="truncate text-ink" title={c.name}>{c.name}</span>
                  <span className="text-muted-foreground">({c.count})</span>
                  <div className="ml-auto flex items-center gap-1.5">
                    <span
                      className="h-3 w-3 shrink-0 rounded-full"
                      style={{ background: color }}
                      aria-hidden
                    />
                    <select
                      value={mapped}
                      onChange={(e) => onMappingChange(c.id, e.target.value)}
                      className="rounded-md border border-hairline bg-card px-1.5 py-1 text-[11px] text-ink focus:outline-none focus:ring-1 focus:ring-primary"
                    >
                      {internalOptions.map((o) => (
                        <option key={o.value} value={o.value}>{o.label}</option>
                      ))}
                    </select>
                  </div>
                </div>
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
    </div>
  );
}

/**
 * MetricsSection — Diary left-panel section that toggles which series
 * (Distance, Duration) appear in the Statistics chart and lets the user
 * pick a color per series via the standard three-dot menu.
 *
 * State is persisted via `metricsSettings` (localStorage), so the chart
 * picks up changes without prop drilling.
 */

import { useState } from "react";
import { motion } from "framer-motion";
import { ChevronRight, Eye, EyeOff, MoreHorizontal } from "lucide-react";
import {
  CategoryActionsMenu,
  STANDARD_COLORS_8,
} from "@/components/library/CategoryActionsMenu";
import {
  useMetricColor,
  useMetricVisible,
  type MetricKey,
} from "./metricsSettings";

export function MetricsSection({ title = "Metrics", canEdit = true }: { title?: string; canEdit?: boolean }) {
  const [open, setOpen] = useState(true);
  return (
    <div className="flex flex-col">
      <div className="group flex w-full items-center gap-1.5 rounded-md px-3 py-2 text-sm transition hover:bg-secondary/60">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          aria-label={open ? "Collapse" : "Expand"}
          className="flex min-w-0 flex-1 items-center gap-1.5 text-left text-ink"
        >
          <ChevronRight
            className={`h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform duration-200 ${open ? "rotate-90" : ""}`}
          />
          <span className="min-w-0 flex-1 truncate font-medium">{title}</span>
        </button>
      </div>

      <motion.div
        initial={false}
        animate={{ height: open ? "auto" : 0, opacity: open ? 1 : 0 }}
        transition={{
          height: { duration: 0.24, ease: [0.22, 1, 0.36, 1] },
          opacity: { duration: open ? 0.18 : 0.12, ease: "easeOut", delay: open ? 0.04 : 0 },
        }}
        style={{ overflow: open ? "visible" : "hidden", pointerEvents: open ? "auto" : "none" }}
      >
        <div className="mt-0.5 flex flex-col gap-0.5">
          <MetricRow metric="distance" label="Distance" />
          <MetricRow metric="duration" label="Duration" />
        </div>
      </motion.div>
    </div>
  );
}

function MetricRow({ metric, label }: { metric: MetricKey; label: string }) {
  const [visible, setVisible] = useMetricVisible(metric);
  const [color, setColor] = useMetricColor(metric);
  const hidden = !visible;

  return (
    <div
      onClick={(e) => {
        const tgt = e.target as HTMLElement;
        if (tgt.closest("button")) return;
        setVisible(!visible);
      }}
      className={`group flex cursor-default items-center gap-2 rounded-md px-2 py-1 text-xs transition-colors hover:bg-secondary/60 ${
        hidden ? "text-muted-foreground" : "text-ink"
      }`}
    >
      <span
        aria-hidden
        className="inline-block h-2.5 w-2.5 shrink-0 rounded-full border border-hairline"
        style={{ background: color, opacity: hidden ? 0.35 : 1 }}
      />
      <span className="min-w-0 flex-1 truncate">{label}</span>

      <CategoryActionsMenu
        trigger={
          <button
            type="button"
            onClick={(e) => e.stopPropagation()}
            className="grid h-5 w-5 shrink-0 place-items-center rounded text-muted-foreground/60 opacity-0 hover:bg-secondary hover:text-ink group-hover:opacity-100 data-[state=open]:opacity-100"
            aria-label="More"
          >
            <MoreHorizontal className="h-3 w-3" />
          </button>
        }
        currentColor={color}
        onColorChange={(hex) => setColor(hex)}
        allowCustomColor={false}
        colorSwatches={STANDARD_COLORS_8}
      />

      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setVisible(!visible);
        }}
        aria-label={hidden ? "Show" : "Hide"}
        className="grid h-5 w-5 shrink-0 place-items-center rounded hover:bg-secondary"
      >
        {hidden ? (
          <EyeOff className="h-3 w-3 text-muted-foreground/70" />
        ) : (
          <Eye className="h-3 w-3 text-muted-foreground/50 opacity-0 group-hover:opacity-100" />
        )}
      </button>
    </div>
  );
}

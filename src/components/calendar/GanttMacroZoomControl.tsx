/**
 * Centered Macro time-zoom control: − —— + (same header row as year + arrows).
 */

import { Minus, Plus } from "lucide-react";
import {
  ganttZoomIn,
  ganttZoomOut,
  useGanttMacroZoom,
} from "./ganttMacroZoom";

export function GanttMacroZoomControl() {
  const { canZoomIn, canZoomOut } = useGanttMacroZoom();

  return (
    <div
      className="flex items-center gap-2"
      role="group"
      aria-label="Zoom time scale"
    >
      <button
        type="button"
        aria-label="Zoom out"
        title="Zoom out"
        disabled={!canZoomOut}
        onClick={() => ganttZoomOut()}
        className="grid h-7 w-7 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-secondary hover:text-ink disabled:pointer-events-none disabled:opacity-35"
      >
        <Minus className="h-3.5 w-3.5" strokeWidth={2.25} />
      </button>
      <div
        aria-hidden
        className="h-px w-[4.5rem] bg-muted-foreground/35 sm:w-24"
      />
      <button
        type="button"
        aria-label="Zoom in"
        title="Zoom in"
        disabled={!canZoomIn}
        onClick={() => ganttZoomIn()}
        className="grid h-7 w-7 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-secondary hover:text-ink disabled:pointer-events-none disabled:opacity-35"
      >
        <Plus className="h-3.5 w-3.5" strokeWidth={2.25} />
      </button>
    </div>
  );
}

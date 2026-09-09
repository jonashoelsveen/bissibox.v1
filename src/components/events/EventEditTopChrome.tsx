import { createPortal } from "react-dom";
import { ChevronLeft } from "lucide-react";

/** Matches LeftPanel WIDTH — title fade aligns with panel's right edge. */
const PANEL_WIDTH = 256;
/** Same inset as calendar search — immediately right of the panel toggle. */
const CHROME_LEFT = 44;
const ROW_WIDTH = PANEL_WIDTH - CHROME_LEFT;

export function EventEditTopChrome({
  title,
  onBack,
}: {
  title: string;
  onBack: () => void;
}) {
  if (typeof document === "undefined") return null;

  return createPortal(
    <div
      className="fixed top-[6px] z-[200] flex h-7 min-w-0 items-center gap-0.5 text-muted-foreground"
      style={{ left: CHROME_LEFT, width: ROW_WIDTH }}
    >
      <button
        type="button"
        onClick={onBack}
        aria-label="Back to events"
        title="Back to events"
        className="grid h-7 w-7 shrink-0 place-items-center rounded-md transition-colors hover:bg-secondary/60 hover:text-ink"
      >
        <ChevronLeft className="h-4 w-4" strokeWidth={2} />
      </button>
      <span
        className="min-w-0 flex-1 overflow-hidden whitespace-nowrap text-sm font-medium"
        title={title}
        style={{
          WebkitMaskImage:
            "linear-gradient(to right, #000 0, #000 calc(100% - 12px), transparent 100%)",
          maskImage:
            "linear-gradient(to right, #000 0, #000 calc(100% - 12px), transparent 100%)",
        }}
      >
        {title}
      </span>
    </div>,
    document.body,
  );
}

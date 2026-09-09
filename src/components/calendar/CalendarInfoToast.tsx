import { useEffect } from "react";
import { createPortal } from "react-dom";
import { Info, X } from "lucide-react";
import { cn } from "@/lib/utils";

export function CalendarInfoToast({
  message,
  onDismiss,
}: {
  message: string;
  onDismiss: () => void;
}) {
  useEffect(() => {
    const timer = window.setTimeout(onDismiss, 4000);
    return () => window.clearTimeout(timer);
  }, [message, onDismiss]);

  if (typeof document === "undefined") return null;

  return createPortal(
    <div
      data-calendar-info-toast="true"
      className={cn(
        "pointer-events-auto fixed bottom-6 right-6 z-[9999] flex w-[360px] max-w-[calc(100vw-3rem)] cursor-default items-start gap-3 border border-[#D9E3F0] bg-[#F4F8FD] px-3.5 py-3 text-sm text-ink shadow-lg",
      )}
    >
      <Info className="mt-0.5 h-4 w-4 flex-none text-[#3B7DDD]" />
      <div className="min-w-0 flex-1 leading-snug">{message}</div>
      <button
        type="button"
        aria-label="Dismiss"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          onDismiss();
        }}
        className="ml-1 -mr-1 -mt-1 grid h-6 w-6 cursor-pointer place-items-center text-muted-foreground hover:text-ink"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>,
    document.body,
  );
}

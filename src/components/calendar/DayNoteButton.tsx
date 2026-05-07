/**
 * DayNoteButton + DayNotePanel — diary-only "note for the day" affordance.
 *
 * - Renders a small note icon that is invisible until the parent
 *   `[data-day-anchor]` element is hovered (light gray on hover).
 * - When a note exists, the icon is permanently shown in the same light-gray
 *   tone, and darkens on hover.
 * - Clicking opens a roll-down panel anchored beneath the column/cell whose
 *   width exactly matches the anchor element's width.
 * - Header: "Note dd.mm.yy". Body: a single auto-growing textarea that
 *   continues writing as it extends. Footer mirrors the session popover
 *   (⏎ to save · Add/Lagre button). The bottom edge is drag-resizable.
 * - Storage: localStorage under `diary:daynotes:{calId}` keyed by ISO day.
 */

import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { createPortal } from "react-dom";
import { motion } from "framer-motion";
import { StickyNote } from "lucide-react";

const STORAGE_PREFIX = "diary:daynotes:";
const CHANGE_EVENT = "diary-daynote-changed";

function dayKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function readAll(calId: string): Record<string, string> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_PREFIX + calId);
    return raw ? (JSON.parse(raw) as Record<string, string>) : {};
  } catch {
    return {};
  }
}

function writeNote(calId: string, date: Date, text: string) {
  if (typeof window === "undefined") return;
  try {
    const obj = readAll(calId);
    const k = dayKey(date);
    if (text.trim()) obj[k] = text;
    else delete obj[k];
    window.localStorage.setItem(STORAGE_PREFIX + calId, JSON.stringify(obj));
    window.dispatchEvent(
      new CustomEvent(CHANGE_EVENT, { detail: { calId } }),
    );
  } catch {
    /* ignore */
  }
}

export function useDayNote(calId: string, date: Date): string {
  const [val, setVal] = useState<string>(() => readAll(calId)[dayKey(date)] ?? "");
  useEffect(() => {
    setVal(readAll(calId)[dayKey(date)] ?? "");
    const onChange = (e: Event) => {
      const detail = (e as CustomEvent).detail as { calId?: string } | undefined;
      if (detail?.calId === calId) {
        setVal(readAll(calId)[dayKey(date)] ?? "");
      }
    };
    window.addEventListener(CHANGE_EVENT, onChange);
    return () => window.removeEventListener(CHANGE_EVENT, onChange);
  }, [calId, date]);
  return val;
}

interface DayNoteButtonProps {
  calId: string;
  date: Date;
  /**
   * "week" → small icon to the left inside the weekday-header cell.
   * "month" → small icon at the bottom-right corner of the day cell.
   */
  variant: "week" | "month";
  /** CSS selector for the anchor element (column/cell). Defaults to `[data-day-anchor]`. */
  anchorSelector?: string;
}

export function DayNoteButton({
  calId,
  date,
  variant,
  anchorSelector = "[data-day-anchor]",
}: DayNoteButtonProps) {
  const note = useDayNote(calId, date);
  const has = !!note.trim();
  const [open, setOpen] = useState(false);
  const [anchorRect, setAnchorRect] = useState<DOMRect | null>(null);
  const btnRef = useRef<HTMLButtonElement | null>(null);

  const refreshRect = () => {
    const anchor =
      btnRef.current?.closest(anchorSelector) as HTMLElement | null;
    if (anchor) setAnchorRect(anchor.getBoundingClientRect());
    else if (btnRef.current) setAnchorRect(btnRef.current.getBoundingClientRect());
  };

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    refreshRect();
    setOpen(true);
  };

  // Visibility / tone:
  //  - no note: invisible until anchor is hovered → light gray; hover icon → darker
  //  - has note: permanently light gray; hover icon → darker
  const visibility = has
    ? "opacity-100"
    : "opacity-0 group-hover/daynote-anchor:opacity-100";
  const tone = "text-muted-foreground/45 hover:text-muted-foreground";

  const positionClass =
    variant === "week"
      ? "absolute right-1.5 top-1/2 -translate-y-1/2"
      : "absolute bottom-1 right-1";

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        onMouseDown={(e) => e.stopPropagation()}
        onClick={handleClick}
        aria-label={has ? "Rediger dagsnotat" : "Legg til dagsnotat"}
        title={has ? "Rediger dagsnotat" : "Legg til dagsnotat"}
        className={[
          positionClass,
          "z-[3] grid h-5 w-5 place-items-center rounded transition-colors",
          visibility,
          tone,
        ].join(" ")}
      >
        <StickyNote className="h-3 w-3" strokeWidth={2.25} />
      </button>
      {open && anchorRect && (
        <DayNotePanel
          calId={calId}
          date={date}
          anchorRect={anchorRect}
          variant={variant}
          initialValue={note}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}

interface DayNotePanelProps {
  calId: string;
  date: Date;
  anchorRect: DOMRect;
  variant: "week" | "month";
  initialValue: string;
  onClose: () => void;
}

function DayNotePanel({
  calId,
  date,
  anchorRect,
  variant,
  initialValue,
  onClose,
}: DayNotePanelProps) {
  const [val, setVal] = useState(initialValue);
  const ref = useRef<HTMLDivElement | null>(null);
  const taRef = useRef<HTMLTextAreaElement | null>(null);
  const [extra, setExtra] = useState(0);

  // Default body height: ~6 hours (12 half-hour rows ≈ 240px) for week,
  // a little more than one month-day cell for month view.
  const DEFAULT_BODY_H = variant === "week" ? 240 : 160;

  // Auto-grow textarea: extends as the user writes past the bottom.
  useLayoutEffect(() => {
    const ta = taRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    const next = Math.max(DEFAULT_BODY_H + extra, ta.scrollHeight);
    ta.style.height = next + "px";
  }, [val, extra, DEFAULT_BODY_H]);

  // Outside click → save and close. Enter → save. Esc → close.
  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (!ref.current) return;
      if (!ref.current.contains(e.target as Node)) {
        writeNote(calId, date, val);
        onClose();
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      } else if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        writeNote(calId, date, val);
        onClose();
      }
    };
    window.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [val, calId, date, onClose]);

  // Drag-to-resize from the bottom edge.
  const onDragStart = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const startY = e.clientY;
    const startExtra = extra;
    const move = (ev: MouseEvent) => {
      const dy = ev.clientY - startY;
      setExtra(Math.max(0, startExtra + dy));
    };
    const up = () => {
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", up);
    };
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
  };

  const dateLabel = `${String(date.getDate()).padStart(2, "0")}.${String(
    date.getMonth() + 1,
  ).padStart(2, "0")}.${String(date.getFullYear() % 100).padStart(2, "0")}`;

  // Fixed width matching the new-session popover, regardless of screen size.
  // Anchored to the LEFT edge of the day column/cell so it narrows from the
  // right side of the day.
  const PANEL_W = 280;
  const margin = 8;
  let left = anchorRect.left;
  if (left + PANEL_W > window.innerWidth - margin) {
    left = Math.max(margin, window.innerWidth - PANEL_W - margin);
  }
  const style: CSSProperties = {
    top: anchorRect.bottom,
    left,
    width: PANEL_W,
    transformOrigin: "top left",
  };

  return createPortal(
    <motion.div
      ref={ref}
      className="fixed z-50"
      style={style}
      initial={{ opacity: 0, scaleY: 0.6, y: -4 }}
      animate={{ opacity: 1, scaleY: 1, y: 0 }}
      exit={{ opacity: 0, scaleY: 0.6, y: -4 }}
      transition={{ duration: 0.22, ease: [0.2, 0, 0, 1] }}
    >
      <div className="relative overflow-hidden rounded-b-md border border-t-0 border-ink/15 bg-card shadow-lg">
        {/* Dark-gray left bar — same color & width as the session-note bar */}
        <span
          aria-hidden
          className="pointer-events-none absolute left-0 top-0 h-full w-[3px]"
          style={{ background: "#9CA3AF" }}
        />
        {/* Header */}
        <div className="flex items-center justify-between border-b border-hairline pl-4 pr-3 py-1.5">
          <span className="text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
            Note {dateLabel}
          </span>
        </div>
        {/* Body */}
        <div className="pl-4 pr-3 py-2">
          <textarea
            ref={taRef}
            autoFocus
            value={val}
            onChange={(e) => setVal(e.target.value)}
            placeholder="Skriv notat…"
            className="block w-full resize-none bg-transparent text-[12px] leading-snug text-ink outline-none placeholder:text-muted-foreground/60"
            style={{ minHeight: DEFAULT_BODY_H + extra }}
          />
        </div>
        {/* Footer */}
        <div className="flex items-center justify-between border-t border-hairline px-3 py-2 text-[11px] text-muted-foreground">
          <span className="mono tabular-nums">⏎ for å lagre</span>
          <button
            type="button"
            onMouseDown={(e) => e.stopPropagation()}
            onClick={() => {
              writeNote(calId, date, val);
              onClose();
            }}
            className="rounded-md bg-primary px-2.5 py-1 text-[11.5px] font-medium text-primary-foreground hover:opacity-90"
          >
            {initialValue ? "Lagre" : "Legg til"}
          </button>
        </div>
        {/* Drag handle (bottom edge) */}
        <div
          onMouseDown={onDragStart}
          className="absolute bottom-0 left-0 right-0 h-1.5 cursor-ns-resize hover:bg-secondary/60"
          aria-hidden
        />
      </div>
    </motion.div>,
    document.body,
  );
}

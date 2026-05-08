/**
 * DayNoteButton + NotePanel — diary "note for the day" affordance and a
 * reusable read-only / editable note panel used by both day-notes and
 * session-notes.
 *
 * Hover behaviour:
 *  - Empty: icon invisible until parent `[data-day-anchor]` is hovered →
 *    light gray. Clicking opens the editable panel.
 *  - Has note: icon permanently light gray. Hovering the parent anchor
 *    auto-opens the panel in PREVIEW mode (read-only, no cursor, light gray
 *    background). Clicking the icon switches the panel into EDIT mode.
 *
 * Storage: localStorage under `diary:daynotes:{calId}` keyed by ISO day.
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
  variant: "week" | "month";
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
  // mode: null = closed, "preview" = hover read-only, "edit" = clicked
  const [mode, setMode] = useState<null | "preview" | "edit">(null);
  const [anchorRect, setAnchorRect] = useState<DOMRect | null>(null);
  const btnRef = useRef<HTMLButtonElement | null>(null);
  const anchorElRef = useRef<HTMLElement | null>(null);
  const closeTimerRef = useRef<number | null>(null);
  const cancelClose = () => {
    if (closeTimerRef.current != null) {
      window.clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
  };
  const scheduleClose = () => {
    cancelClose();
    closeTimerRef.current = window.setTimeout(() => {
      setMode((m) => (m === "edit" ? m : null));
    }, 120);
  };

  const refreshRect = () => {
    const anchor =
      btnRef.current?.closest(anchorSelector) as HTMLElement | null;
    if (anchor) {
      anchorElRef.current = anchor;
      setAnchorRect(anchor.getBoundingClientRect());
    } else if (btnRef.current) {
      setAnchorRect(btnRef.current.getBoundingClientRect());
    }
  };

  // Auto-preview only when the icon itself is hovered (not the whole cell),
  // so the note panel doesn't pop open every time the cursor enters the day cell.
  useEffect(() => {
    if (!has) return;
    const btn = btnRef.current;
    if (!btn) return;
    anchorElRef.current = btn;
    const onEnter = () => {
      cancelClose();
      setMode((m) => (m === "edit" ? m : "preview"));
      refreshRect();
    };
    btn.addEventListener("mouseenter", onEnter);
    return () => {
      btn.removeEventListener("mouseenter", onEnter);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [has, anchorSelector]);

  // While preview is open, close only when cursor leaves BOTH the anchor
  // and the floating panel (with a small bridge tolerance).
  useEffect(() => {
    if (mode !== "preview") return;
    const onMove = (e: MouseEvent) => {
      const anchor = anchorElRef.current;
      const panel = document.querySelector('[data-note-panel="1"]') as HTMLElement | null;
      const inside = (el: HTMLElement | null) => {
        if (!el) return false;
        const r = el.getBoundingClientRect();
        const pad = 6;
        return (
          e.clientX >= r.left - pad &&
          e.clientX <= r.right + pad &&
          e.clientY >= r.top - pad &&
          e.clientY <= r.bottom + pad
        );
      };
      if (!inside(anchor) && !inside(panel)) {
        scheduleClose();
      } else {
        cancelClose();
      }
    };
    window.addEventListener("mousemove", onMove);
    return () => window.removeEventListener("mousemove", onMove);
  }, [mode]);

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    refreshRect();
    setMode("edit");
  };

  const visibility = has
    ? "opacity-100"
    : "opacity-0 group-hover/daynote-anchor:opacity-100";
  const tone = "text-muted-foreground/45 hover:text-muted-foreground";

  const positionClass =
    variant === "week"
      ? "absolute right-1 top-1/2 -translate-y-1/2"
      : "absolute right-1 top-1/2 -translate-y-1/2";

  const dateLabel = `${String(date.getDate()).padStart(2, "0")}.${String(
    date.getMonth() + 1,
  ).padStart(2, "0")}.${String(date.getFullYear() % 100).padStart(2, "0")}`;

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
      {mode && anchorRect && (
        <NotePanel
          anchorRect={anchorRect}
          headerLabel={`Note ${dateLabel}`}
          initialValue={note}
          mode={mode}
          defaultBodyHeight={variant === "week" ? 240 : 160}
          closeOnEnter={false}
          onSave={(text) => writeNote(calId, date, text)}
          onClose={() => setMode(null)}
          onRequestEdit={() => { cancelClose(); setMode("edit"); }}
          onPanelMouseEnter={() => {
            cancelClose();
            if (has) setMode((m) => (m === "edit" ? m : "preview"));
          }}
          onPanelMouseLeave={() => scheduleClose()}
        />
      )}
    </>
  );
}

/* ============================================================
 * NotePanel — reusable note popover (read-only preview / editable)
 * ============================================================ */

export interface NotePanelProps {
  anchorRect: DOMRect;
  headerLabel?: string;
  initialValue: string;
  mode: "preview" | "edit";
  defaultBodyHeight?: number;
  /** Width override (defaults to 280, matching the new-session popover). */
  panelWidth?: number;
  /** Custom anchor placement: defaults to anchorRect.bottom + anchorRect.left. */
  placement?: "below-anchor-left" | "right-of-anchor-top";
  /** Default true: Enter saves and closes. Set false to allow newlines and let parent handle persistence. */
  closeOnEnter?: boolean;
  /** Default true: clicking outside saves and closes. Set false when parent owns dismissal. */
  closeOnOutsideClick?: boolean;
  /** Default true: shows the bottom Save bar in edit mode. */
  showFooter?: boolean;
  onSave: (text: string) => void;
  onClose: () => void;
  onRequestEdit?: () => void;
  onPanelMouseEnter?: () => void;
  onPanelMouseLeave?: () => void;
}

export function NotePanel({
  anchorRect,
  headerLabel,
  initialValue,
  mode,
  defaultBodyHeight = 240,
  panelWidth = 280,
  placement = "below-anchor-left",
  closeOnEnter = true,
  closeOnOutsideClick = true,
  showFooter = true,
  onSave,
  onClose,
  onRequestEdit,
  onPanelMouseEnter,
  onPanelMouseLeave,
}: NotePanelProps) {
  const [val, setVal] = useState(initialValue);
  const ref = useRef<HTMLDivElement | null>(null);
  const taRef = useRef<HTMLTextAreaElement | null>(null);
  const [extra, setExtra] = useState(0);
  const [footerHidden, setFooterHidden] = useState(false);
  const isEdit = mode === "edit";

  useEffect(() => {
    if (mode === "preview") setVal(initialValue);
  }, [initialValue, mode]);

  // When entering edit mode, place caret at end of existing text.
  useEffect(() => {
    if (!isEdit) return;
    const ta = taRef.current;
    if (!ta) return;
    const len = ta.value.length;
    requestAnimationFrame(() => {
      ta.focus();
      try {
        ta.setSelectionRange(len, len);
      } catch {
        /* ignore */
      }
    });
  }, [isEdit]);

  useLayoutEffect(() => {
    const ta = taRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    const next = Math.max(defaultBodyHeight + extra, ta.scrollHeight);
    ta.style.height = next + "px";
  }, [val, extra, defaultBodyHeight]);

  // Outside click + keys only matter in edit mode.
  useEffect(() => {
    if (!isEdit) return;
    const onDown = (e: MouseEvent) => {
      if (!closeOnOutsideClick) return;
      if (!ref.current) return;
      if (!ref.current.contains(e.target as Node)) {
        onSave(val);
        onClose();
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onSave(val);
        onClose();
      } else if (e.key === "Enter" && !e.shiftKey) {
        if (closeOnEnter) {
          e.preventDefault();
          onSave(val);
          onClose();
        } else {
          // Save current text, hide the footer and blur the textarea so the
          // caret disappears. The panel stays open; the user can click back
          // into the textarea to keep editing.
          e.preventDefault();
          onSave(val);
          setFooterHidden(true);
          taRef.current?.blur();
        }
      }
    };
    window.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [val, isEdit, onSave, onClose, closeOnEnter, closeOnOutsideClick]);

  const onDragStart = (e: React.MouseEvent) => {
    if (!isEdit) return;
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

  const margin = 8;
  let left: number;
  let top: number;
  let transformOrigin = "top left";
  if (placement === "right-of-anchor-top") {
    left = anchorRect.right + 6;
    top = anchorRect.top;
    if (left + panelWidth > window.innerWidth - margin) {
      left = Math.max(margin, anchorRect.left - panelWidth - 6);
      transformOrigin = "top right";
    }
  } else {
    left = anchorRect.left;
    top = anchorRect.bottom;
    if (left + panelWidth > window.innerWidth - margin) {
      left = Math.max(margin, window.innerWidth - panelWidth - margin);
    }
  }
  const style: CSSProperties = {
    top,
    left,
    width: panelWidth,
    transformOrigin,
  };

  const previewBg = "color-mix(in srgb, hsl(var(--muted-foreground)) 10%, transparent)";

  return createPortal(
    <motion.div
      ref={ref}
      data-note-panel="1"
      className="fixed z-50"
      style={style}
      initial={{ opacity: 0, scaleY: 0.6, y: -4 }}
      animate={{ opacity: 1, scaleY: 1, y: 0 }}
      exit={{ opacity: 0, scaleY: 0.6, y: -4 }}
      transition={{ duration: 0.22, ease: [0.2, 0, 0, 1] }}
      onMouseEnter={onPanelMouseEnter}
      onMouseLeave={onPanelMouseLeave}
      onClick={(e) => {
        if (!isEdit && onRequestEdit) {
          e.stopPropagation();
          onRequestEdit();
        }
      }}
    >
      <div
        className="relative overflow-hidden rounded-b-md border border-t border-ink/15 bg-card shadow-lg"
      >
        <span
          aria-hidden
          className="pointer-events-none absolute left-0 top-0 h-full w-[3px]"
          style={{ background: "#9CA3AF" }}
        />
        {headerLabel ? (
          <div className="flex items-center justify-between border-b border-hairline pl-4 pr-3 py-1.5">
            <span className="text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
              {headerLabel}
            </span>
          </div>
        ) : null}
        <div className="pl-4 pr-3 py-2">
          {isEdit ? (
            <textarea
              ref={taRef}
              value={val}
              onChange={(e) => { setVal(e.target.value); if (footerHidden) setFooterHidden(false); }}
              onFocus={() => { if (footerHidden) setFooterHidden(false); }}
              placeholder="Skriv notat…"
              className="block w-full resize-none bg-transparent text-[12px] leading-snug text-ink outline-none placeholder:text-muted-foreground/60"
              style={{ minHeight: defaultBodyHeight + extra }}
            />
          ) : (
            <div
              className="block w-full whitespace-pre-wrap text-[12px] leading-snug text-ink"
              style={{ minHeight: defaultBodyHeight, cursor: "text" }}
            >
              {initialValue || (
                <span className="text-muted-foreground/60">Skriv notat…</span>
              )}
            </div>
          )}
        </div>
        {isEdit && showFooter && !footerHidden && (
          <div className="flex items-center justify-between border-t border-hairline px-3 py-2 text-[11px] text-muted-foreground">
            <span className="mono tabular-nums">⏎ for å lagre</span>
            <button
              type="button"
              onMouseDown={(e) => e.stopPropagation()}
              onClick={() => {
                onSave(val);
                onClose();
              }}
              className="rounded-md bg-primary px-2.5 py-1 text-[11.5px] font-medium text-primary-foreground hover:opacity-90"
            >
              {initialValue ? "Lagre" : "Legg til"}
            </button>
          </div>
        )}
        {isEdit && (
          <div
            onMouseDown={onDragStart}
            className="absolute bottom-0 left-0 right-0 h-1.5 cursor-ns-resize hover:bg-secondary/60"
            aria-hidden
          />
        )}
      </div>
    </motion.div>,
    document.body,
  );
}

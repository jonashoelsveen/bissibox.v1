/**
 * DayGridType1 — "Type 1" daily timeline.
 *
 * A single-day vertical timeline that mirrors the Notion + Excel feel of the
 * other Type-1 views. Every row is a 15-minute cell, and every fourth row
 * (= one hour) shows a light-grey hour label in the left gutter.
 *
 * Interaction:
 *   - Click and hold to drag-select a vertical range of cells.
 *   - Release to "lock" the selection. Double-click the marked area to open
 *     the same Notion-style session creator used in Week / Month Type 1
 *     (text + 8 platform color dots).
 *   - The created session is stored with its start time and duration so
 *     Week and Month Type 1 can render it with proportional height.
 *
 * Storage:
 *   - Sessions are stored as `[#color|HH:MM|Nm] text` lines in the day's
 *     CellData.text — same per-day container key (session=0) used by Week
 *     and Month Type 1, so a session created in Day automatically appears
 *     in those views and vice-versa.
 */

import { motion, AnimatePresence } from "framer-motion";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { CellData, CellKey } from "./yearStore";
import { makeCellId } from "./yearStore";
import {
  parseSession,
  formatSession,
  formatTime,
  formatDuration,
} from "./sessionFormat";
import { GROUP_COLOR_PALETTE } from "../GroupColorPicker";

const WEEKDAYS_FULL = [
  "Søndag",
  "Mandag",
  "Tirsdag",
  "Onsdag",
  "Torsdag",
  "Fredag",
  "Lørdag",
];
const MONTHS_FULL = [
  "januar","februar","mars","april","mai","juni",
  "juli","august","september","oktober","november","desember",
];

const SLOT_MIN = 15; // minutes per cell
const SLOTS_PER_HOUR = 60 / SLOT_MIN; // 4
const TOTAL_SLOTS = 24 * SLOTS_PER_HOUR; // 96
const ROW_HEIGHT = 16; // px per 15-min cell → 1h = 64px
const GUTTER_W = 64; // px

function parseItems(text?: string) {
  if (!text) return [];
  return text
    .split("\n")
    .map((t) => t.trim())
    .filter(Boolean)
    .map((raw, idx) => ({ idx, raw, ...parseSession(raw) }));
}
function serializeItems(items: { raw: string }[]) {
  return items.map((i) => i.raw).join("\n");
}

export interface DayGridType1Props {
  calId: string;
  refDate: Date;
  data: Record<string, CellData>;
  onPrevDay: () => void;
  onNextDay: () => void;
  onCommitText: (k: CellKey, text: string) => void;
}

export function DayGridType1({
  calId,
  refDate,
  data,
  onPrevDay,
  onNextDay,
  onCommitText,
}: DayGridType1Props) {
  const cellKey = useMemo<CellKey>(
    () => ({
      year: refDate.getFullYear(),
      month: refDate.getMonth(),
      day: refDate.getDate(),
      session: 0,
    }),
    [refDate],
  );
  const cellId = makeCellId(calId, cellKey);
  const items = useMemo(() => parseItems(data[cellId]?.text), [data, cellId]);

  // ───────── Drag-to-select range of slots (Excel-style) ─────────

  /** Range of slot indices (inclusive on both ends) currently selected. */
  const [range, setRange] = useState<{ a: number; b: number } | null>(null);
  const dragStartRef = useRef<number | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const inRange = (i: number) =>
    range !== null && i >= Math.min(range.a, range.b) && i <= Math.max(range.a, range.b);

  useEffect(() => {
    const onUp = () => {
      dragStartRef.current = null;
    };
    window.addEventListener("mouseup", onUp);
    return () => window.removeEventListener("mouseup", onUp);
  }, []);

  // ───────── Inline creator / editor popover ─────────

  const [popover, setPopover] = useState<{
    rect: DOMRect;
    /** Existing item idx (>=0) or undefined for new */
    editIdx?: number;
    initialText: string;
    initialColor: string | null;
    /** Slot bounds for a new session (for the title/saved time) */
    startMin: number;
    durationMin: number;
  } | null>(null);

  const openCreatorForRange = useCallback(
    (anchor: HTMLElement) => {
      if (!range) return;
      const a = Math.min(range.a, range.b);
      const b = Math.max(range.a, range.b);
      setPopover({
        rect: anchor.getBoundingClientRect(),
        initialText: "",
        initialColor: null,
        startMin: a * SLOT_MIN,
        durationMin: (b - a + 1) * SLOT_MIN,
      });
    },
    [range],
  );

  const openEditor = useCallback(
    (idx: number, anchor: HTMLElement) => {
      const it = items[idx];
      if (!it) return;
      setPopover({
        rect: anchor.getBoundingClientRect(),
        editIdx: idx,
        initialText: it.text,
        initialColor: it.color,
        startMin: it.startMin ?? 0,
        durationMin: it.durationMin ?? SLOT_MIN,
      });
    },
    [items],
  );

  const closePopover = useCallback(() => setPopover(null), []);

  const commitItem = useCallback(
    (text: string, color: string | null) => {
      if (!popover) return;
      const t = text.trim();
      const list = parseItems(data[cellId]?.text);
      let next: { raw: string }[];
      if (popover.editIdx !== undefined) {
        if (!t) {
          next = list.filter((it) => it.idx !== popover.editIdx);
        } else {
          next = list.map((it) =>
            it.idx === popover.editIdx
              ? {
                  raw: formatSession({
                    color,
                    startMin: popover.startMin,
                    durationMin: popover.durationMin,
                    text: t,
                  }),
                }
              : { raw: it.raw },
          );
        }
      } else {
        if (!t) {
          closePopover();
          return;
        }
        next = [
          ...list.map((it) => ({ raw: it.raw })),
          {
            raw: formatSession({
              color,
              startMin: popover.startMin,
              durationMin: popover.durationMin,
              text: t,
            }),
          },
        ];
      }
      onCommitText(cellKey, serializeItems(next));
      setRange(null);
      closePopover();
    },
    [popover, data, cellId, cellKey, onCommitText, closePopover],
  );

  // ───────── Header label ─────────

  const headerLabel = `${WEEKDAYS_FULL[refDate.getDay()]} ${refDate.getDate()}. ${MONTHS_FULL[refDate.getMonth()]} ${refDate.getFullYear()}`;
  const isToday = (() => {
    const t = new Date();
    return (
      t.getFullYear() === refDate.getFullYear() &&
      t.getMonth() === refDate.getMonth() &&
      t.getDate() === refDate.getDate()
    );
  })();

  // ───────── Render ─────────

  return (
    <div ref={containerRef} className="relative flex h-full w-full flex-col bg-card">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-hairline px-4 py-3">
        <div className="flex items-baseline gap-3">
          <h2 className="text-[15px] font-semibold tracking-tight text-ink">
            {headerLabel}
          </h2>
          {isToday && (
            <span className="mono text-[11px] uppercase tracking-[0.12em] text-primary">
              I dag
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={onPrevDay}
            aria-label="Forrige dag"
            className="grid h-7 w-7 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-secondary hover:text-ink"
          >
            <ChevronLeft className="h-4 w-4" strokeWidth={2.25} />
          </button>
          <button
            type="button"
            onClick={onNextDay}
            aria-label="Neste dag"
            className="grid h-7 w-7 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-secondary hover:text-ink"
          >
            <ChevronRight className="h-4 w-4" strokeWidth={2.25} />
          </button>
        </div>
      </div>

      {/* Scrollable timeline */}
      <div className="relative flex-1 overflow-auto bg-[#FAFAFA]">
        <div
          className="relative grid"
          style={{
            gridTemplateColumns: `${GUTTER_W}px 1fr`,
            gridAutoRows: `${ROW_HEIGHT}px`,
          }}
          onMouseLeave={() => {
            // If the user drags out of the body, end the drag gracefully.
            // Selection persists; release mouse to lock it.
          }}
        >
          {Array.from({ length: TOTAL_SLOTS }, (_, i) => {
            const isHourMark = i % SLOTS_PER_HOUR === 0;
            const hour = Math.floor(i / SLOTS_PER_HOUR);
            const selected = inRange(i);
            return (
              <Fragment key={i}>
                {/* Gutter cell: hour label every 4 rows */}
                <div
                  className="relative border-r border-hairline pr-2 text-right"
                  style={{
                    borderTop: isHourMark ? "1px solid var(--hairline)" : "none",
                  }}
                >
                  {isHourMark && (
                    <span className="absolute -top-2 right-2 mono text-[10.5px] tabular-nums text-muted-foreground/60">
                      {String(hour).padStart(2, "0")}:00
                    </span>
                  )}
                </div>
                {/* Body cell */}
                <div
                  data-slot={i}
                  onMouseDown={(e) => {
                    if ((e.target as HTMLElement).dataset.role === "session") return;
                    e.preventDefault();
                    dragStartRef.current = i;
                    setRange({ a: i, b: i });
                  }}
                  onMouseEnter={() => {
                    if (dragStartRef.current !== null) {
                      setRange({ a: dragStartRef.current, b: i });
                    }
                  }}
                  onDoubleClick={(e) => {
                    if ((e.target as HTMLElement).dataset.role === "session") return;
                    // Ensure at least this cell is in range before opening
                    if (!range || !inRange(i)) {
                      setRange({ a: i, b: i });
                    }
                    openCreatorForRange(e.currentTarget as HTMLElement);
                  }}
                  className={[
                    "relative border-l-0 border-r-0 transition-colors",
                    isHourMark ? "border-t border-hairline" : "border-t border-hairline/40",
                    selected
                      ? "bg-primary/15"
                      : "hover:bg-secondary/40",
                  ].join(" ")}
                  style={{ cursor: "cell" }}
                />
              </Fragment>
            );
          })}

          {/* Sessions overlay — absolute-positioned cards on the body column */}
          <div
            className="pointer-events-none absolute inset-y-0"
            style={{ left: GUTTER_W, right: 0 }}
          >
            <AnimatePresence initial={false}>
              {items.map((it) => {
                const start = it.startMin ?? 0;
                const dur = Math.max(SLOT_MIN, it.durationMin ?? SLOT_MIN);
                const top = (start / SLOT_MIN) * ROW_HEIGHT;
                const height = (dur / SLOT_MIN) * ROW_HEIGHT - 2;
                const color = it.color ?? "#1960C4";
                return (
                  <motion.button
                    key={`s-${it.idx}-${it.raw}`}
                    type="button"
                    layout
                    initial={{ opacity: 0, y: -2 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -2 }}
                    transition={{ duration: 0.14, ease: [0.2, 0, 0, 1] }}
                    data-role="session"
                    onClick={(e) => {
                      e.stopPropagation();
                      openEditor(it.idx, e.currentTarget as HTMLElement);
                    }}
                    className="pointer-events-auto absolute left-1 right-1 flex flex-col items-start gap-0.5 overflow-hidden rounded-[4px] border px-2 py-1 text-left shadow-[0_1px_0_rgba(15,23,42,0.04)] transition-all hover:-translate-y-px hover:shadow-[0_3px_8px_rgba(15,23,42,0.10)]"
                    style={{
                      top,
                      height,
                      backgroundColor: `${color}1F`,
                      borderColor: `${color}66`,
                      boxShadow: `inset 3px 0 0 ${color}`,
                    }}
                    title={it.text}
                  >
                    <span className="truncate text-[12px] font-medium leading-tight text-ink">
                      {it.text}
                    </span>
                    {height >= 28 && (
                      <span className="mono text-[10.5px] tabular-nums text-muted-foreground">
                        {formatTime(start)} · {formatDuration(dur)}
                      </span>
                    )}
                  </motion.button>
                );
              })}
            </AnimatePresence>
          </div>

          {/* Range overlay summary chip — shows time range while dragging */}
          {range && (
            <RangeSummary
              startMin={Math.min(range.a, range.b) * SLOT_MIN}
              endMin={(Math.max(range.a, range.b) + 1) * SLOT_MIN}
            />
          )}
        </div>

        {popover && (
          <PopoverEditor
            initialText={popover.initialText}
            initialColor={popover.initialColor}
            isEdit={popover.editIdx !== undefined}
            metaLabel={`${formatTime(popover.startMin)} · ${formatDuration(popover.durationMin)}`}
            anchor={popover.rect}
            onClose={closePopover}
            onCommit={commitItem}
          />
        )}
      </div>
    </div>
  );
}

/** React.Fragment shortcut local alias to keep the JSX terse. */
function Fragment({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}

function RangeSummary({ startMin, endMin }: { startMin: number; endMin: number }) {
  const top = (startMin / SLOT_MIN) * ROW_HEIGHT;
  const height = ((endMin - startMin) / SLOT_MIN) * ROW_HEIGHT;
  const dur = endMin - startMin;
  return (
    <div
      className="pointer-events-none absolute z-10 flex items-start justify-end pr-2"
      style={{ top, left: GUTTER_W, right: 0, height }}
    >
      <span className="mt-1 rounded bg-primary/90 px-1.5 py-0.5 mono text-[10px] font-medium tabular-nums text-primary-foreground shadow">
        {formatTime(startMin)}–{formatTime(endMin)} · {formatDuration(dur)}
      </span>
    </div>
  );
}

interface PopoverEditorProps {
  initialText: string;
  initialColor: string | null;
  isEdit: boolean;
  metaLabel: string;
  anchor: DOMRect;
  onClose: () => void;
  onCommit: (text: string, color: string | null) => void;
}

function PopoverEditor({
  initialText,
  initialColor,
  isEdit,
  metaLabel,
  anchor,
  onClose,
  onCommit,
}: PopoverEditorProps) {
  const [value, setValue] = useState(initialText);
  const [color, setColor] = useState<string | null>(initialColor);
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (!ref.current) return;
      if (!ref.current.contains(e.target as Node)) {
        const t = value.trim();
        if (t || isEdit) onCommit(t, color);
        else onClose();
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      } else if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        const t = value.trim();
        if (t || isEdit) onCommit(t, color);
      }
    };
    window.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [value, color, onCommit, onClose, isEdit]);

  const POPOVER_W = 280;
  const POPOVER_H = 200;
  const margin = 8;
  let top = anchor.bottom + margin;
  let left = anchor.left;
  if (top + POPOVER_H > window.innerHeight) {
    top = Math.max(margin, anchor.top - POPOVER_H - margin);
  }
  if (left + POPOVER_W > window.innerWidth) {
    left = Math.max(margin, window.innerWidth - POPOVER_W - margin);
  }

  return (
    <div
      ref={ref}
      className="fixed z-50 overflow-hidden rounded-md border border-ink/15 bg-card shadow-lg"
      style={{ top, left, width: POPOVER_W }}
    >
      <div className="flex items-center justify-between border-b border-hairline px-3 py-2">
        <span className="text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
          {isEdit ? "Rediger økt" : "Ny økt"}
        </span>
        <span className="mono text-[10.5px] tabular-nums text-muted-foreground">
          {metaLabel}
        </span>
      </div>
      <input
        autoFocus
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="f.eks. Intervaller 5×4min"
        className="block w-full bg-transparent px-3 py-2.5 text-[13px] text-ink outline-none placeholder:text-muted-foreground/60"
      />
      {/* Color row — centered, no label */}
      <div className="flex items-center justify-center gap-2.5 border-t border-hairline px-3 py-2.5">
        {GROUP_COLOR_PALETTE.map((c) => {
          const selected = color?.toLowerCase() === c.value.toLowerCase();
          return (
            <button
              key={c.value}
              type="button"
              title={c.name}
              aria-label={c.name}
              aria-pressed={selected}
              onClick={() => setColor(selected ? null : c.value)}
              className={[
                "h-3 w-3 rounded-full border transition-transform hover:scale-125",
                selected
                  ? "border-ink/70 ring-2 ring-ink/30 ring-offset-1 ring-offset-card"
                  : "border-black/15",
              ].join(" ")}
              style={{ background: c.value }}
            />
          );
        })}
      </div>
      <div className="flex items-center justify-between border-t border-hairline px-3 py-2 text-[11px] text-muted-foreground">
        <span className="mono tabular-nums">
          {isEdit ? "⏎ for å lagre · tøm for å slette" : "⏎ for å lagre"}
        </span>
        <button
          type="button"
          onClick={() => {
            const t = value.trim();
            if (t || isEdit) onCommit(t, color);
          }}
          className="rounded-md bg-primary px-2.5 py-1 text-[11.5px] font-medium text-primary-foreground hover:opacity-90"
        >
          {isEdit ? "Lagre" : "Legg til"}
        </button>
      </div>
    </div>
  );
}

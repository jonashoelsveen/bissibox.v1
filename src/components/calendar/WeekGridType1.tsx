/**
 * WeekGridType1 — "Type 1" weekly calendar.
 *
 * Aesthetic: Notion (Inter, hairline borders, soft shadows, rounded session
 * cards, generous whitespace). Logic: Excel (rigid 7-column grid, fixed
 * column widths, sticky day headers, keyboard-driven focus, optimistic
 * writes, drag-and-drop with ghost preview, snap-to-grid).
 *
 * Data model:
 *   - Reuses yearStore CellData. Each weekday is mapped to a synthetic
 *     CellKey with session=0 (day-level container). Multiple sessions inside
 *     a day are stored as newline-separated entries in `text` — same shape
 *     as MonthGridType1 so a session card naturally survives drag from
 *     month → week and week → month without a schema change.
 *
 * Interaction:
 *   - Click a column or card to focus it (the active focus is a (col,item)
 *     tuple — col=0..6, item=-1 for the column header focus, item>=0 for
 *     individual cards).
 *   - Double-click anywhere on the empty area of a day-column opens an
 *     inline session creator at that vertical position.
 *   - Arrow keys move focus between columns and between cards within a
 *     column. Enter opens the creator on the focused column.
 *   - Cmd/Ctrl+N opens the creator on the focused column instantly.
 *   - Cards are draggable across columns; a translucent "ghost" indicates
 *     where the card will land (snap-to-bottom of target column).
 */

import { motion, AnimatePresence, LayoutGroup } from "framer-motion";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import type { CellData, CellKey } from "./yearStore";
import { makeCellId } from "./yearStore";
import { GROUP_COLOR_PALETTE } from "../GroupColorPicker";

/**
 * Items can be prefixed with `[#RRGGBB] ` to encode a user-chosen color.
 * This survives the existing newline-serialized text storage without a
 * schema change.
 */
const COLOR_PREFIX_RE = /^\[(#[0-9a-fA-F]{6})\]\s*/;
function splitColor(raw: string): { color: string | null; text: string } {
  const m = raw.match(COLOR_PREFIX_RE);
  if (m) return { color: m[1], text: raw.slice(m[0].length) };
  return { color: null, text: raw };
}
function joinColor(color: string | null, text: string): string {
  return color ? `[${color}] ${text}` : text;
}

const WEEKDAYS_FULL = [
  "Mandag",
  "Tirsdag",
  "Onsdag",
  "Torsdag",
  "Fredag",
  "Lørdag",
  "Søndag",
];
const WEEKDAYS_SHORT = ["Man", "Tir", "Ons", "Tor", "Fre", "Lør", "Søn"];
const MONTHS_FULL = [
  "Januar","Februar","Mars","April","Mai","Juni",
  "Juli","August","September","Oktober","November","Desember",
];

function dowMon0(date: Date) {
  const d = date.getDay();
  return d === 0 ? 6 : d - 1;
}

/** Returns the Monday of the ISO-week containing `ref`. */
function startOfWeek(ref: Date) {
  const d = new Date(ref.getFullYear(), ref.getMonth(), ref.getDate());
  d.setDate(d.getDate() - dowMon0(d));
  return d;
}

/** ISO week number for the given Monday-anchored date. */
function isoWeekNumber(date: Date) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil(((+d - +yearStart) / 86400000 + 1) / 7);
}

interface DayItem {
  idx: number;
  text: string;
}
function parseItems(text?: string): DayItem[] {
  if (!text) return [];
  return text
    .split("\n")
    .map((t) => t.trim())
    .filter(Boolean)
    .map((t, idx) => ({ idx, text: t }));
}
function serializeItems(items: { text: string }[]): string {
  return items.map((i) => i.text).join("\n");
}

/**
 * Light, desaturated category palette. Picked from session keywords so the
 * "color-coding" requirement works without a schema change.
 *   - løp / run     → blue
 *   - styrke / kraft → green
 *   - tempo / fart  → amber
 *   - hvile / rest  → muted gray
 *   - default       → neutral
 */
function categorize(text: string): {
  bg: string;
  border: string;
  dot: string;
  ink: string;
} {
  const t = text.toLowerCase();
  if (/\b(l[øo]p|run|jog|intervall)\b/.test(t)) {
    return {
      bg: "bg-[oklch(0.96_0.02_240)]",
      border: "border-[oklch(0.85_0.05_240)]",
      dot: "bg-[oklch(0.62_0.12_240)]",
      ink: "text-[oklch(0.32_0.08_240)]",
    };
  }
  if (/\b(styrke|kraft|strength|vekt)\b/.test(t)) {
    return {
      bg: "bg-[oklch(0.96_0.03_150)]",
      border: "border-[oklch(0.85_0.06_150)]",
      dot: "bg-[oklch(0.58_0.12_150)]",
      ink: "text-[oklch(0.32_0.08_150)]",
    };
  }
  if (/\b(tempo|fart|sprint|terskel)\b/.test(t)) {
    return {
      bg: "bg-[oklch(0.96_0.04_75)]",
      border: "border-[oklch(0.85_0.07_75)]",
      dot: "bg-[oklch(0.65_0.13_75)]",
      ink: "text-[oklch(0.34_0.09_75)]",
    };
  }
  if (/\b(hvile|rest|fri|pause)\b/.test(t)) {
    return {
      bg: "bg-muted/40",
      border: "border-hairline",
      dot: "bg-muted-foreground/60",
      ink: "text-muted-foreground",
    };
  }
  return {
    bg: "bg-secondary/70",
    border: "border-hairline",
    dot: "bg-ink/50",
    ink: "text-ink",
  };
}

export interface WeekGridType1Props {
  calId: string;
  /** A reference date inside the week to render. */
  refDate: Date;
  data: Record<string, CellData>;
  onPrevWeek: () => void;
  onNextWeek: () => void;
  onCommitText: (k: CellKey, text: string) => void;
}

interface FocusPos {
  col: number;
  /** -1 = column header focused, >=0 = item index focused */
  item: number;
}

export function WeekGridType1({
  calId,
  refDate,
  data,
  onPrevWeek,
  onNextWeek,
  onCommitText,
}: WeekGridType1Props) {
  const monday = useMemo(() => startOfWeek(refDate), [refDate]);
  const days = useMemo(
    () =>
      Array.from({ length: 7 }, (_, i) => {
        const d = new Date(monday);
        d.setDate(monday.getDate() + i);
        return d;
      }),
    [monday],
  );

  const today = new Date();
  const isToday = (d: Date) =>
    d.getFullYear() === today.getFullYear() &&
    d.getMonth() === today.getMonth() &&
    d.getDate() === today.getDate();

  const [focus, setFocus] = useState<FocusPos>(() => {
    const t = days.findIndex(isToday);
    return { col: t >= 0 ? t : 0, item: -1 };
  });

  // When the visible week changes, snap focus to today (if visible) or col 0
  useEffect(() => {
    const t = days.findIndex(isToday);
    setFocus({ col: t >= 0 ? t : 0, item: -1 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [monday.getTime()]);

  const containerRef = useRef<HTMLDivElement | null>(null);

  // ───────────────────────── Items per day ─────────────────────────

  const dayKeys = useMemo<CellKey[]>(
    () =>
      days.map((d) => ({
        year: d.getFullYear(),
        month: d.getMonth(),
        day: d.getDate(),
        session: 0,
      })),
    [days],
  );
  const itemsByCol = useMemo(
    () =>
      dayKeys.map((k) => parseItems(data[makeCellId(calId, k)]?.text)),
    [dayKeys, data, calId],
  );

  // ───────────────────────── Inline creator popover ─────────────────────────

  const [creator, setCreator] = useState<{
    col: number;
    rect: DOMRect;
    /** index of existing item to edit; undefined for new */
    editIdx?: number;
    initialText?: string;
    initialColor?: string | null;
  } | null>(null);

  const openCreator = useCallback(
    (col: number, anchor: HTMLElement) => {
      setCreator({ col, rect: anchor.getBoundingClientRect() });
    },
    [],
  );
  const openEditor = useCallback(
    (col: number, idx: number, raw: string, anchor: HTMLElement) => {
      const { color, text } = splitColor(raw);
      setCreator({
        col,
        rect: anchor.getBoundingClientRect(),
        editIdx: idx,
        initialText: text,
        initialColor: color,
      });
    },
    [],
  );
  const closeCreator = useCallback(() => setCreator(null), []);

  const appendSession = useCallback(
    (col: number, text: string, color: string | null) => {
      const t = text.trim();
      if (!t) return;
      const k = dayKeys[col];
      const existing = parseItems(data[makeCellId(calId, k)]?.text);
      const next = serializeItems([...existing, { text: joinColor(color, t) }]);
      onCommitText(k, next);
    },
    [dayKeys, data, calId, onCommitText],
  );

  const updateSession = useCallback(
    (col: number, idx: number, text: string, color: string | null) => {
      const k = dayKeys[col];
      const existing = parseItems(data[makeCellId(calId, k)]?.text);
      const t = text.trim();
      let next: { text: string }[];
      if (!t) {
        // empty → delete
        next = existing.filter((_, i) => i !== idx);
      } else {
        next = existing.map((it, i) =>
          i === idx ? { text: joinColor(color, t) } : { text: it.text },
        );
      }
      onCommitText(k, serializeItems(next));
    },
    [dayKeys, data, calId, onCommitText],
  );

  // ───────────────────────── Keyboard ─────────────────────────

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (
        t &&
        (t.tagName === "INPUT" ||
          t.tagName === "TEXTAREA" ||
          t.isContentEditable)
      )
        return;
      if (creator) return;

      // Cmd/Ctrl + N → quick add on focused column
      if ((e.metaKey || e.ctrlKey) && (e.key === "n" || e.key === "N")) {
        e.preventDefault();
        const el = containerRef.current?.querySelector<HTMLElement>(
          `[data-week-col="${focus.col}"]`,
        );
        if (el) openCreator(focus.col, el);
        return;
      }
      if (e.metaKey || e.ctrlKey || e.altKey) return;

      if (e.key === "ArrowRight") {
        e.preventDefault();
        setFocus((f) => ({ col: Math.min(6, f.col + 1), item: -1 }));
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        setFocus((f) => ({ col: Math.max(0, f.col - 1), item: -1 }));
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        setFocus((f) => {
          const max = itemsByCol[f.col].length - 1;
          return { col: f.col, item: Math.min(max, f.item + 1) };
        });
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setFocus((f) => ({ col: f.col, item: Math.max(-1, f.item - 1) }));
      } else if (e.key === "Enter") {
        e.preventDefault();
        const el = containerRef.current?.querySelector<HTMLElement>(
          `[data-week-col="${focus.col}"]`,
        );
        if (el) openCreator(focus.col, el);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [focus, openCreator, creator, itemsByCol]);

  // ───────────────────────── Drag-and-drop items ─────────────────────────

  const [dragItem, setDragItem] = useState<{
    fromCol: number;
    text: string;
  } | null>(null);
  const [dragOverCol, setDragOverCol] = useState<number | null>(null);

  const moveItem = useCallback(
    (fromCol: number, toCol: number, text: string) => {
      if (fromCol === toCol) return;
      const fromKey = dayKeys[fromCol];
      const toKey = dayKeys[toCol];
      const fromItems = parseItems(data[makeCellId(calId, fromKey)]?.text);
      const toItems = parseItems(data[makeCellId(calId, toKey)]?.text);
      onCommitText(
        fromKey,
        serializeItems(fromItems.filter((i) => i.text !== text)),
      );
      onCommitText(
        toKey,
        serializeItems([...toItems, { text }]),
      );
    },
    [dayKeys, data, calId, onCommitText],
  );

  // ───────────────────────── Header label ─────────────────────────

  const sunday = days[6];
  const sameMonth = monday.getMonth() === sunday.getMonth();
  const sameYear = monday.getFullYear() === sunday.getFullYear();
  const headerLabel = sameMonth
    ? `${monday.getDate()}.–${sunday.getDate()}. ${MONTHS_FULL[monday.getMonth()]} ${sunday.getFullYear()}`
    : sameYear
      ? `${monday.getDate()}. ${MONTHS_FULL[monday.getMonth()]} – ${sunday.getDate()}. ${MONTHS_FULL[sunday.getMonth()]} ${sunday.getFullYear()}`
      : `${monday.getDate()}. ${MONTHS_FULL[monday.getMonth()]} ${monday.getFullYear()} – ${sunday.getDate()}. ${MONTHS_FULL[sunday.getMonth()]} ${sunday.getFullYear()}`;
  const weekNo = isoWeekNumber(monday);

  return (
    <div
      ref={containerRef}
      className="relative flex h-full w-full flex-col bg-[#FAFAFA]"
      tabIndex={0}
    >
      {/* Notion-style minimalist header */}
      <div className="flex items-center justify-between border-b border-hairline bg-card px-4 py-3">
        <div className="flex items-baseline gap-3">
          <h2 className="text-[15px] font-semibold tracking-tight text-ink">
            {headerLabel}
          </h2>
          <span className="mono text-[11px] uppercase tracking-[0.12em] text-muted-foreground tabular-nums">
            Uke {weekNo}
          </span>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={onPrevWeek}
            aria-label="Forrige uke"
            className="grid h-7 w-7 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-secondary hover:text-ink"
          >
            <ChevronLeft className="h-4 w-4" strokeWidth={2.25} />
          </button>
          <button
            type="button"
            onClick={onNextWeek}
            aria-label="Neste uke"
            className="grid h-7 w-7 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-secondary hover:text-ink"
          >
            <ChevronRight className="h-4 w-4" strokeWidth={2.25} />
          </button>
        </div>
      </div>

      {/* The 7-column grid. Headers and bodies share one CSS grid so columns
          are guaranteed to align pixel-perfectly (Excel-trust). */}
      <div className="relative flex-1 overflow-auto">
        <LayoutGroup>
          <div
            className="grid min-h-full"
            style={
              {
                gridTemplateColumns: "repeat(7, minmax(160px, 1fr))",
                gridTemplateRows: "auto 1fr",
              } as CSSProperties
            }
          >
            {/* Sticky day headers */}
            {days.map((d, col) => {
              const today = isToday(d);
              const focused = focus.col === col;
              return (
                <div
                  key={`h-${col}`}
                  className={[
                    "sticky top-0 z-10 border-b border-r border-hairline bg-card/95 px-3 py-2 backdrop-blur",
                    col === 6 ? "border-r-0" : "",
                  ].join(" ")}
                >
                  <div className="flex items-baseline justify-between">
                    <span
                      className={[
                        "text-[11px] font-medium uppercase tracking-[0.1em]",
                        today
                          ? "text-primary"
                          : focused
                            ? "text-ink"
                            : "text-muted-foreground",
                      ].join(" ")}
                    >
                      {WEEKDAYS_SHORT[col]}
                    </span>
                    <span
                      className={[
                        "grid h-6 min-w-[24px] place-items-center rounded-full px-1.5 text-[12px] font-semibold tabular-nums",
                        today
                          ? "bg-primary text-primary-foreground"
                          : focused
                            ? "bg-secondary text-ink"
                            : "text-ink/80",
                      ].join(" ")}
                    >
                      {d.getDate()}
                    </span>
                  </div>
                  <div className="mt-0.5 text-[10.5px] text-muted-foreground/70">
                    {WEEKDAYS_FULL[col]}
                  </div>
                </div>
              );
            })}

            {/* Day columns (bodies) */}
            {days.map((d, col) => {
              const items = itemsByCol[col];
              const focused = focus.col === col;
              const isWeekendCol = col >= 5;
              const isDragTarget =
                dragItem !== null && dragOverCol === col && dragItem.fromCol !== col;
              return (
                <div
                  key={`b-${col}`}
                  data-week-col={col}
                  onClick={() => setFocus({ col, item: -1 })}
                  onDoubleClick={(e) => {
                    if ((e.target as HTMLElement).dataset.role === "item") return;
                    openCreator(col, e.currentTarget);
                  }}
                  onDragOver={(e) => {
                    if (!dragItem) return;
                    e.preventDefault();
                    if (dragOverCol !== col) setDragOverCol(col);
                  }}
                  onDragLeave={() => {
                    if (dragOverCol === col) setDragOverCol(null);
                  }}
                  onDrop={(e) => {
                    if (!dragItem) return;
                    e.preventDefault();
                    moveItem(dragItem.fromCol, col, dragItem.text);
                    setDragItem(null);
                    setDragOverCol(null);
                  }}
                  className={[
                    "group/col relative flex min-h-[60vh] flex-col gap-1.5 border-r border-hairline p-2 transition-colors",
                    col === 6 ? "border-r-0" : "",
                    isWeekendCol ? "bg-[#F5F5F5]" : "bg-[#FAFAFA]",
                    focused ? "bg-secondary/30" : "",
                    isDragTarget ? "bg-primary/5" : "",
                  ].join(" ")}
                  style={{ cursor: "cell" }}
                >
                  <AnimatePresence initial={false}>
                    {items.map((it, i) => {
                      const { color: customColor, text: displayText } = splitColor(it.text);
                      const cat = categorize(displayText);
                      const itemFocused = focused && focus.item === i;
                      return (
                        <motion.div
                          key={`${col}-${it.idx}-${it.text}`}
                          layout
                          initial={{ opacity: 0, y: -2 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: -2 }}
                          transition={{ duration: 0.14, ease: [0.2, 0, 0, 1] }}
                          data-role="item"
                          draggable
                          onDragStart={(e) => {
                            const ev = e as unknown as DragEvent;
                            if (ev.dataTransfer) {
                              ev.dataTransfer.effectAllowed = "move";
                              ev.dataTransfer.setData("text/plain", it.text);
                            }
                            setDragItem({ fromCol: col, text: it.text });
                          }}
                          onDragEnd={() => {
                            setDragItem(null);
                            setDragOverCol(null);
                          }}
                          onClick={(e) => {
                            e.stopPropagation();
                            setFocus({ col, item: i });
                            openEditor(
                              col,
                              i,
                              it.text,
                              e.currentTarget as HTMLElement,
                            );
                          }}
                          className={[
                            "group/card relative flex items-start gap-2 rounded-[4px] border px-2 py-1.5 shadow-[0_1px_0_rgba(15,23,42,0.04)] transition-all",
                            customColor ? "" : cat.bg,
                            customColor ? "" : cat.border,
                            itemFocused
                              ? "outline outline-2 outline-primary outline-offset-[-2px]"
                              : "hover:-translate-y-px hover:shadow-[0_3px_8px_rgba(15,23,42,0.10)] hover:border-ink/25",
                          ].join(" ")}
                          style={
                            customColor
                              ? {
                                  backgroundColor: `${customColor}1A`, // ~10% alpha
                                  borderColor: `${customColor}66`,
                                }
                              : undefined
                          }
                          title={displayText}
                        >
                          <span
                            className={[
                              "mt-1 h-1.5 w-1.5 shrink-0 rounded-full",
                              customColor ? "" : cat.dot,
                            ].join(" ")}
                            style={
                              customColor
                                ? { backgroundColor: customColor }
                                : undefined
                            }
                          />
                          <span
                            className={[
                              "flex-1 truncate text-[12px] leading-snug",
                              customColor ? "text-ink" : cat.ink,
                            ].join(" ")}
                          >
                            {displayText}
                          </span>
                        </motion.div>
                      );
                    })}
                  </AnimatePresence>

                  {/* Ghost preview where the dragged card will land */}
                  {isDragTarget && dragItem && (
                    <div className="pointer-events-none rounded-[4px] border border-dashed border-primary/50 bg-primary/5 px-2 py-1.5 text-[12px] text-primary/80">
                      <span className="truncate">{splitColor(dragItem.text).text}</span>
                    </div>
                  )}

                  {/* Empty-state quick-add affordance */}
                  {items.length === 0 && !isDragTarget && (
                    <button
                      type="button"
                      data-role="item"
                      onClick={(e) => {
                        e.stopPropagation();
                        openCreator(col, e.currentTarget.closest("[data-week-col]") as HTMLElement);
                      }}
                      className="mt-1 flex items-center justify-center gap-1 rounded-[4px] border border-dashed border-hairline px-2 py-1.5 text-[11px] text-muted-foreground/70 opacity-0 transition-opacity hover:bg-card hover:text-ink group-hover/col:opacity-100"
                    >
                      <Plus className="h-3 w-3" strokeWidth={2.25} />
                      Ny økt
                    </button>
                  )}

                  {/* Excel focus ring on column */}
                  {focused && focus.item === -1 && (
                    <span className="pointer-events-none absolute inset-0 z-[1] outline outline-2 outline-primary/60 outline-offset-[-2px]" />
                  )}
                </div>
              );
            })}
          </div>
        </LayoutGroup>

        {creator && (
          <CreatorPopover
            anchor={creator.rect}
            initialText={creator.initialText ?? ""}
            initialColor={creator.initialColor ?? null}
            isEdit={creator.editIdx !== undefined}
            onClose={closeCreator}
            onCommit={(text, color) => {
              if (creator.editIdx !== undefined) {
                updateSession(creator.col, creator.editIdx, text, color);
              } else {
                appendSession(creator.col, text, color);
              }
              closeCreator();
            }}
          />
        )}
      </div>
    </div>
  );
}

interface CreatorPopoverProps {
  anchor: DOMRect;
  initialText: string;
  initialColor: string | null;
  isEdit: boolean;
  onClose: () => void;
  onCommit: (text: string, color: string | null) => void;
}

function CreatorPopover({
  anchor,
  initialText,
  initialColor,
  isEdit,
  onClose,
  onCommit,
}: CreatorPopoverProps) {
  const [value, setValue] = useState(initialText);
  const [color, setColor] = useState<string | null>(initialColor);
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (!ref.current) return;
      if (!ref.current.contains(e.target as Node)) {
        const t = value.trim();
        if (t) onCommit(t, color);
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
        if (t) onCommit(t, color);
      }
    };
    window.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [value, color, onCommit, onClose]);

  const POPOVER_W = 280;
  const POPOVER_H = 180;
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
      <div className="border-b border-hairline px-3 py-2 text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
        {isEdit ? "Rediger økt" : "Ny økt"}
      </div>
      <input
        autoFocus
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="f.eks. Intervaller 5×4min"
        className="block w-full bg-transparent px-3 py-2.5 text-[13px] text-ink outline-none placeholder:text-muted-foreground/60"
      />
      {/* Color row — 8 platform colors, mac-OS-style dots, 4×2 */}
      <ColorDotRow value={color} onChange={setColor} />
      <div className="flex items-center justify-between border-t border-hairline px-3 py-2 text-[11px] text-muted-foreground">
        <span className="mono tabular-nums">
          {isEdit ? "⏎ for å lagre · tøm for å slette" : "⏎ for å lagre"}
        </span>
        <button
          type="button"
          onClick={() => {
            const t = value.trim();
            if (t) onCommit(t, color);
            else if (isEdit) onCommit("", color);
          }}
          className="rounded-md bg-primary px-2.5 py-1 text-[11.5px] font-medium text-primary-foreground hover:opacity-90"
        >
          {isEdit ? "Lagre" : "Legg til"}
        </button>
      </div>
    </div>
  );
}

/**
 * Compact color picker row used in the session creator/editor.
 * Renders the 8 platform colors as macOS-style dots (4 × 2).
 */
function ColorDotRow({
  value,
  onChange,
}: {
  value: string | null;
  onChange: (c: string | null) => void;
}) {
  return (
    <div className="flex items-center justify-center gap-2.5 border-t border-hairline px-3 py-2.5">
      {GROUP_COLOR_PALETTE.map((c) => {
        const selected = value?.toLowerCase() === c.value.toLowerCase();
        return (
          <button
            key={c.value}
            type="button"
            title={c.name}
            onClick={() => onChange(selected ? null : c.value)}
            aria-label={c.name}
            aria-pressed={selected}
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
  );
}

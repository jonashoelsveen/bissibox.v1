/**
 * UnifiedElasticGrid — a single continuous spreadsheet that morphs between
 * Year View and Month View by animating CSS Grid track sizes.
 *
 * Architecture:
 *   - One source of truth: 12 month columns × 31 days × 2 sessions (rows).
 *   - Zoom is achieved by animating `grid-template-columns` and per-row
 *     heights. No unmounting, no shared-element trickery — the same DOM
 *     nodes resize in place. This guarantees zero "popping" of the
 *     selection ring or cell content.
 *   - Session text is always rendered. In Year View it is clipped/faded by
 *     the narrow column width and a CSS opacity bound to the column's
 *     active state. In Month View the focused column expands and the text
 *     fades in cleanly.
 *   - Sticky month headers stay pinned while the user scrolls vertically
 *     through a month's sessions.
 *   - Keyboard: arrow keys move the selection cell-by-cell. Crossing a
 *     month boundary in Month View pans the focused month.
 *
 * Spec compliance:
 *   - FLIP-style smooth transitions via CSS `transition` on grid tracks.
 *   - `will-change: transform, width, height` on cells.
 *   - Easing: cubic-bezier(0.2, 0, 0, 1).
 *   - Crisp 1px borders, desaturation of peripheral columns in Month View.
 */

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, Plus } from "lucide-react";
import type { CellData, CellKey, Session } from "./yearStore";
import { makeCellId } from "./yearStore";
import { MonthGridType1, PopoverEditor, splitColor, joinColor } from "./MonthGridType1";
import { MonthNavControl } from "./MonthNavControl";
import type { DateRange } from "./MiniCalendar";

type ViewMode = "day" | "week" | "month";

const VIEW_MODE_LABEL: Record<ViewMode, string> = {
  day: "Dag",
  week: "Uke",
  month: "Måned",
};

/**
 * HeaderDropdown — minimal dropdown styled to match the TopBar profile
 * switcher, but slightly more compact and friendlier (chevron rotates,
 * subtle hover affordance, items show a check on the active row).
 */
function HeaderDropdown<T extends string>({
  value,
  options,
  onChange,
  width = 132,
  ariaLabel,
}: {
  value: T;
  options: { value: T; label: string; hint?: string; disabled?: boolean }[];
  onChange: (v: T) => void;
  width?: number;
  ariaLabel: string;
}) {
  const [open, setOpen] = useState(false);
  const current = options.find((o) => o.value === value);
  return (
    <div className="pointer-events-auto relative">
      <button
        type="button"
        aria-label={ariaLabel}
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        className="group flex h-8 items-center justify-between gap-1.5 rounded-md border border-hairline bg-background/90 px-2.5 text-xs font-medium text-ink shadow-sm backdrop-blur transition-colors hover:bg-secondary"
        style={{ width }}
      >
        <span className="truncate">{current?.label ?? value}</span>
        <ChevronDown
          className={`h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`}
          strokeWidth={2.25}
        />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
          <div
            className="absolute right-0 top-full z-40 mt-1 overflow-hidden rounded-md border border-ink/15 bg-card shadow-lg"
            style={{ width }}
          >
            {options.map((o) => {
              const active = o.value === value;
              return (
                <button
                  key={o.value}
                  type="button"
                  disabled={o.disabled}
                  onClick={() => {
                    if (o.disabled) return;
                    onChange(o.value);
                    setOpen(false);
                  }}
                  className={`flex w-full items-center justify-between gap-2 border-b border-hairline/60 px-2.5 py-2 text-left text-xs transition last:border-b-0 ${
                    o.disabled
                      ? "cursor-not-allowed text-muted-foreground/60"
                      : active
                        ? "bg-secondary/60 text-ink"
                        : "text-ink hover:bg-secondary"
                  }`}
                >
                  <span className="truncate">{o.label}</span>
                  {o.hint && (
                    <span className="mono ml-2 shrink-0 text-[9px] uppercase tracking-[0.2em] text-muted-foreground">
                      {o.hint}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

// Type 2 spreadsheet column headers — weekday names cycling across the
// 12 underlying month columns. The user requested the headers be relabelled
// from month names to weekday names (Monday → Sunday). The data model still
// has 12 column slots, so weekdays repeat after Sunday.
const MONTH_LABELS_FULL = [
  "Mandag",
  "Tirsdag",
  "Onsdag",
  "Torsdag",
  "Fredag",
  "Lørdag",
  "Søndag",
  "Mandag",
  "Tirsdag",
  "Onsdag",
  "Torsdag",
  "Fredag",
];
const MONTH_LABELS_SHORT = [
  "Man",
  "Tir",
  "Ons",
  "Tor",
  "Fre",
  "Lør",
  "Søn",
  "Man",
  "Tir",
  "Ons",
  "Tor",
  "Fre",
];
const WEEKDAYS_NB = ["Søn", "Man", "Tir", "Ons", "Tor", "Fre", "Lør"];

function daysInMonth(y: number, m: number) {
  return new Date(y, m + 1, 0).getDate();
}
function isWeekend(year: number, month: number, day: number) {
  const d = new Date(year, month, day).getDay();
  return d === 0 || d === 6;
}

const EASE = "cubic-bezier(0.2, 0, 0, 1)";
const DUR_MS = 180;

export interface UnifiedElasticGridProps {
  calId: string;
  year: number;
  data: Record<string, CellData>;
  selected: CellKey | null;
  onSelect: (k: CellKey | null) => void;
  onCommitText: (k: CellKey, text: string) => void;
  onCommitTexts?: (updates: Array<{ key: CellKey; text: string }>) => void;
  onCommitDuration?: (k: CellKey, duration: string) => void;
  onFill: (source: CellKey, targets: CellKey[]) => void;
  seat?: "admin" | "individual";
  /** Shared "what is the calendar showing?" anchor date. */
  currentDate: Date;
  /** Optional drag-selected range from the mini-calendar. */
  currentRange: DateRange;
  /** Notify parent so the mini-cal & main view stay in sync. */
  onCurrentDateChange: (date: Date, range?: DateRange) => void;
}

type Mode = { kind: "year" } | { kind: "month"; month: number };

export function UnifiedElasticGrid({
  calId,
  year,
  data,
  selected,
  onSelect,
  onCommitText,
  onCommitTexts,
  onCommitDuration,
  onFill,
  seat = "individual",
  currentDate,
  currentRange,
  onCurrentDateChange,
}: UnifiedElasticGridProps) {
  // viewMode is the only user-facing toggle now. There are no "types".
  //   - "day"   → 7-column rich spreadsheet (one row per 30-min slot)
  //   - "week"  → 7-column compact spreadsheet (hourly time labels)
  //   - "month" → MonthGridType1 (full month grid)
  const [viewMode, setViewMode] = useState<ViewMode>("month");
  const [editingKey, setEditingKey] = useState<CellKey | null>(null);
  const [editValue, setEditValue] = useState("");
  const containerRef = useRef<HTMLDivElement | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  // Internal grid mode for the elastic spreadsheet (shared by Day & Week
  // views). Day view uses the "rich" per-row layout (kind: "month"); Week
  // view uses the "compact" hourly-label layout (kind: "year").
  const mode: Mode = viewMode === "day" ? { kind: "month", month: 0 } : { kind: "year" };

  const handleViewModeChange = (v: ViewMode) => {
    setViewMode(v);
  };

  // Both spreadsheet sub-views are always implemented; "month" routes to
  // MonthGridType1. There are no other combinations to gate on.

  const YEAR_COL = 220;
  const FOCUS_COL = 640;
  const ROW_YEAR = 28;
  const ROW_MONTH = 36;

  const gridTemplateColumns = useMemo(() => {
    if (mode.kind === "year") {
      // Week view: 7 weekday columns (Mon–Sun).
      return `repeat(7, minmax(${YEAR_COL}px, 1fr))`;
    }
    // Day view: render the focused day at full FOCUS_COL width across the
    // 7-column envelope so the active column is centered horizontally.
    return `repeat(7, ${FOCUS_COL}px)`;
  }, [mode]);

  const rowHeight = mode.kind === "year" ? ROW_YEAR : ROW_MONTH;

  const selectedId = selected ? makeCellId(calId, selected) : null;
  const editingId = editingKey ? makeCellId(calId, editingKey) : null;

  const beginEdit = useCallback(
    (k: CellKey) => {
      const id = makeCellId(calId, k);
      setEditValue(data[id]?.text ?? "");
      setEditingKey(k);
      onSelect(k);
    },
    [calId, data, onSelect],
  );

  const commitEdit = useCallback(() => {
    if (editingKey) onCommitText(editingKey, editValue.trim());
    setEditingKey(null);
  }, [editingKey, editValue, onCommitText]);

  // Selection passes straight through — no month-zoom side effect.
  const handleSelect = useCallback(
    (k: CellKey | null) => {
      onSelect(k);
    },
    [onSelect],
  );

  const moveSelection = useCallback(
    (dx: number, dy: number) => {
      if (!selected) return;
      let { year: y, month, day, session } = selected;
      if (dy !== 0) {
        let rank = day * 2 + session + dy;
        const dim = daysInMonth(y, month);
        const minRank = 1 * 2 + 0;
        const maxRank = dim * 2 + 1;
        if (rank > maxRank) rank = maxRank;
        else if (rank < minRank) rank = minRank;
        day = Math.floor(rank / 2);
        session = (rank % 2) as Session;
      }
      if (dx !== 0) {
        const m = Math.max(0, Math.min(11, month + dx));
        month = m;
        const nDim = daysInMonth(y, month);
        if (day > nDim) day = nDim;
      }
      onSelect({ year: y, month, day, session });
    },
    [selected, onSelect],
  );

  const dragStartRef = useRef<CellKey | null>(null);
  const [dragRange, setDragRange] = useState<{
    month: number;
    toDay: number;
    toSession: Session;
  } | null>(null);

  // Week-view "Excel-like" vertical mark range (a contiguous selection of
  // 30-min slots within a single day column). Distinct from the fill-handle
  // drag above.
  const markStartRef = useRef<{ month: number; rank: number } | null>(null);
  const markActiveRef = useRef(false);
  const [markRange, setMarkRange] = useState<{
    month: number;
    lo: number; // rank = day*2+session
    hi: number;
  } | null>(null);
  // Plus icon only shows after the user has released the mouse.
  const [markReleased, setMarkReleased] = useState(false);

  // Inline editor popover (shared with month view)
  const [popover, setPopover] = useState<{
    key: CellKey;
    rect: DOMRect;
    initialText: string;
    initialColor: string | null;
    isEdit: boolean;
  } | null>(null);

  const openPopover = useCallback(
    (k: CellKey, anchor: HTMLElement) => {
      const id = makeCellId(calId, k);
      const raw = data[id]?.text ?? "";
      const { color, text } = splitColor(raw);
      setPopover({
        key: k,
        rect: anchor.getBoundingClientRect(),
        initialText: text,
        initialColor: color,
        isEdit: !!raw.trim(),
      });
    },
    [calId, data],
  );

  const closePopover = useCallback(() => setPopover(null), []);

  // Clear the mark-range when mousing down anywhere that is not a marked
  // cell, not the plus button, and not the popover itself.
  useEffect(() => {
    if (!markRange) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as HTMLElement | null;
      if (!t) return;
      if (t.closest("[data-mark-cell='1']")) return;
      if (t.closest("[data-role='mark-plus']")) return;
      if (t.closest("[data-role='popover']")) return;
      setMarkRange(null);
      setMarkReleased(false);
    };
    window.addEventListener("mousedown", onDown);
    return () => window.removeEventListener("mousedown", onDown);
  }, [markRange]);

  useEffect(() => {
    if (!dragRange || !dragStartRef.current) return;
    const onUp = () => {
      const src = dragStartRef.current!;
      const r = dragRange;
      const targets: CellKey[] = [];
      const dim = daysInMonth(year, r.month);
      const srcRank = src.day * 2 + src.session;
      const endRank = r.toDay * 2 + r.toSession;
      const lo = Math.min(srcRank, endRank);
      const hi = Math.max(srcRank, endRank);
      for (let rk = lo; rk <= hi; rk++) {
        const day = Math.floor(rk / 2);
        const session = (rk % 2) as Session;
        if (day < 1 || day > dim) continue;
        if (day === src.day && session === src.session) continue;
        targets.push({ year, month: r.month, day, session });
      }
      if (targets.length > 0) onFill(src, targets);
      setDragRange(null);
      dragStartRef.current = null;
      window.removeEventListener("mouseup", onUp);
    };
    window.addEventListener("mouseup", onUp);
    return () => window.removeEventListener("mouseup", onUp);
  }, [dragRange, year, onFill]);

  // Global mouseup ends the mark drag (range stays visible).
  useEffect(() => {
    const onUp = () => {
      if (markActiveRef.current) {
        setMarkReleased(true);
      }
      markActiveRef.current = false;
      markStartRef.current = null;
    };
    window.addEventListener("mouseup", onUp);
    return () => window.removeEventListener("mouseup", onUp);
  }, []);

  const inDragRange = useCallback(
    (k: CellKey) => {
      if (!dragRange || !dragStartRef.current) return false;
      if (k.month !== dragRange.month) return false;
      const src = dragStartRef.current;
      const a = src.day * 2 + src.session;
      const b = dragRange.toDay * 2 + dragRange.toSession;
      const r = k.day * 2 + k.session;
      return r >= Math.min(a, b) && r <= Math.max(a, b);
    },
    [dragRange],
  );

  const markInfo = useCallback(
    (k: CellKey): { in: boolean; isFirst: boolean; isLast: boolean; isPlus: boolean; size: number } => {
      if (!markRange || k.month !== markRange.month)
        return { in: false, isFirst: false, isLast: false, isPlus: false, size: 0 };
      const r = k.day * 2 + k.session;
      const inR = r >= markRange.lo && r <= markRange.hi;
      const mid = Math.floor((markRange.lo + markRange.hi) / 2);
      return {
        in: inR,
        isFirst: r === markRange.lo,
        isLast: r === markRange.hi,
        isPlus: inR && r === mid,
        size: markRange.hi - markRange.lo + 1,
      };
    },
    [markRange],
  );

  const beginMark = useCallback((k: CellKey) => {
    const r = k.day * 2 + k.session;
    markStartRef.current = { month: k.month, rank: r };
    markActiveRef.current = true;
    setMarkReleased(false);
    setMarkRange(null);
  }, []);

  const extendMark = useCallback((k: CellKey) => {
    if (!markActiveRef.current || !markStartRef.current) return;
    if (k.month !== markStartRef.current.month) return;
    const r = k.day * 2 + k.session;
    const a = markStartRef.current.rank;
    if (r === a) return; // single cell — don't show mark yet
    setMarkRange({ month: k.month, lo: Math.min(a, r), hi: Math.max(a, r) });
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const isTyping =
        target &&
        (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable);
      if (isTyping) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (!selected) return;
      if (e.key === "ArrowDown") {
        e.preventDefault();
        moveSelection(0, 1);
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        moveSelection(0, -1);
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        moveSelection(1, 0);
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        moveSelection(-1, 0);
      } else if (e.key === "Enter") {
        e.preventDefault();
        moveSelection(0, 1);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selected, moveSelection]);

  // Remember the last focused month so that zooming back to Year View can
  // keep that month centered in the viewport — the user's spatial context
  // is preserved through the transition in both directions.
  const lastFocusedMonthRef = useRef<number | null>(null);

  useLayoutEffect(() => {
    const c = scrollRef.current;
    if (!c) return;

    // Determine which month to center: focused month in Month View, or the
    // last focused month when zooming out to Year View.
    let targetMonth: number | null = null;
    if (mode.kind === "month") {
      targetMonth = mode.month;
      lastFocusedMonthRef.current = mode.month;
    } else if (lastFocusedMonthRef.current !== null) {
      targetMonth = lastFocusedMonthRef.current;
    }
    if (targetMonth === null) return;

    const start = performance.now();
    let raf = 0;

    const tick = (now: number) => {
      const focused = c.querySelector<HTMLElement>(`[data-month-col="${targetMonth}"]`);
      if (focused) {
        const width = focused.offsetWidth;
        const left = focused.offsetLeft;
        const target = Math.max(0, left - (c.clientWidth - width) / 2);
        // Drive scroll synchronously with the grid track animation for an
        // Excel-like snap — no smooth-scroll, no lag.
        c.scrollLeft = target;
      }
      if (now - start < DUR_MS + 40) {
        raf = requestAnimationFrame(tick);
      }
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [mode]);

  const months = useMemo(
    () =>
      // Type 2 spreadsheet renders 7 weekday columns (Mon–Sun) instead of
      // the full 12-month axis. The underlying data model still keys on
      // month index 0–6, but only 7 of the 12 slots are rendered.
      Array.from({ length: 7 }, (_, idx) => ({
        idx,
        label: MONTH_LABELS_SHORT[idx],
        full: MONTH_LABELS_FULL[idx],
        dim: daysInMonth(year, idx),
      })),
    [year],
  );

  const isMonthFocused = (m: number) => mode.kind === "month" && mode.month === m;
  const isMonthPeriph = (m: number) => mode.kind === "month" && mode.month !== m;

  return (
    <div
      ref={containerRef}
      className="relative w-full overflow-hidden rounded-md border border-hairline bg-card"
      style={{ height: "calc(100vh - 280px)" }}
    >
      {/* Top-right control cluster: [Mode ▾] [‹ 📅 ›] */}
      <div className="pointer-events-auto absolute right-3 top-3 z-30 flex items-center gap-2">
        <HeaderDropdown<ViewMode>
          ariaLabel="Visningsmodus"
          value={viewMode}
          onChange={handleViewModeChange}
          width={124}
          options={[
            { value: "day", label: "Dag" },
            { value: "week", label: "Uke" },
            { value: "month", label: "Måned" },
          ]}
        />
        <MonthNavControl
          unit={viewMode}
          currentDate={currentDate}
          selectedRange={currentRange}
          onChange={onCurrentDateChange}
        />
      </div>

      {viewMode === "month" ? (
        <MonthGridType1
          calId={calId}
          year={currentDate.getFullYear()}
          month={currentDate.getMonth()}
          data={data}
          seat={seat}
          onPrevMonth={() => {
            const d = new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1);
            onCurrentDateChange(d, { start: d, end: d });
          }}
          onNextMonth={() => {
            const d = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1);
            onCurrentDateChange(d, { start: d, end: d });
          }}
          onCommitText={(k, text) => onCommitText(k, text)}
        />
      ) : (
        <div
          ref={scrollRef}
          className="relative h-full w-full overflow-auto"
          onClick={(e) => {
            if (e.target === e.currentTarget) handleSelect(null);
          }}
          tabIndex={0}
        >
          <div
            className="grid"
            style={{
              gridTemplateColumns,
              transition: `grid-template-columns ${DUR_MS}ms ${EASE}`,
              willChange: "grid-template-columns",
            }}
          >
            {months.map((m) => (
              <div
                key={`h-${m.idx}`}
                data-month-col={m.idx}
                className="sticky top-0 z-20 select-none border-b border-r border-hairline bg-card px-3 py-2 text-center text-[12px] font-semibold uppercase tracking-wide text-muted-foreground"
              >
                {m.label}
              </div>
            ))}

            {Array.from(
              // Week view (compact / kind:"year") renders hour-rows of a
              // single weekday: 06:00 → 24:30 in 30-min slots = 38 rows
              // = 19 "days" × 2 sessions. Day view keeps the original
              // 31-day envelope.
              { length: mode.kind === "year" ? 19 : 31 },
              (_, i) => i + 1,
            ).map((day) => (
              <DayRow
                key={day}
                day={day}
                months={months}
                year={year}
                calId={calId}
                data={data}
                mode={mode}
                rowHeight={rowHeight}
                selected={selected}
                selectedId={selectedId}
                editingId={editingId}
                editValue={editValue}
                setEditValue={setEditValue}
                onSelect={handleSelect}
                onBeginEdit={beginEdit}
                onCommitEdit={commitEdit}
                onCommitDuration={onCommitDuration}
                onMoveAfterCommit={moveSelection}
                inDragRange={inDragRange}
                onCellMouseEnter={(k) => {
                  if (dragStartRef.current && k.month === dragStartRef.current.month) {
                    setDragRange({
                      month: dragStartRef.current.month,
                      toDay: k.day,
                      toSession: k.session,
                    });
                  }
                  extendMark(k);
                }}
                onHandleDown={(k) => {
                  dragStartRef.current = k;
                  setDragRange({ month: k.month, toDay: k.day, toSession: k.session });
                }}
                isMonthFocused={isMonthFocused}
                isMonthPeriph={isMonthPeriph}
                markInfo={markInfo}
                onMarkBegin={beginMark}
                onOpenPopover={openPopover}
                allowMark={mode.kind === "year"}
                markReleased={markReleased}
              />
            ))}
          </div>
        </div>
      )}

      {popover && (
        <PopoverEditor
          seat={seat}
          initialText={popover.initialText}
          initialColor={popover.initialColor}
          isEdit={popover.isEdit}
          anchor={popover.rect}
          onClose={closePopover}
          onCommit={(text, color) => {
            const t = text.trim();
            const next = t ? joinColor(color, t) : "";
            // If a multi-cell range is marked, apply to all cells in it.
            if (markRange && t) {
              const updates: Array<{ key: CellKey; text: string }> = [];
              for (let r = markRange.lo; r <= markRange.hi; r++) {
                const day = Math.floor(r / 2);
                const session = (r % 2) as Session;
                updates.push({ key: { year, month: markRange.month, day, session }, text: next });
              }
              if (onCommitTexts) onCommitTexts(updates);
              else for (const update of updates) onCommitText(update.key, update.text);
            } else {
              onCommitText(popover.key, next);
            }
            setMarkRange(null);
            setMarkReleased(false);
            closePopover();
          }}
        />
      )}
    </div>
  );
}

interface DayRowProps {
  day: number;
  year: number;
  months: { idx: number; label: string; full: string; dim: number }[];
  calId: string;
  data: Record<string, CellData>;
  mode: Mode;
  rowHeight: number;
  selected: CellKey | null;
  selectedId: string | null;
  editingId: string | null;
  editValue: string;
  setEditValue: (v: string) => void;
  onSelect: (k: CellKey | null) => void;
  onBeginEdit: (k: CellKey) => void;
  onCommitEdit: () => void;
  onCommitDuration?: (k: CellKey, duration: string) => void;
  onMoveAfterCommit: (dx: number, dy: number) => void;
  inDragRange: (k: CellKey) => boolean;
  onCellMouseEnter: (k: CellKey) => void;
  onHandleDown: (k: CellKey) => void;
  isMonthFocused: (m: number) => boolean;
  isMonthPeriph: (m: number) => boolean;
  markInfo: (k: CellKey) => { in: boolean; isFirst: boolean; isLast: boolean; isPlus: boolean; size: number };
  onMarkBegin: (k: CellKey) => void;
  onOpenPopover: (k: CellKey, anchor: HTMLElement) => void;
  allowMark: boolean;
  markReleased: boolean;
}

function DayRow(props: DayRowProps) {
  const {
    day, year, months, calId, data, mode, rowHeight,
    selected, selectedId, editingId, editValue, setEditValue,
    onSelect, onBeginEdit, onCommitEdit, onCommitDuration, onMoveAfterCommit,
    inDragRange, onCellMouseEnter, onHandleDown, isMonthFocused, isMonthPeriph,
    markInfo, onMarkBegin, onOpenPopover, allowMark, markReleased,
  } = props;

  return (
    <>
      {months.map((m) => {
        const valid = day <= m.dim;
        const focused = isMonthFocused(m.idx);
        const periph = isMonthPeriph(m.idx);

        if (!valid) {
          return (
            <div
              key={`v-${m.idx}-${day}`}
              data-month-col={m.idx}
              className="border-b border-r border-hairline bg-muted/30"
              style={{
                height: rowHeight * 2,
                transition: `height ${DUR_MS}ms ${EASE}`,
                willChange: "height",
                opacity: periph ? 0.55 : 1,
              }}
            />
          );
        }

        const weekend = isWeekend(year, m.idx, day);
        // If the last session of this day shares a color with the first
        // session of the next day in the same column, hide the bottom
        // border so the session block reads as a single continuous fill.
        const lastSessionRaw = data[makeCellId(calId, { year, month: m.idx, day, session: 1 })]?.text ?? "";
        const nextDayFirstRaw = day < m.dim
          ? data[makeCellId(calId, { year, month: m.idx, day: day + 1, session: 0 })]?.text ?? ""
          : "";
        const lastSessionColor = splitColor(lastSessionRaw).color;
        const nextDayFirstColor = splitColor(nextDayFirstRaw).color;
        const mergeBelow = !!lastSessionColor && lastSessionColor === nextDayFirstColor;
        return (
          <div
            key={`c-${m.idx}-${day}`}
            data-month-col={m.idx}
            className={`relative border-r border-hairline ${mergeBelow ? "" : "border-b"} ${weekend ? "bg-muted/40" : ""}`}
            style={{
              height: rowHeight * 2,
              transition: `height ${DUR_MS}ms ${EASE}`,
              willChange: "height",
              opacity: periph ? 0.55 : 1,
            }}
          >
            <DayCellPair
              calId={calId}
              year={year}
              month={m.idx}
              day={day}
              weekend={weekend}
              data={data}
              focused={focused}
              periph={periph}
              mode={mode}
              rowHeight={rowHeight}
              selectedId={selectedId}
              selected={selected}
              editingId={editingId}
              editValue={editValue}
              setEditValue={setEditValue}
              onSelect={onSelect}
              onBeginEdit={onBeginEdit}
              onCommitEdit={onCommitEdit}
              onCommitDuration={onCommitDuration}
              onMoveAfterCommit={onMoveAfterCommit}
              inDragRange={inDragRange}
              onCellMouseEnter={onCellMouseEnter}
              onHandleDown={onHandleDown}
              markInfo={markInfo}
              onMarkBegin={onMarkBegin}
              onOpenPopover={onOpenPopover}
              allowMark={allowMark}
              markReleased={markReleased}
            />
          </div>
        );
      })}
    </>
  );
}

interface DayCellPairProps {
  calId: string;
  year: number;
  month: number;
  day: number;
  weekend: boolean;
  data: Record<string, CellData>;
  focused: boolean;
  periph: boolean;
  mode: Mode;
  rowHeight: number;
  selectedId: string | null;
  selected: CellKey | null;
  editingId: string | null;
  editValue: string;
  setEditValue: (v: string) => void;
  onSelect: (k: CellKey | null) => void;
  onBeginEdit: (k: CellKey) => void;
  onCommitEdit: () => void;
  onCommitDuration?: (k: CellKey, duration: string) => void;
  onMoveAfterCommit: (dx: number, dy: number) => void;
  inDragRange: (k: CellKey) => boolean;
  onCellMouseEnter: (k: CellKey) => void;
  onHandleDown: (k: CellKey) => void;
  markInfo: (k: CellKey) => { in: boolean; isFirst: boolean; isLast: boolean; isPlus: boolean; size: number };
  onMarkBegin: (k: CellKey) => void;
  onOpenPopover: (k: CellKey, anchor: HTMLElement) => void;
  allowMark: boolean;
  markReleased: boolean;
}

function DayCellPair(props: DayCellPairProps) {
  const {
    calId, year, month, day, weekend, data,
    focused, periph, mode, rowHeight, selectedId,
    editingId, editValue, setEditValue,
    onSelect, onBeginEdit, onCommitEdit, onCommitDuration, onMoveAfterCommit,
    inDragRange, onCellMouseEnter, onHandleDown,
    markInfo, onMarkBegin, onOpenPopover, allowMark, markReleased,
  } = props;

  const sessions: Session[] = [0, 1];
  const dow = new Date(year, month, day).getDay();
  const weekdayLabel = WEEKDAYS_NB[dow];

  const showRich = mode.kind === "month";
  const showCompact = mode.kind === "year";

  return (
    <div className="flex h-full w-full flex-col">
      {sessions.map((session) => {
        const k: CellKey = { year, month, day, session };
        const id = makeCellId(calId, k);
        const cell = data[id];
        const isSelected = selectedId === id;
        const isEditing = editingId === id;
        const isFirst = session === 0;
        const ranged = inDragRange(k);
        const mk = markInfo(k);

        // Parse `[#hex] text` storage format used by the popover editor.
        const parsed = splitColor(cell?.text ?? "");
        const cellColor = parsed.color ?? cell?.color ?? null;
        const cellLabel = parsed.text;

        // Vivid full-opacity fill when a session has a color.
        const bg = cellColor ?? undefined;

        // Merge with neighbouring sessions of the same color so a multi-cell
        // session reads as one continuous block (no inner divider lines).
        const prevRaw = isFirst
          ? (day > 1 ? data[makeCellId(calId, { year, month, day: day - 1, session: 1 })]?.text ?? "" : "")
          : data[makeCellId(calId, { year, month, day, session: 0 })]?.text ?? "";
        const prevColor = splitColor(prevRaw).color;
        const sameAbove = !!cellColor && cellColor === prevColor;

        // Hide the top divider when this cell continues a mark range OR
        // continues a same-color session block.
        const hideTopDivider = (mk.in && !mk.isFirst) || sameAbove;

        return (
          <div
            key={session}
            data-mark-cell={mk.in ? "1" : undefined}
            onMouseDown={(e) => {
              if ((e.target as HTMLElement).dataset.role === "fill-handle") return;
              if ((e.target as HTMLElement).dataset.role === "mark-plus") return;
              onSelect(k);
              if (allowMark) onMarkBegin(k);
            }}
            onMouseEnter={() => onCellMouseEnter(k)}
            onDoubleClick={(e) => {
              e.stopPropagation();
              if (allowMark) {
                onOpenPopover(k, e.currentTarget as HTMLElement);
              } else {
                onBeginEdit(k);
              }
            }}
            className={`relative flex-1 cursor-cell select-none text-[12px] leading-tight ${
              !isFirst && !hideTopDivider ? "border-t border-hairline/60" : ""
            } ${ranged && !isSelected ? "bg-primary/10" : ""}`}
            style={{
              background: mk.in ? undefined : bg,
              minHeight: rowHeight,
              transition: `min-height ${DUR_MS}ms ${EASE}`,
              willChange: "min-height",
            }}
          >
            {mk.in && (
              <span
                className="pointer-events-none absolute inset-x-0 z-[1] bg-muted-foreground/15"
                style={{
                  top: mk.isFirst ? 0 : -1,
                  bottom: mk.isLast ? 0 : -1,
                }}
              />
            )}

            {mk.isPlus && markReleased && mk.size > 1 && (
              <button
                type="button"
                data-role="mark-plus"
                onMouseDown={(e) => e.stopPropagation()}
                onClick={(e) => {
                  e.stopPropagation();
                  // Anchor the popover to the full marked range by using
                  // the cell that was clicked.
                  onOpenPopover(k, e.currentTarget.parentElement as HTMLElement);
                }}
                className="pointer-events-auto absolute left-1/2 top-1/2 z-[5] -translate-x-1/2 -translate-y-1/2 text-muted-foreground/70 hover:text-ink"
                style={{ padding: 0, lineHeight: 0 }}
                aria-label="Legg til økt"
              >
                <Plus className="h-4 w-4" strokeWidth={1.5} />
              </button>
            )}
            {isSelected && (
              <span className="pointer-events-none absolute inset-0 z-[2] rounded-[2px] outline outline-2 outline-primary outline-offset-[-2px]" />
            )}

            {showCompact &&
              (() => {
                // Week view cell badge — show a time stamp on every full
                // hour only (every second cell), starting at 06:00 in
                // row-1/session-0 and ending at 24:00 (one row before the
                // bottom row, which holds the unlabelled 24:30 slot).
                const cellIndex = (day - 1) * 2 + session;
                const totalMin = 6 * 60 + cellIndex * 30;
                if (totalMin > 24 * 60) return null;
                if (totalMin % 60 !== 0) return null;
                const hh = Math.floor(totalMin / 60);
                const label = `${String(hh).padStart(2, "0")}:00`;
                return (
                  <span className="pointer-events-none absolute left-1.5 top-0.5 text-[10px] font-medium tabular-nums text-muted-foreground">
                    {label}
                  </span>
                );
              })()}

            {showRich && (
              <div
                className="grid h-full w-full items-center"
                style={{
                  gridTemplateColumns: "72px minmax(0,1fr) 96px",
                  transition: `opacity ${DUR_MS}ms ${EASE}`,
                  opacity: 1,
                }}
              >
                {/* Time gutter — every row is 30 minutes, starting at 06:00.
                    Only every second row (full hours) is labelled. */}
                <div className="px-3 text-[12px] font-medium tabular-nums text-muted-foreground">
                  {(() => {
                    const cellIndex = (day - 1) * 2 + session;
                    const totalMin = 6 * 60 + cellIndex * 30;
                    if (totalMin > 23 * 60 + 30) return "";
                    if (totalMin % 60 !== 0) return "";
                    const hh = Math.floor(totalMin / 60);
                    return `${String(hh).padStart(2, "0")}:00`;
                  })()}
                </div>
                <div className="min-w-0 border-l border-hairline px-3 text-[13px] text-ink">
                  {isEditing ? (
                    <input
                      autoFocus
                      value={editValue}
                      onChange={(e) => setEditValue(e.target.value)}
                      onBlur={onCommitEdit}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          onCommitEdit();
                          onMoveAfterCommit(0, 1);
                        } else if (e.key === "Tab") {
                          e.preventDefault();
                          onCommitEdit();
                          onMoveAfterCommit(e.shiftKey ? -1 : 1, 0);
                        } else if (e.key === "Escape") {
                          onCommitEdit();
                        }
                      }}
                      className="w-full bg-transparent text-[13px] text-ink outline-none"
                    />
                  ) : (
                    <span
                      className={`block truncate ${
                        cell?.bold ? "font-semibold" : ""
                      } ${cell?.italic ? "italic" : ""} ${cell?.underline ? "underline" : ""}`}
                    >
                      {sameAbove ? "" : cellLabel}
                    </span>
                  )}
                </div>
                <div className="border-l border-hairline">
                  <DurationCell
                    initial={cell?.duration ?? ""}
                    onCommit={(v) => onCommitDuration?.(k, v)}
                  />
                </div>
              </div>
            )}

            {showCompact && !isEditing && (
              <span
                className={`pointer-events-none absolute inset-y-0 left-7 right-1.5 flex items-center truncate text-[12px] text-ink ${
                  cell?.bold ? "font-semibold" : ""
                } ${cell?.italic ? "italic" : ""} ${cell?.underline ? "underline" : ""}`}
                style={{
                  opacity: focused ? 0 : 1,
                  transition: `opacity ${DUR_MS}ms ${EASE}`,
                }}
              >
                {sameAbove ? "" : cellLabel}
              </span>
            )}

            {showCompact && isEditing && (
              <input
                autoFocus
                value={editValue}
                onChange={(e) => setEditValue(e.target.value)}
                onBlur={onCommitEdit}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    onCommitEdit();
                    onMoveAfterCommit(0, 1);
                  } else if (e.key === "Tab") {
                    e.preventDefault();
                    onCommitEdit();
                    onMoveAfterCommit(e.shiftKey ? -1 : 1, 0);
                  } else if (e.key === "Escape") {
                    onCommitEdit();
                  }
                }}
                className="absolute inset-y-0 left-7 right-1.5 bg-transparent text-[12px] text-ink caret-ink outline-none"
              />
            )}

            {isSelected && !isEditing && !periph && (
              <span
                data-role="fill-handle"
                onMouseDown={(e) => {
                  e.stopPropagation();
                  e.preventDefault();
                  onHandleDown(k);
                }}
                className="absolute -bottom-[3px] -right-[3px] z-[3] h-2 w-2 cursor-ns-resize rounded-[1px] border border-background bg-primary"
                title="Dra ned for å fylle"
              />
            )}

            {weekend && !cellColor && (
              <span className="pointer-events-none absolute inset-0 bg-muted/20" />
            )}
          </div>
        );
      })}
    </div>
  );
}

interface DurationCellProps {
  initial: string;
  onCommit: (v: string) => void;
}

function DurationCell({ initial, onCommit }: DurationCellProps) {
  const [v, setV] = useState(initial);
  const [editing, setEditing] = useState(false);

  // Re-sync when the underlying cell changes from outside.
  useEffect(() => {
    if (!editing) setV(initial);
  }, [initial, editing]);

  const commit = () => {
    setEditing(false);
    const t = v.trim();
    if (t !== initial) onCommit(t);
  };

  return (
    <div
      className="px-3 text-[12px] text-muted-foreground"
      onMouseDown={(e) => e.stopPropagation()}
      onDoubleClick={(e) => {
        e.stopPropagation();
        setEditing(true);
      }}
    >
      {editing ? (
        <input
          autoFocus
          value={v}
          onChange={(e) => setV(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === "Tab") {
              e.preventDefault();
              commit();
            } else if (e.key === "Escape") {
              setV(initial);
              setEditing(false);
            }
          }}
          placeholder="1t 30min"
          className="w-full bg-transparent text-[12px] text-ink caret-ink outline-none"
        />
      ) : (
        <span className="block truncate">
          {v || <span className="text-muted-foreground/50">—</span>}
        </span>
      )}
    </div>
  );
}

/**
 * WeekGridType3 — strict 1:1 clone of Year Type 2 spreadsheet aesthetic,
 * but with 7 day-columns (Mon–Sun) and 96 hour-rows (24h × 4 quarter-hour
 * cells). Every 4th row labels the hour in the left gutter.
 *
 * Per spec ("Direct Logic and UI Clone"):
 *   - Same component pattern as Year Type 2 (DayRow / DayCellPair-style):
 *     rigid columns, hairline borders, cubic-bezier easing, outline-2
 *     primary selection ring, `bg-primary/10` drag-range overlay,
 *     `cursor-cell`, secondary hover tint.
 *   - Excel-style drag-range selection within a single day column.
 *   - One session per cell (fixed-cell model). Inline input on
 *     double-click / Enter, identical to Month Type 2's edit affordance.
 *   - Storage: each row's text is persisted under the day's CellKey using
 *     `<HH:MM-HH:MM>` time prefix (one entry per row), reusing yearStore.
 */

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import type { CellData, CellKey } from "./yearStore";
import { makeCellId } from "./yearStore";
import {
  splitColor,
  splitTime,
  joinColor,
  joinTime,
} from "./SessionPopoverEditor";

const WEEKDAYS_SHORT = ["Man", "Tir", "Ons", "Tor", "Fre", "Lør", "Søn"];

const SLOTS = 96;
const SLOT_MIN = 15;
const ROW_H = 22;
const TIME_GUTTER = 56;
const EASE = "cubic-bezier(0.2, 0, 0, 1)";
const DUR_MS = 180;

interface RowEntry {
  text: string;
  color: string | null;
}

function parseRows(raw?: string): Map<number, RowEntry> {
  const out = new Map<number, RowEntry>();
  if (!raw) return out;
  for (const line of raw.split("\n")) {
    const t = line.trim();
    if (!t) continue;
    const { time, text: afterTime } = splitTime(t);
    if (!time) continue;
    const row = Math.floor(time.startMin / SLOT_MIN);
    const { color, text } = splitColor(afterTime);
    out.set(row, { text, color });
  }
  return out;
}

function serializeRows(map: Map<number, RowEntry>): string {
  const lines: string[] = [];
  const rows = [...map.keys()].sort((a, b) => a - b);
  for (const r of rows) {
    const e = map.get(r)!;
    if (!e.text) continue;
    lines.push(
      joinTime(
        { startMin: r * SLOT_MIN, endMin: (r + 1) * SLOT_MIN },
        joinColor(e.color, e.text),
      ),
    );
  }
  return lines.join("\n");
}

function startOfWeekMonday(d: Date) {
  const x = new Date(d);
  const dow = x.getDay();
  const diff = dow === 0 ? -6 : 1 - dow;
  x.setDate(x.getDate() + diff);
  x.setHours(0, 0, 0, 0);
  return x;
}
function isoWeekNumber(d: Date) {
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dayNum = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  return Math.ceil(((+t - +yearStart) / 86400000 + 1) / 7);
}

export interface WeekGridType3Props {
  calId: string;
  refDate: Date;
  data: Record<string, CellData>;
  onPrevWeek: () => void;
  onNextWeek: () => void;
  onCommitText: (k: CellKey, text: string) => void;
}

export function WeekGridType3({
  calId,
  refDate,
  data,
  onPrevWeek,
  onNextWeek,
  onCommitText,
}: WeekGridType3Props) {
  const weekStart = useMemo(() => startOfWeekMonday(refDate), [refDate]);
  const days = useMemo(
    () =>
      Array.from({ length: 7 }, (_, i) => {
        const d = new Date(weekStart);
        d.setDate(weekStart.getDate() + i);
        return d;
      }),
    [weekStart],
  );

  const dayKeys: CellKey[] = useMemo(
    () =>
      days.map((d) => ({
        year: d.getFullYear(),
        month: d.getMonth(),
        day: d.getDate(),
        session: 0,
      })),
    [days],
  );

  const dayRows = useMemo(
    () =>
      dayKeys.map((k) => parseRows(data[makeCellId(calId, k)]?.text)),
    [calId, data, dayKeys],
  );

  const [focus, setFocus] = useState<{ col: number; row: number }>({
    col: 0,
    row: 8 * 4,
  });
  const [range, setRange] = useState<{ col: number; a: number; b: number } | null>(
    null,
  );
  const dragAnchorRef = useRef<{ col: number; row: number } | null>(null);

  useEffect(() => {
    const onUp = () => {
      dragAnchorRef.current = null;
    };
    window.addEventListener("mouseup", onUp);
    return () => window.removeEventListener("mouseup", onUp);
  }, []);

  const inRange = useCallback(
    (col: number, row: number) => {
      if (!range || range.col !== col) return false;
      const lo = Math.min(range.a, range.b);
      const hi = Math.max(range.a, range.b);
      return row >= lo && row <= hi;
    },
    [range],
  );

  // Inline edit (per-cell input, mirrors Month/Year Type 2)
  const [editing, setEditing] = useState<{ col: number; row: number } | null>(
    null,
  );
  const [editValue, setEditValue] = useState("");

  const beginEdit = useCallback(
    (col: number, row: number) => {
      const e = dayRows[col].get(row);
      setEditValue(e?.text ?? "");
      setEditing({ col, row });
      setFocus({ col, row });
    },
    [dayRows],
  );

  const commitEdit = useCallback(() => {
    if (!editing) return;
    const next = new Map(dayRows[editing.col]);
    const trimmed = editValue.trim();
    const prev = next.get(editing.row);
    if (!trimmed) next.delete(editing.row);
    else next.set(editing.row, { text: trimmed, color: prev?.color ?? null });
    onCommitText(dayKeys[editing.col], serializeRows(next));
    setEditing(null);
  }, [editing, editValue, dayRows, dayKeys, onCommitText]);

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
      if (e.metaKey || e.ctrlKey || e.altKey) return;

      if (e.key === "ArrowDown") {
        e.preventDefault();
        setRange(null);
        setFocus((f) => ({ col: f.col, row: Math.min(SLOTS - 1, f.row + 1) }));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setRange(null);
        setFocus((f) => ({ col: f.col, row: Math.max(0, f.row - 1) }));
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        setRange(null);
        setFocus((f) => {
          if (f.col >= 6) {
            onNextWeek();
            return { col: 0, row: f.row };
          }
          return { col: f.col + 1, row: f.row };
        });
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        setRange(null);
        setFocus((f) => {
          if (f.col <= 0) {
            onPrevWeek();
            return { col: 6, row: f.row };
          }
          return { col: f.col - 1, row: f.row };
        });
      } else if (e.key === "Enter") {
        e.preventDefault();
        beginEdit(focus.col, focus.row);
      } else if (e.key === "Escape") {
        setRange(null);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [focus, beginEdit, onPrevWeek, onNextWeek]);

  const today = new Date();
  const isToday = (d: Date) =>
    d.getFullYear() === today.getFullYear() &&
    d.getMonth() === today.getMonth() &&
    d.getDate() === today.getDate();

  const weekNum = isoWeekNumber(weekStart);
  const headerLabel = `Uke ${weekNum} · ${weekStart.getFullYear()}`;
  const columnHeight = SLOTS * ROW_H;

  return (
    <div className="relative flex h-full w-full flex-col bg-card" tabIndex={0}>
      {/* Header */}
      <div className="flex items-center justify-between border-b border-hairline px-4 py-3">
        <h2 className="text-[15px] font-semibold tracking-tight text-ink">
          {headerLabel}
        </h2>
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

      {/* Day column headers */}
      <div
        className="grid border-b border-hairline bg-card"
        style={{ gridTemplateColumns: `${TIME_GUTTER}px repeat(7, minmax(0,1fr))` }}
      >
        <div className="border-r border-hairline" />
        {days.map((d, i) => {
          const todayCol = isToday(d);
          return (
            <div
              key={i}
              className={[
                "border-r border-hairline px-3 py-2 text-[11px] font-medium uppercase tracking-[0.08em]",
                todayCol ? "text-primary" : "text-muted-foreground",
              ].join(" ")}
            >
              <span className="mr-1">{WEEKDAYS_SHORT[i]}</span>
              <span className="mono tabular-nums text-ink/80">{d.getDate()}</span>
            </div>
          );
        })}
      </div>

      {/* Scrollable grid */}
      <div className="relative flex-1 overflow-auto">
        <div
          className="grid"
          style={{
            gridTemplateColumns: `${TIME_GUTTER}px repeat(7, minmax(0,1fr))`,
            transition: `grid-template-columns ${DUR_MS}ms ${EASE}`,
          }}
        >
          {/* Hour labels in gutter, every 4 rows */}
          <div
            className="relative border-r border-hairline"
            style={{ height: columnHeight }}
          >
            {Array.from({ length: 24 }, (_, h) => (
              <div
                key={h}
                className="absolute left-0 right-0 px-2 text-right text-[10.5px] font-medium tabular-nums text-muted-foreground/70"
                style={{ top: h * 4 * ROW_H, height: 4 * ROW_H, lineHeight: `${ROW_H}px` }}
              >
                {String(h).padStart(2, "0")}:00
              </div>
            ))}
          </div>

          {/* 7 day columns — fixed cells */}
          {days.map((_, col) => {
            const colRange = range && range.col === col ? range : null;
            const lo = colRange ? Math.min(colRange.a, colRange.b) : -1;
            const hi = colRange ? Math.max(colRange.a, colRange.b) : -1;
            const map = dayRows[col];
            return (
              <div
                key={col}
                className="relative border-r border-hairline bg-card"
                style={{ height: columnHeight }}
              >
                {Array.from({ length: SLOTS }, (_, r) => {
                  const isHourTop = r % 4 === 0;
                  const focused = focus.col === col && focus.row === r;
                  const ranged = inRange(col, r);
                  const isEditing =
                    editing && editing.col === col && editing.row === r;
                  const entry = map.get(r);
                  const bg = entry?.color ? entry.color + "33" : undefined;
                  return (
                    <div
                      key={r}
                      data-slot={r}
                      onMouseDown={(e) => {
                        if ((e.target as HTMLElement).tagName === "INPUT") return;
                        setFocus({ col, row: r });
                        dragAnchorRef.current = { col, row: r };
                        setRange({ col, a: r, b: r });
                      }}
                      onMouseEnter={() => {
                        const a = dragAnchorRef.current;
                        if (a && a.col === col) {
                          setRange({ col, a: a.row, b: r });
                        }
                      }}
                      onMouseUp={() => {
                        const a = dragAnchorRef.current;
                        if (a && a.col === col && a.row === r) {
                          setRange(null);
                        }
                      }}
                      onDoubleClick={(e) => {
                        e.stopPropagation();
                        beginEdit(col, r);
                      }}
                      className={[
                        "relative cursor-cell select-none border-b text-[12px] leading-tight transition-colors",
                        isHourTop ? "border-hairline" : "border-hairline/40",
                        ranged && !focused ? "bg-primary/10" : "",
                        !entry && !ranged ? "hover:bg-secondary/40" : "",
                      ].join(" ")}
                      style={{ height: ROW_H, background: bg }}
                    >
                      {focused && (
                        <span className="pointer-events-none absolute inset-0 z-[2] rounded-[2px] outline outline-2 outline-primary outline-offset-[-2px]" />
                      )}
                      {isEditing ? (
                        <input
                          autoFocus
                          value={editValue}
                          onChange={(e) => setEditValue(e.target.value)}
                          onBlur={commitEdit}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              e.preventDefault();
                              commitEdit();
                            } else if (e.key === "Escape") {
                              setEditing(null);
                            }
                          }}
                          className="absolute inset-0 w-full bg-transparent px-2 text-[12px] text-ink outline-none"
                        />
                      ) : entry?.text ? (
                        <span className="pointer-events-none absolute inset-y-0 left-2 right-2 flex items-center truncate text-[12px] text-ink">
                          {entry.text}
                        </span>
                      ) : null}
                    </div>
                  );
                })}

                {/* "+" affordance over the active range */}
                {colRange && lo >= 0 && (
                  <div
                    className="pointer-events-none absolute left-0 right-0 z-[3] flex items-center justify-center"
                    style={{ top: lo * ROW_H, height: (hi - lo + 1) * ROW_H }}
                  >
                    <button
                      type="button"
                      onMouseDown={(e) => e.stopPropagation()}
                      onClick={(e) => {
                        e.stopPropagation();
                        beginEdit(col, lo);
                        setRange(null);
                      }}
                      className="pointer-events-auto grid h-7 w-7 place-items-center rounded-full border border-primary/30 bg-card text-primary shadow-md transition-all hover:scale-110 hover:bg-primary hover:text-primary-foreground"
                      aria-label="Legg til økt"
                      title="Legg til økt"
                    >
                      <Plus className="h-3.5 w-3.5" strokeWidth={2.5} />
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

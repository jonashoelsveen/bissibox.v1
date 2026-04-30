/**
 * DayGridType3 — strict 1:1 clone of Month Type 2 cell aesthetic.
 *
 * Per spec ("Direct Logic and UI Clone"):
 *   - Same component structure as Month Type 2 (DayRow / DayCellPair-style):
 *     hairline borders, `cursor-cell`, outline-2 primary selection ring,
 *     `bg-primary/10` drag-range overlay, secondary hover tint.
 *   - Single column = the focused day. Column header shows the date.
 *   - 96 rows = 24h × 4 quarter-hour cells. Every 4th row (the top of each
 *     hour) renders the hour number in muted grey on the left side of the
 *     cell, exactly like Month Type 2's day-number badge.
 *   - One session per cell (fixed-cell model). Inline input on
 *     double-click / Enter, identical to Month Type 2's edit affordance.
 *   - Excel-style drag-range selection (vertical), with a hover "+"
 *     affordance over the active range that opens an inline editor on the
 *     first row of the range.
 *   - Storage: each row's text is persisted under a synthetic CellKey
 *     using `<HH:MM-HH:MM>` time prefix (one entry per row in the day's
 *     session=0 newline-serialized text), reusing the existing yearStore
 *     without a schema migration.
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

/** Parse the day's stored text into a row→entry map. */
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

export interface DayGridType3Props {
  calId: string;
  refDate: Date;
  data: Record<string, CellData>;
  onPrevDay: () => void;
  onNextDay: () => void;
  onCommitText: (k: CellKey, text: string) => void;
}

export function DayGridType3({
  calId,
  refDate,
  data,
  onPrevDay,
  onNextDay,
  onCommitText,
}: DayGridType3Props) {
  const dayKey: CellKey = useMemo(
    () => ({
      year: refDate.getFullYear(),
      month: refDate.getMonth(),
      day: refDate.getDate(),
      session: 0,
    }),
    [refDate],
  );
  const id = makeCellId(calId, dayKey);
  const rows = useMemo(() => parseRows(data[id]?.text), [data, id]);

  // Focus + drag-range, identical semantics to Month Type 2's selection.
  const [focusRow, setFocusRow] = useState(8 * 4); // default 08:00
  const [range, setRange] = useState<{ a: number; b: number } | null>(null);
  const dragAnchorRef = useRef<number | null>(null);

  const inRange = useCallback(
    (r: number) => {
      if (!range) return false;
      const lo = Math.min(range.a, range.b);
      const hi = Math.max(range.a, range.b);
      return r >= lo && r <= hi;
    },
    [range],
  );

  useEffect(() => {
    const onUp = () => {
      dragAnchorRef.current = null;
    };
    window.addEventListener("mouseup", onUp);
    return () => window.removeEventListener("mouseup", onUp);
  }, []);

  // Inline edit (mirrors Month Type 2's per-cell input)
  const [editingRow, setEditingRow] = useState<number | null>(null);
  const [editValue, setEditValue] = useState("");

  const beginEdit = useCallback(
    (r: number) => {
      const e = rows.get(r);
      setEditValue(e?.text ?? "");
      setEditingRow(r);
      setFocusRow(r);
    },
    [rows],
  );

  const commitEdit = useCallback(() => {
    if (editingRow == null) return;
    const next = new Map(rows);
    const trimmed = editValue.trim();
    const prev = next.get(editingRow);
    if (!trimmed) {
      next.delete(editingRow);
    } else {
      next.set(editingRow, { text: trimmed, color: prev?.color ?? null });
    }
    onCommitText(dayKey, serializeRows(next));
    setEditingRow(null);
  }, [editingRow, editValue, rows, dayKey, onCommitText]);

  // Keyboard: arrows move focus row, Enter edits, Esc cancels — mirrors Month Type 2.
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
        setFocusRow((r) => Math.min(SLOTS - 1, r + 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setRange(null);
        setFocusRow((r) => Math.max(0, r - 1));
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        onNextDay();
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        onPrevDay();
      } else if (e.key === "Enter") {
        e.preventDefault();
        beginEdit(focusRow);
      } else if (e.key === "Escape") {
        setRange(null);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [focusRow, beginEdit, onPrevDay, onNextDay]);

  const headerLabel = `${WEEKDAYS_FULL[refDate.getDay()]} ${refDate.getDate()}. ${MONTHS_FULL[refDate.getMonth()]} ${refDate.getFullYear()}`;
  const today = new Date();
  const isToday =
    today.getFullYear() === refDate.getFullYear() &&
    today.getMonth() === refDate.getMonth() &&
    today.getDate() === refDate.getDate();

  const lo = range ? Math.min(range.a, range.b) : -1;
  const hi = range ? Math.max(range.a, range.b) : -1;

  return (
    <div className="relative flex h-full w-full flex-col bg-card" tabIndex={0}>
      {/* Header — same styling as Month Type 2 / Week Type 1 */}
      <div className="flex items-center justify-between border-b border-hairline px-4 py-3">
        <h2 className="text-[15px] font-semibold tracking-tight text-ink">
          {headerLabel}
          {isToday && (
            <span className="mono ml-2 rounded-sm bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-[0.12em] text-primary">
              I dag
            </span>
          )}
        </h2>
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

      {/* Column header strip — single day */}
      <div
        className="grid border-b border-hairline bg-card"
        style={{ gridTemplateColumns: `${TIME_GUTTER}px minmax(0,1fr)` }}
      >
        <div className="border-r border-hairline" />
        <div className="px-3 py-2 text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
          Økter
        </div>
      </div>

      {/* Scroll area */}
      <div className="relative flex-1 overflow-auto">
        <div
          className="grid"
          style={{
            gridTemplateColumns: `${TIME_GUTTER}px minmax(0,1fr)`,
            transition: `grid-template-columns ${DUR_MS}ms ${EASE}`,
          }}
        >
          {/* Time gutter — hour labels every 4 rows. */}
          <div
            className="relative border-r border-hairline"
            style={{ height: SLOTS * ROW_H }}
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

          {/* Day column — fixed cells, Month-Type-2 markup pattern */}
          <div className="relative bg-card" style={{ height: SLOTS * ROW_H }}>
            {Array.from({ length: SLOTS }, (_, r) => {
              const isHourTop = r % 4 === 0;
              const focused = r === focusRow;
              const ranged = inRange(r);
              const isEditing = editingRow === r;
              const entry = rows.get(r);
              const bg = entry?.color ? entry.color + "33" : undefined;

              return (
                <div
                  key={r}
                  data-slot={r}
                  onMouseDown={(e) => {
                    if ((e.target as HTMLElement).tagName === "INPUT") return;
                    setFocusRow(r);
                    dragAnchorRef.current = r;
                    setRange({ a: r, b: r });
                  }}
                  onMouseEnter={() => {
                    if (dragAnchorRef.current !== null) {
                      setRange({ a: dragAnchorRef.current, b: r });
                    }
                  }}
                  onMouseUp={() => {
                    if (
                      dragAnchorRef.current !== null &&
                      dragAnchorRef.current === r
                    ) {
                      setRange(null);
                    }
                  }}
                  onDoubleClick={(e) => {
                    e.stopPropagation();
                    beginEdit(r);
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
                          setEditingRow(null);
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

            {/* "+" affordance hovering over the active range */}
            {range && lo >= 0 && (
              <div
                className="pointer-events-none absolute left-0 right-0 z-[3] flex items-center justify-center"
                style={{ top: lo * ROW_H, height: (hi - lo + 1) * ROW_H }}
              >
                <button
                  type="button"
                  onMouseDown={(e) => e.stopPropagation()}
                  onClick={(e) => {
                    e.stopPropagation();
                    beginEdit(lo);
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
        </div>
      </div>
    </div>
  );
}

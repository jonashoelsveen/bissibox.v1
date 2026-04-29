/**
 * YearGrid — the Excel-style year canvas.
 *
 * Layout: 12 month columns (Jan–Dec), each column has a header and 31 day
 * rows. Every day row contains TWO session sub-cells (upper / lower).
 * Weekend day rows are shaded grey. Cells beyond the actual length of the
 * month (e.g. Feb 30, 31) are rendered as "void" cells.
 *
 * Interactions:
 *   - Single click  → select cell
 *   - Double click  → enter Direct Entry mode (in-place input)
 *   - Drag the corner handle vertically → fill range to adjacent sessions
 *
 * Drag-to-fill is restricted to the vertical axis (current month column
 * only) per spec, to preserve the year-view structure.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CellData, CellKey, Session } from "./yearStore";
import { makeCellId } from "./yearStore";

const MONTH_LABELS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

function daysInMonth(year: number, month: number) {
  return new Date(year, month + 1, 0).getDate();
}
function isWeekend(year: number, month: number, day: number) {
  const d = new Date(year, month, day).getDay();
  return d === 0 || d === 6;
}

export interface YearGridProps {
  calId: string;
  year: number;
  data: Record<string, CellData>;
  selected: CellKey | null;
  onSelect: (k: CellKey | null) => void;
  onCommitText: (k: CellKey, text: string) => void;
  onFill: (source: CellKey, targets: CellKey[]) => void;
}

export function YearGrid({
  calId,
  year,
  data,
  selected,
  onSelect,
  onCommitText,
  onFill,
}: YearGridProps) {
  const [editingKey, setEditingKey] = useState<CellKey | null>(null);
  const [editValue, setEditValue] = useState("");
  const [dragRange, setDragRange] = useState<{
    month: number;
    from: number;
    toDay: number;
    toSession: Session;
  } | null>(null);
  const dragStartRef = useRef<CellKey | null>(null);

  const selectedId = selected ? makeCellId(calId, selected) : null;
  const editingId = editingKey ? makeCellId(calId, editingKey) : null;

  const isSameKey = (a: CellKey | null, b: CellKey | null) =>
    !!a &&
    !!b &&
    a.year === b.year &&
    a.month === b.month &&
    a.day === b.day &&
    a.session === b.session;

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

  // Move selection by (dDay, dMonth) with carry across month boundaries on the same row.
  const moveSelection = useCallback(
    (dx: number, dy: number) => {
      if (!selected) return;
      let { year: y, month, day, session } = selected;
      // Vertical: walk session-by-session, day by day, within the same month column.
      if (dy !== 0) {
        const dim = daysInMonth(y, month);
        let rank = day * 2 + session + dy;
        // clamp within month
        const minRank = 1 * 2 + 0;
        const maxRank = dim * 2 + 1;
        if (rank < minRank) rank = minRank;
        if (rank > maxRank) rank = maxRank;
        day = Math.floor(rank / 2);
        session = (rank % 2) as Session;
      }
      // Horizontal: move month, keep same day+session. If target month doesn't have that day, clamp.
      if (dx !== 0) {
        let m = month + dx;
        if (m < 0) m = 0;
        if (m > 11) m = 11;
        month = m;
        const dim = daysInMonth(y, month);
        if (day > dim) day = dim;
      }
      onSelect({ year: y, month, day, session });
    },
    [selected, onSelect],
  );

  // Global mouse-up to finalize drag-to-fill
  useEffect(() => {
    if (!dragRange || !dragStartRef.current) return;
    const onUp = () => {
      const src = dragStartRef.current!;
      const r = dragRange;
      // Build target list (exclusive of source)
      const targets: CellKey[] = [];
      const dim = daysInMonth(year, r.month);
      // Walk session-by-session within the column from the source cell
      // toward (toDay, toSession), inclusive.
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

  const onCellMouseEnter = (k: CellKey) => {
    if (!dragStartRef.current) return;
    const src = dragStartRef.current;
    if (k.month !== src.month) return; // vertical only
    setDragRange({
      month: src.month,
      from: src.day * 2 + src.session,
      toDay: k.day,
      toSession: k.session,
    });
  };

  const inDragRange = (k: CellKey): boolean => {
    if (!dragRange || !dragStartRef.current) return false;
    if (k.month !== dragRange.month) return false;
    const src = dragStartRef.current;
    const srcRank = src.day * 2 + src.session;
    const endRank = dragRange.toDay * 2 + dragRange.toSession;
    const rk = k.day * 2 + k.session;
    return rk >= Math.min(srcRank, endRank) && rk <= Math.max(srcRank, endRank);
  };

  const months = useMemo(
    () => MONTH_LABELS.map((label, idx) => ({ label, idx, dim: daysInMonth(year, idx) })),
    [year],
  );

  return (
    <div
      className="relative w-full overflow-auto rounded-md border border-hairline bg-card"
      style={{ maxHeight: "calc(100vh - 280px)" }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onSelect(null);
      }}
      onKeyDown={(e) => {
        if (!selected || editingKey) return;
        if (e.metaKey || e.ctrlKey || e.altKey) return;
        // Arrow navigation
        if (e.key === "ArrowDown") {
          e.preventDefault();
          moveSelection(0, 1);
          return;
        }
        if (e.key === "ArrowUp") {
          e.preventDefault();
          moveSelection(0, -1);
          return;
        }
        if (e.key === "ArrowRight") {
          e.preventDefault();
          moveSelection(1, 0);
          return;
        }
        if (e.key === "ArrowLeft") {
          e.preventDefault();
          moveSelection(-1, 0);
          return;
        }
        // Enter → move down one session
        if (e.key === "Enter") {
          e.preventDefault();
          moveSelection(0, 1);
          return;
        }
        if (e.key.length === 1) {
          e.preventDefault();
          const id = makeCellId(calId, selected);
          setEditValue((data[id]?.text ?? "") + e.key);
          setEditingKey(selected);
          onSelect(selected);
        } else if (e.key === "Backspace") {
          e.preventDefault();
          setEditValue("");
          setEditingKey(selected);
          onSelect(selected);
        }
      }}
      tabIndex={0}
    >
      <table
        className="border-separate text-xs"
        style={{ borderSpacing: 0, tableLayout: "fixed", minWidth: 12 * 280 }}
      >
        <thead className="sticky top-0 z-10 bg-card">
          <tr>
            {months.map((m) => (
              <th
                key={m.idx}
                className="border-b border-r border-hairline px-2 py-2 text-center text-[12px] font-medium uppercase tracking-wide text-muted-foreground"
                style={{ width: 280, minWidth: 280 }}
              >
                {m.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: 31 }, (_, i) => i + 1).map((day) => (
            <tr key={day}>
              {months.map((m) => {
                const valid = day <= m.dim;
                if (!valid) {
                  return (
                    <td
                      key={m.idx}
                      className="border-b border-r border-hairline bg-muted/40"
                      style={{ height: 56, width: 280, minWidth: 280 }}
                    />
                  );
                }
                const weekend = isWeekend(year, m.idx, day);
                return (
                  <td
                    key={m.idx}
                    className="border-b border-r border-hairline align-top"
                    style={{ padding: 0, height: 56, width: 280, minWidth: 280 }}
                  >
                    <DayCell
                      calId={calId}
                      year={year}
                      month={m.idx}
                      day={day}
                      weekend={weekend}
                      data={data}
                      selectedId={selectedId}
                      editingId={editingId}
                      editValue={editValue}
                      setEditValue={setEditValue}
                      onSelect={onSelect}
                      onBeginEdit={beginEdit}
                      onCommitEdit={commitEdit}
                      onMouseEnter={onCellMouseEnter}
                      isSameKey={isSameKey}
                      selected={selected}
                      inDragRange={inDragRange}
                      onHandleDown={(k) => {
                        dragStartRef.current = k;
                        setDragRange({
                          month: k.month,
                          from: k.day * 2 + k.session,
                          toDay: k.day,
                          toSession: k.session,
                        });
                      }}
                    />
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

interface DayCellProps {
  calId: string;
  year: number;
  month: number;
  day: number;
  weekend: boolean;
  data: Record<string, CellData>;
  selectedId: string | null;
  editingId: string | null;
  editValue: string;
  setEditValue: (v: string) => void;
  onSelect: (k: CellKey | null) => void;
  onBeginEdit: (k: CellKey) => void;
  onCommitEdit: () => void;
  onMouseEnter: (k: CellKey) => void;
  onHandleDown: (k: CellKey) => void;
  onMoveAfterCommit: (dx: number, dy: number) => void;
  isSameKey: (a: CellKey | null, b: CellKey | null) => boolean;
  selected: CellKey | null;
  inDragRange: (k: CellKey) => boolean;
}

function DayCell(props: DayCellProps) {
  const {
    calId,
    year,
    month,
    day,
    weekend,
    data,
    selectedId,
    editingId,
    editValue,
    setEditValue,
    onSelect,
    onBeginEdit,
    onCommitEdit,
    onMouseEnter,
    onHandleDown,
    selected,
    inDragRange,
  } = props;

  const sessions: Session[] = [0, 1];
  return (
    <div className="flex h-full w-full flex-col">
      {sessions.map((session) => {
        const k: CellKey = { year, month, day, session };
        const id = makeCellId(calId, k);
        const cell = data[id];
        const isSelected = selectedId === id;
        const isEditing = editingId === id;
        const isLast = session === 1;
        const ranged = inDragRange(k);

        const bg = cell?.color
          ? cell.color + "33" // 20% alpha
          : weekend
            ? "transparent"
            : "transparent";

        return (
          <div
            key={session}
            onMouseDown={(e) => {
              if ((e.target as HTMLElement).dataset.role === "fill-handle") return;
              onSelect(k);
            }}
            onMouseEnter={() => onMouseEnter(k)}
            onDoubleClick={() => onBeginEdit(k)}
            className={`relative flex-1 cursor-cell select-none text-[12px] leading-tight text-black ${
              weekend ? "bg-muted/60" : ""
            } ${isSelected ? "outline outline-2 outline-primary/80 outline-offset-[-2px] z-[2]" : ""} ${
              ranged && !isSelected ? "bg-primary/10" : ""
            } ${!isLast ? "border-b border-hairline/70" : ""}`}
            style={{ background: bg !== "transparent" ? bg : undefined, minHeight: 28 }}
          >
            {/* Day number — only on the first session row */}
            {session === 0 && (
              <span className="pointer-events-none absolute left-1.5 top-0.5 text-[10px] font-semibold text-black/60">
                {day}
              </span>
            )}

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
                className="absolute inset-y-0 left-7 right-1 bg-transparent text-[12px] text-black caret-black outline-none"
              />
            ) : (
              <span
                className={`block truncate pl-7 pr-1.5 pt-1 text-black ${
                  cell?.bold ? "font-semibold" : ""
                } ${cell?.italic ? "italic" : ""} ${cell?.underline ? "underline" : ""}`}
                style={{ color: "#000" }}
              >
                {cell?.text ?? ""}
              </span>
            )}

            {/* Drag-to-fill corner handle */}
            {isSelected && !isEditing && (
              <span
                data-role="fill-handle"
                onMouseDown={(e) => {
                  e.stopPropagation();
                  e.preventDefault();
                  onHandleDown(k);
                }}
                className="absolute -bottom-[3px] -right-[3px] z-[3] h-2 w-2 cursor-ns-resize rounded-[1px] border border-background bg-primary"
                title="Drag down to fill"
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

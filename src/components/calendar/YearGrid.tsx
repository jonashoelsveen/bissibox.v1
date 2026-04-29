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
      style={{ maxHeight: "calc(100vh - 220px)" }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onSelect(null);
      }}
    >
      <table
        className="w-full border-separate text-xs"
        style={{ borderSpacing: 0, tableLayout: "fixed", minWidth: 1100 }}
      >
        <thead className="sticky top-0 z-10 bg-card">
          <tr>
            {months.map((m) => (
              <th
                key={m.idx}
                className="border-b border-r border-hairline px-2 py-1.5 text-center text-[11px] font-medium uppercase tracking-wide text-muted-foreground"
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
                      style={{ height: 44 }}
                    />
                  );
                }
                const weekend = isWeekend(year, m.idx, day);
                return (
                  <td
                    key={m.idx}
                    className="border-b border-r border-hairline align-top"
                    style={{ padding: 0, height: 44 }}
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
            className={`relative flex-1 cursor-cell select-none px-1 text-[11px] leading-tight ${
              weekend ? "bg-muted/60" : ""
            } ${isSelected ? "outline outline-2 outline-primary/80 outline-offset-[-2px] z-[2]" : ""} ${
              ranged && !isSelected ? "bg-primary/10" : ""
            } ${!isLast ? "border-b border-hairline/70" : ""}`}
            style={{ background: bg !== "transparent" ? bg : undefined, minHeight: 22 }}
          >
            {/* Day number — only on the first session row */}
            {session === 0 && (
              <span className="absolute left-1 top-0 text-[9px] font-medium text-muted-foreground/80">
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
                  } else if (e.key === "Escape") {
                    onCommitEdit();
                  }
                }}
                className="absolute inset-0 ml-3 mr-1 bg-transparent text-[11px] outline-none"
              />
            ) : (
              <span
                className={`block truncate pl-3 pr-1 pt-0.5 ${
                  cell?.bold ? "font-semibold" : ""
                } ${cell?.italic ? "italic" : ""} ${cell?.underline ? "underline" : ""}`}
                style={{ color: cell?.color ?? undefined }}
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

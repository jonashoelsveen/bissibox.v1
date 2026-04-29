/**
 * MonthView — single-month vertical day list.
 *
 * Layout: sticky month header on top, then one row per day. Each day row
 * spans two session sub-rows (upper / lower) matching the year-grid model.
 * Columns: date · weekday · session text · duration.
 *
 * Selection + edit reuse the same CellKey contract as YearGrid so a cell
 * stays "the same cell" as the user zooms in or out.
 */

import { useCallback, useEffect, useState } from "react";
import { motion } from "framer-motion";
import type { CellData, CellKey, Session } from "./yearStore";
import { makeCellId } from "./yearStore";

const WEEKDAYS_NB = ["Søn", "Man", "Tir", "Ons", "Tor", "Fre", "Lør"];
const MONTH_LABELS_FULL = [
  "Januar",
  "Februar",
  "Mars",
  "April",
  "Mai",
  "Juni",
  "Juli",
  "August",
  "September",
  "Oktober",
  "November",
  "Desember",
];
const MONTH_SHORT_NB = [
  "jan",
  "feb",
  "mar",
  "apr",
  "mai",
  "jun",
  "jul",
  "aug",
  "sep",
  "okt",
  "nov",
  "des",
];

function daysInMonth(y: number, m: number) {
  return new Date(y, m + 1, 0).getDate();
}

export interface MonthViewProps {
  calId: string;
  year: number;
  month: number;
  data: Record<string, CellData>;
  selected: CellKey | null;
  onSelect: (k: CellKey | null) => void;
  onCommitText: (k: CellKey, text: string) => void;
  faded?: boolean;
  showHeaderShared?: boolean; // when true, header uses a shared layoutId
}

export function MonthView({
  calId,
  year,
  month,
  data,
  selected,
  onSelect,
  onCommitText,
  faded = false,
  showHeaderShared = true,
}: MonthViewProps) {
  const [editingKey, setEditingKey] = useState<CellKey | null>(null);
  const [editValue, setEditValue] = useState("");

  const dim = daysInMonth(year, month);
  const days = Array.from({ length: dim }, (_, i) => i + 1);

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

  // Cancel edit when this pane becomes faded (carousel moved away).
  useEffect(() => {
    if (faded && editingKey) {
      commitEdit();
    }
  }, [faded, editingKey, commitEdit]);

  return (
    <div
      className={`flex h-full w-full flex-col overflow-hidden rounded-md border border-hairline bg-card ${
        faded ? "pointer-events-none" : ""
      }`}
      style={{
        filter: faded ? "grayscale(0.9)" : undefined,
        opacity: faded ? 0.45 : 1,
        transition: "filter 0.3s ease, opacity 0.3s ease",
      }}
    >
      {/* Sticky header */}
      <motion.div
        layoutId={showHeaderShared ? `month-header-${calId}-${month}` : undefined}
        className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-hairline bg-card px-4 py-3"
        style={{ willChange: "transform" }}
      >
        <h2 className="text-base font-semibold text-ink">
          {MONTH_LABELS_FULL[month]} {year}
        </h2>
        <span className="text-xs text-muted-foreground">{dim} dager</span>
      </motion.div>

      {/* Body */}
      <div className="flex-1 overflow-auto">
        <div
          className="grid"
          style={{
            gridTemplateColumns: "72px 64px minmax(0,1fr) 96px",
          }}
        >
          {/* column headers */}
          <div className="border-b border-hairline bg-muted/40 px-3 py-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            Dato
          </div>
          <div className="border-b border-hairline bg-muted/40 px-2 py-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            Dag
          </div>
          <div className="border-b border-hairline bg-muted/40 px-3 py-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            Økt
          </div>
          <div className="border-b border-hairline bg-muted/40 px-3 py-2 text-right text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            Varighet
          </div>

          {days.map((day) => {
            const dow = new Date(year, month, day).getDay();
            const weekday = WEEKDAYS_NB[dow];
            const weekend = dow === 0 || dow === 6;
            const sessions: Session[] = [0, 1];

            return (
              <div key={day} className="contents">
                {sessions.map((session) => {
                  const k: CellKey = { year, month, day, session };
                  const id = makeCellId(calId, k);
                  const cell = data[id];
                  const isSelected =
                    selected &&
                    selected.year === year &&
                    selected.month === month &&
                    selected.day === day &&
                    selected.session === session;
                  const isEditing =
                    editingKey &&
                    editingKey.year === year &&
                    editingKey.month === month &&
                    editingKey.day === day &&
                    editingKey.session === session;
                  const isFirst = session === 0;

                  return (
                    <div key={`${day}-${session}`} className="contents">
                      {/* date — only on first session row, spans both via rowSpan via stacking */}
                      <div
                        className={`relative flex items-center border-b border-hairline px-3 text-[12px] text-ink ${
                          weekend ? "bg-muted/40" : ""
                        }`}
                        style={{ minHeight: 36 }}
                      >
                        {isFirst && (
                          <span className="font-medium">
                            {String(day).padStart(2, "0")}.{MONTH_SHORT_NB[month]}
                          </span>
                        )}
                      </div>
                      <div
                        className={`flex items-center border-b border-hairline px-2 text-[12px] text-muted-foreground ${
                          weekend ? "bg-muted/40" : ""
                        }`}
                        style={{ minHeight: 36 }}
                      >
                        {isFirst && weekday}
                      </div>
                      <div
                        onMouseDown={() => onSelect(k)}
                        onDoubleClick={() => beginEdit(k)}
                        className={`relative cursor-cell border-b border-hairline px-3 text-[13px] text-ink ${
                          weekend ? "bg-muted/30" : ""
                        }`}
                        style={{
                          minHeight: 36,
                          background: cell?.color ? cell.color + "22" : undefined,
                        }}
                      >
                        {isSelected && (
                          <motion.span
                            layoutId="selection-ring"
                            className="pointer-events-none absolute inset-0 rounded-sm outline outline-2 outline-primary/80 outline-offset-[-2px]"
                            transition={{ type: "spring", stiffness: 300, damping: 30 }}
                          />
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
                                commitEdit();
                              }
                            }}
                            className="h-full w-full bg-transparent py-2 text-[13px] text-ink outline-none"
                          />
                        ) : (
                          <span
                            className={`flex h-full items-center py-2 ${
                              cell?.bold ? "font-semibold" : ""
                            } ${cell?.italic ? "italic" : ""} ${cell?.underline ? "underline" : ""}`}
                          >
                            {cell?.text ?? ""}
                          </span>
                        )}
                      </div>
                      <div
                        className={`flex items-center justify-end border-b border-hairline px-3 text-[12px] text-muted-foreground ${
                          weekend ? "bg-muted/30" : ""
                        }`}
                        style={{ minHeight: 36 }}
                      >
                        {/* Duration placeholder — wires up to real session metadata later */}
                        {cell?.text ? "1t 30min" : ""}
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

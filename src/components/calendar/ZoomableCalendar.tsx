/**
 * ZoomableCalendar — orchestrator that switches between Year and Month views
 * with a shared-element morph driven by framer-motion. The Month View is a
 * three-pane horizontal carousel (prev / current / next).
 */

import { useCallback, useEffect, useState } from "react";
import { AnimatePresence, LayoutGroup, motion } from "framer-motion";
import { ChevronLeft } from "lucide-react";
import type { CellData, CellKey, Session } from "./yearStore";
import { YearGrid } from "./YearGrid";
import { MonthCarousel } from "./MonthCarousel";

type ViewMode = { kind: "year" } | { kind: "month"; month: number };

function daysInMonth(y: number, m: number) {
  return new Date(y, m + 1, 0).getDate();
}

export interface ZoomableCalendarProps {
  calId: string;
  year: number;
  data: Record<string, CellData>;
  selected: CellKey | null;
  onSelect: (k: CellKey | null) => void;
  onCommitText: (k: CellKey, text: string) => void;
  onFill: (source: CellKey, targets: CellKey[]) => void;
}

export function ZoomableCalendar({
  calId,
  year,
  data,
  selected,
  onSelect,
  onCommitText,
  onFill,
}: ZoomableCalendarProps) {
  const [view, setView] = useState<ViewMode>({ kind: "year" });

  const enterMonth = useCallback((month: number) => {
    setView({ kind: "month", month });
  }, []);

  const exitToYear = useCallback(() => {
    setView({ kind: "year" });
  }, []);

  // Cross-month / cross-day navigation from the Month View keyboard.
  // Keeps the carousel focus in sync when selection crosses a boundary.
  const moveMonthSelection = useCallback(
    (dx: number, dy: number) => {
      if (view.kind !== "month") return;
      const sel = selected ?? {
        year,
        month: view.month,
        day: 1,
        session: 0 as Session,
      };
      let { month, day, session } = sel;
      // Vertical step: walk by half-days.
      if (dy !== 0) {
        let rank = day * 2 + session + dy;
        const dim = daysInMonth(year, month);
        const minRank = 1 * 2 + 0;
        const maxRank = dim * 2 + 1;
        if (rank > maxRank) {
          // overflow → next month
          if (month < 11) {
            month += 1;
            rank = minRank;
          } else {
            rank = maxRank;
          }
        } else if (rank < minRank) {
          if (month > 0) {
            month -= 1;
            const nDim = daysInMonth(year, month);
            rank = nDim * 2 + 1;
          } else {
            rank = minRank;
          }
        }
        day = Math.floor(rank / 2);
        session = (rank % 2) as Session;
      }
      // Horizontal step: jump month, clamp day.
      if (dx !== 0) {
        const m = Math.max(0, Math.min(11, month + dx));
        month = m;
        const nDim = daysInMonth(year, month);
        if (day > nDim) day = nDim;
      }
      onSelect({ year, month, day, session });
      if (month !== view.month) setView({ kind: "month", month });
    },
    [view, selected, year, onSelect],
  );

  // Global keyboard while in Month View.
  useEffect(() => {
    if (view.kind !== "month") return;
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const isTyping =
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable);
      if (isTyping) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === "Escape") {
        e.preventDefault();
        exitToYear();
      } else if (e.key === "ArrowDown" || e.key === "Enter") {
        e.preventDefault();
        moveMonthSelection(0, 1);
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        moveMonthSelection(0, -1);
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        moveMonthSelection(1, 0);
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        moveMonthSelection(-1, 0);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [view, moveMonthSelection, exitToYear]);

  return (
    <LayoutGroup id={`zoom-${calId}`}>
      <div className="relative w-full" style={{ minHeight: "calc(100vh - 280px)" }}>
        <AnimatePresence mode="wait" initial={false}>
          {view.kind === "year" ? (
            <motion.div
              key="year"
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 1.02 }}
              transition={{ type: "spring", stiffness: 300, damping: 30 }}
              style={{ willChange: "transform" }}
            >
              <YearGrid
                calId={calId}
                year={year}
                data={data}
                selected={selected}
                onSelect={onSelect}
                onCommitText={onCommitText}
                onFill={onFill}
                onMonthHeaderDoubleClick={enterMonth}
              />
            </motion.div>
          ) : (
            <motion.div
              key="month"
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.98 }}
              transition={{ type: "spring", stiffness: 300, damping: 30 }}
              className="flex h-full w-full flex-col"
              style={{ willChange: "transform", height: "calc(100vh - 280px)" }}
            >
              <div className="mb-2 flex items-center justify-between">
                <button
                  type="button"
                  onClick={exitToYear}
                  className="inline-flex items-center gap-1 rounded-md border border-hairline bg-background px-2 py-1 text-xs text-muted-foreground hover:bg-secondary hover:text-ink"
                >
                  <ChevronLeft className="h-3.5 w-3.5" />
                  Tilbake til år
                </button>
                <span className="text-xs text-muted-foreground">
                  Esc for å gå tilbake · ← → for å bytte måned
                </span>
              </div>
              <div className="min-h-0 flex-1">
                <MonthCarousel
                  calId={calId}
                  year={year}
                  focusedMonth={view.month}
                  data={data}
                  selected={selected}
                  onSelect={onSelect}
                  onCommitText={onCommitText}
                  onChangeFocus={(m) => setView({ kind: "month", month: m })}
                />
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </LayoutGroup>
  );
}

/**
 * MonthCarousel — three-pane horizontal carousel showing prev / current / next
 * months. Only the focused pane is interactive; the others are desaturated
 * peripheral context. Swiping focus is animated with a spring.
 */

import { motion } from "framer-motion";
import { useMemo } from "react";
import type { CellData, CellKey } from "./yearStore";
import { MonthView } from "./MonthView";

export interface MonthCarouselProps {
  calId: string;
  year: number;
  focusedMonth: number;
  data: Record<string, CellData>;
  selected: CellKey | null;
  onSelect: (k: CellKey | null) => void;
  onCommitText: (k: CellKey, text: string) => void;
  onChangeFocus: (month: number) => void;
}

export function MonthCarousel({
  calId,
  year,
  focusedMonth,
  data,
  selected,
  onSelect,
  onCommitText,
  onChangeFocus,
}: MonthCarouselProps) {
  // Render a window of [prev, current, next]. Edges (Jan, Dec) hide one neighbor.
  const slots = useMemo(() => {
    const arr: { month: number; pos: -1 | 0 | 1 }[] = [];
    if (focusedMonth > 0) arr.push({ month: focusedMonth - 1, pos: -1 });
    arr.push({ month: focusedMonth, pos: 0 });
    if (focusedMonth < 11) arr.push({ month: focusedMonth + 1, pos: 1 });
    return arr;
  }, [focusedMonth]);

  // Each pane occupies 80% of the viewport so peripheral months peek in.
  const PANE_WIDTH = 80; // percent
  const GAP = 2; // percent gap between panes
  const STEP = PANE_WIDTH + GAP;

  return (
    <div className="relative h-full w-full overflow-hidden">
      <motion.div
        className="absolute inset-0 flex items-stretch"
        animate={{ x: `calc(50% - ${PANE_WIDTH / 2}% - ${focusedMonth * 0}%)` }}
        transition={{ type: "spring", stiffness: 300, damping: 30 }}
        style={{ willChange: "transform" }}
      >
        {/* Track is centered: we lay panes out by absolute % offset relative to focused month. */}
        {slots.map(({ month, pos }) => (
          <motion.div
            key={month}
            onClick={() => {
              if (pos !== 0) onChangeFocus(month);
            }}
            className={pos === 0 ? "" : "cursor-pointer"}
            style={{
              position: "absolute",
              left: `calc(50% + ${pos * STEP}% - ${PANE_WIDTH / 2}%)`,
              width: `${PANE_WIDTH}%`,
              top: 0,
              bottom: 0,
              willChange: "transform",
            }}
            initial={false}
            animate={{ scale: pos === 0 ? 1 : 0.94 }}
            transition={{ type: "spring", stiffness: 300, damping: 30 }}
          >
            <MonthView
              calId={calId}
              year={year}
              month={month}
              data={data}
              selected={selected}
              onSelect={onSelect}
              onCommitText={onCommitText}
              faded={pos !== 0}
            />
          </motion.div>
        ))}
      </motion.div>
    </div>
  );
}

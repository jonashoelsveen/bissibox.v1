export const CREATE_DRAG_SNAP_MIN = 5;

export type CreateMarkRange = {
  month: number;
  lo: number;
  hi: number;
  endMonth?: number;
  startMin?: number;
  endMin?: number;
};

type CreateMarkOrigin = {
  month: number;
  rank: number;
  originMin: number;
};

function weekMinutesToRank(minutes: number, gridStartHour: number, slotRows: number): number {
  const lo = Math.round((minutes - gridStartHour * 60) / 30) + 2;
  return Math.max(2, Math.min(slotRows + 1, lo));
}

/** Inclusive 5-minute span from the press to the pointer, within one day. */
function timedCreateMark(
  col: number,
  originMin: number,
  pointerMin: number,
  gridStartHour: number,
  slotRows: number,
): CreateMarkRange {
  const startMin = Math.min(originMin, pointerMin);
  const endMin = Math.max(originMin, pointerMin) + CREATE_DRAG_SNAP_MIN;
  const lo = weekMinutesToRank(startMin, gridStartHour, slotRows);
  const hi = Math.max(lo, weekMinutesToRank(endMin - 1, gridStartHour, slotRows));
  return { month: col, lo, hi, startMin, endMin };
}

export function markRangeFromPointer(
  origin: { month: number; rank: number },
  col: number,
  rank: number,
): CreateMarkRange | null {
  if (col === origin.month && rank === origin.rank) return null;
  const startCol = Math.min(origin.month, col);
  const endCol = Math.max(origin.month, col);
  const startRank = origin.month <= col ? origin.rank : rank;
  const endRank = origin.month <= col ? rank : origin.rank;
  return {
    month: startCol,
    lo: startCol === endCol ? Math.min(origin.rank, rank) : startRank,
    hi: startCol === endCol ? Math.max(origin.rank, rank) : endRank,
    endMonth: startCol === endCol ? undefined : endCol,
  };
}

export function createDragMarkRangeFromPointer(
  origin: CreateMarkOrigin,
  col: number,
  rank: number,
  pointerMin: number,
  gridStartHour: number,
  slotRows: number,
): CreateMarkRange | null {
  if (col === origin.month) {
    return pointerMin === origin.originMin
      ? null
      : timedCreateMark(col, origin.originMin, pointerMin, gridStartHour, slotRows);
  }

  const next = markRangeFromPointer(origin, col, rank);
  if (!next) return null;
  const forward = origin.month <= col;
  return {
    ...next,
    startMin: forward ? origin.originMin : pointerMin,
    endMin: (forward ? pointerMin : origin.originMin) + CREATE_DRAG_SNAP_MIN,
  };
}

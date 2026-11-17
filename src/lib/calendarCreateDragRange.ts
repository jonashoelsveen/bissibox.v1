export const CREATE_DRAG_SNAP_MIN = 5;

export type CreateDragStart = {
  month: number;
  rank: number;
  originMin?: number;
};

export type CreateDragMarkRange = {
  month: number;
  lo: number;
  hi: number;
  endMonth?: number;
  startMin?: number;
  endMin?: number;
};

export function weekRankToMinutes(rank: number, gridStartHour: number): number {
  return gridStartHour * 60 + (rank - 2) * 30;
}

export function weekMinutesToRank(minutes: number, gridStartHour: number, slotRows: number): number {
  const lo = Math.round((minutes - gridStartHour * 60) / 30) + 2;
  return Math.max(2, Math.min(slotRows + 1, lo));
}

export function snapPointerToCreateMinute(
  yInContent: number,
  rowHeight: number,
  gridStartHour: number,
  spanHours: number,
): number {
  const spanMin = spanHours * 60;
  const raw = rowHeight > 0 ? (yInContent / rowHeight) * 30 : 0;
  const snapped = Math.floor(raw / CREATE_DRAG_SNAP_MIN) * CREATE_DRAG_SNAP_MIN;
  const clamped = Math.max(0, Math.min(spanMin - CREATE_DRAG_SNAP_MIN, snapped));
  return gridStartHour * 60 + clamped;
}

export function markRangeMinutes(
  mark: { lo: number; hi: number; startMin?: number; endMin?: number },
  gridStartHour: number,
): { startMin: number; endMin: number } {
  if (mark.startMin != null && mark.endMin != null) {
    return { startMin: mark.startMin, endMin: mark.endMin };
  }
  return {
    startMin: gridStartHour * 60 + (mark.lo - 2) * 30,
    endMin: gridStartHour * 60 + (mark.hi - 2 + 1) * 30,
  };
}

export function timedCreateMark(
  col: number,
  originMin: number,
  pointerMin: number,
  gridStartHour: number,
  slotRows: number,
): CreateDragMarkRange {
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
): CreateDragMarkRange | null {
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

export function createDragRangeFromPointer(
  start: CreateDragStart,
  col: number,
  rank: number,
  pointerMin: number,
  gridStartHour: number,
  slotRows: number,
): CreateDragMarkRange | null {
  if (col !== start.month) {
    return markRangeFromPointer(start, col, rank);
  }
  const originMin = start.originMin ?? weekRankToMinutes(start.rank, gridStartHour);
  return pointerMin === originMin
    ? null
    : timedCreateMark(col, originMin, pointerMin, gridStartHour, slotRows);
}

/** Drag-to-create uses the same 5-minute step as resizing a session. */
export const CREATE_DRAG_SNAP_MIN = 5;

export type CreateMarkRange = {
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

export function weekMinutesToRank(
  minutes: number,
  gridStartHour: number,
  slotRows: number,
): number {
  const lo = Math.round((minutes - gridStartHour * 60) / 30) + 2;
  return Math.max(2, Math.min(slotRows + 1, lo));
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

/** Floor a pointer in the timed grid to a 5-minute boundary. */
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

/** Inclusive 5-minute span from the press to the pointer, within one day. */
export function timedCreateMark(
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

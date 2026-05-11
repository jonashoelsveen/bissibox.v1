## Problem

The mini calendar has a hard-coded `width: 240px` plus `p-2.5` (10px) padding, but the side rail column is 220px and the `<aside>` adds `pr-1`. The mini calendar is wider than its container, forcing horizontal scroll.

## Changes

1. **Make MiniCalendar fluid** — `src/components/calendar/MiniCalendar.tsx` (line 137-139)
   - Remove the fixed inline `style={{ width: 240, fontSize: 12 }}`; keep `fontSize` via a Tailwind class (`text-[12px]`).
   - Change padding from `p-2.5` to `p-1` so the calendar hugs its container.
   - Result: the calendar fills whatever width the rail gives it.

2. **Trim aside padding** — `src/components/calendar/CalendarPage.tsx` (line 150) and `src/components/calendar/DiaryPage.tsx` (equivalent aside)
   - Replace `md:pr-1` with `md:pr-0` so the rail extends to the column edge.

3. **Keep rail at 220px** — no further width change needed; the day cells naturally size to fit.

## Out of scope

- No change to outer page padding (`px-4 md:px-6`) — that's the page gutter, not the rail.
- No change to category rows, headers, or the Library sidebar.

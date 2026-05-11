## Goal

Make the mini calendar in the Calendar and Diary left menus blend in (no card background) and tighten the side nav width to hug the mini calendar's edges.

## Changes

1. **Mini calendar wrapper — remove background and border**
   - `src/components/calendar/CalendarSideNav.tsx` (line 121): replace `<div className="rounded-lg border border-hairline bg-card">` with a plain wrapper (no `bg-card`, no `border`, no `rounded-lg`) so only the day numbers and weekday letters show against the page.
   - `src/components/calendar/DiarySideNav.tsx` (line 154): same change.
   - Keep the existing inner `MiniCalendar` padding (`p-2.5`) intact; selected-day pill, today-dot, and hover states already use semantic tokens and remain visible.

2. **Tighten left-column width**
   - `src/components/calendar/CalendarPage.tsx` (line 149): change grid template from `md:grid-cols-[260px_1fr]` to `md:grid-cols-[220px_1fr]`.
   - `src/components/calendar/DiaryPage.tsx` (line 45): same change.
   - 220px matches the mini calendar's natural width (7 cells × ~26px + padding) so the rail visually ends right at the calendar's edge. Category rows and section headers below still fit (they use `truncate` / flexible widths).

## Out of scope

- No changes to MiniCalendar internals, day-cell sizing, or color tokens.
- No changes to the Library sidebar width or its new right border.

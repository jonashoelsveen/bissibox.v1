# Import Calendar — Plan

A new "Import" entry point on the calendar page that parses spreadsheets/PDFs/CSVs with Lovable AI and lets the user preview & filter detected events directly on the calendar before saving.

## Scope

1. **Entry point** — "Import" button next to the calendar type dropdown.
2. **Source picker modal** — choose between *From Device* (file input) and *From Library* (mirror of the Library Page sidebar + valid files).
3. **Parsing** — Edge Function `parse-calendar-file` that:
   - Uses `xlsx` (SheetJS) to extract sheet data; reads CSV as text; for PDF, sends raw text/base64 (PDF parsing limited; falls back to AI on text content).
   - Calls Lovable AI Gateway with **tool calling** for strict JSON output (categories + events).
4. **Preview state** — modal stays open as floating card; existing calendar events dim; new events render in green; checkboxes per category filter live.
5. **Save** — write filtered events to existing event store (frontend `addEvent`/store) + persist via existing pattern; toast & reset visual state.

## Files to create / change

- `src/components/calendar/ImportCalendar/ImportButton.tsx` — entry button + modal orchestrator (state machine: source → loading → preview).
- `src/components/calendar/ImportCalendar/SourcePickerStep.tsx` — two cards: From Device / From Library (+ Cancel).
- `src/components/calendar/ImportCalendar/LibraryPickerStep.tsx` — two-column file picker; reuses the same folder list query as the Library page; right column filtered to `.xlsx`, `.csv`, `.pdf`.
- `src/components/calendar/ImportCalendar/PreviewStep.tsx` — floating card (summary, category checkboxes, Save button).
- `src/components/calendar/ImportCalendar/types.ts` — `ParsedImport`, `ParsedEvent`, `DetectedCategory`.
- `src/components/calendar/ImportCalendar/usePreviewOverlay.ts` — provides preview events + category filter state for the calendar to consume.
- `supabase/functions/parse-calendar-file/index.ts` — accepts `{ fileName, mimeType, base64 }`, extracts text/sheet data, calls Lovable AI with `parse_calendar` tool, returns the JSON envelope.
- `supabase/config.toml` — add `[functions.parse-calendar-file] verify_jwt = true`.
- `src/routes/calendar.tsx` (or wherever calendar layout lives) — render `<ImportButton />` next to the type dropdown; pipe preview overlay into the calendar grid (dim existing, render greens).
- `src/components/calendar/UnifiedElasticGrid.tsx` & `MonthGridType1.tsx` — accept optional `previewEvents` + `dimExisting` props; render preview events with green styling and pointer-events-none.

## AI parsing contract

Edge function returns:
```json
{
  "total_events_found": 12,
  "detected_categories": [{ "id": "xc_skiing", "name": "XC Skiing", "count": 8 }],
  "events": [{ "title": "...", "start_time": "ISO", "end_time": "ISO|null", "category": "xc_skiing", "description": "..." }]
}
```

Implementation: tool-calling with `google/gemini-3-flash-preview`. System prompt instructs the model to detect categories from headers/prefixes/repeating sections and assign each event a stable category `id` (snake_case). End time defaults to start+1h when missing.

## Preview overlay behavior

- While modal is in preview state, parent calendar page sets `previewMode = true` and passes `previewEvents` (filtered by selected category ids).
- Existing events render with `opacity-30 pointer-events-none`.
- Preview events render with `border-2 border-green-500 bg-green-50/60` and `pointer-events-none` (read-only).
- Toggling category checkbox updates the filter instantly (local React state in the modal lifted to the page via context/prop).

## Save flow

- "Save N events" calls existing event-add path (the calendar already persists `CalendarEvent`s; reuse `onUpsertEvent`/store).
- Map `ParsedEvent` → `CalendarEvent { startISO, endISO, title, category, color }` using the existing color-from-category helper.
- On success: toast "Successfully imported N events", clear overlay, close modal.

## Edge cases / notes

- File size cap 10 MB on client; reject larger with toast.
- PDF parsing in the Worker runtime: do best-effort text extraction (`pdfjs-dist` is heavy; fall back to sending raw base64 to AI with mime hint — keep the function simple and rely on AI for unstructured text when SheetJS can't read).
- 402 / 429 errors from AI gateway surface as toasts.
- Library picker uses the same Supabase `files` + `file_folders` queries already used by the Library page (we'll locate and reuse the existing hook).

## Out of scope

- Editing parsed events inline before save (only category-level filter in v1).
- Recurring event detection beyond what AI infers.
- ICS file support (could be added later as a fast path that bypasses AI).

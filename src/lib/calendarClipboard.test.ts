import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildPasteEventsAtDate,
  buildPasteEventsForWeek,
  eventToDuplicatePatch,
  eventsCoveringWeek,
  serializeEventsForClipboard,
  type CalendarClipboardPayload,
} from "./calendarClipboard.ts";

const repeating = {
  id: "src",
  startISO: "2026-09-07T09:00:00",
  endISO: "2026-09-07T10:00:00",
  allDay: false,
  title: "Practice",
  color: "#3366ff",
  repeatRule: "weekly",
  repeatSeriesId: "series-1",
  repeatDetached: false,
};

test("clipboard payload does not store repeat metadata", () => {
  const sessions = serializeEventsForClipboard([repeating]);
  assert.equal(sessions.length, 1);
  assert.equal("repeatRule" in sessions[0]!, false);
  assert.equal("repeatSeriesId" in sessions[0]!, false);
  assert.equal("repeatDetached" in sessions[0]!, false);
});

test("paste of a repeating session is a one-off", () => {
  const payload: CalendarClipboardPayload = {
    version: 1,
    calId: "user:test",
    sourceView: "month",
    operation: "copy",
    savedAt: Date.now(),
    sessions: serializeEventsForClipboard([repeating]),
  };
  const pasted = buildPasteEventsAtDate(payload, new Date(2026, 8, 10));
  assert.equal(pasted.length, 1);
  assert.equal(pasted[0]!.repeatRule, null);
  assert.equal(pasted[0]!.repeatSeriesId, null);
  assert.equal(pasted[0]!.repeatDetached, true);
  assert.notEqual(pasted[0]!.id, repeating.id);
});

test("duplicate of a repeating session is a one-off", () => {
  const patch = eventToDuplicatePatch(repeating);
  assert.equal(patch.repeatRule, null);
  assert.equal(patch.repeatSeriesId, null);
  assert.equal(patch.repeatDetached, true);
  assert.equal("id" in patch, false);
});

test("week paste maps each session onto the matching weekday", () => {
  const payload: CalendarClipboardPayload = {
    version: 1,
    calId: "user:test",
    sourceView: "month",
    operation: "copy",
    savedAt: Date.now(),
    span: "week",
    sessions: [
      {
        dayOfWeek: 1,
        startMinutes: 9 * 60,
        endMinutes: 10 * 60,
        allDay: false,
        title: "Mon",
        color: null,
      },
      {
        dayOfWeek: 4,
        startMinutes: 18 * 60,
        endMinutes: 19 * 60,
        allDay: false,
        title: "Thu",
        color: null,
      },
    ],
  };
  const weekStart = new Date(2026, 9, 5);
  const pasted = buildPasteEventsForWeek(payload, weekStart);
  assert.equal(pasted.length, 2);
  assert.equal(pasted[0]!.title, "Mon");
  assert.equal(pasted[0]!.startISO.slice(0, 10), "2026-10-05");
  assert.equal(pasted[1]!.title, "Thu");
  assert.equal(pasted[1]!.startISO.slice(0, 10), "2026-10-08");
});

test("eventsCoveringWeek includes sessions that start in the week", () => {
  const weekStart = new Date(2026, 9, 5);
  const inside = {
    id: "in",
    startISO: "2026-10-07T09:00:00",
    endISO: "2026-10-07T10:00:00",
    allDay: false,
    title: "Wed",
    color: null,
  };
  const outside = {
    id: "out",
    startISO: "2026-10-12T09:00:00",
    endISO: "2026-10-12T10:00:00",
    allDay: false,
    title: "Next Mon",
    color: null,
  };
  const ids = eventsCoveringWeek([inside, outside], weekStart).map((e) => e.id);
  assert.deepEqual(ids, ["in"]);
});

test("paste of a multi-day session keeps its length and starts on the paste day", () => {
  const payload: CalendarClipboardPayload = {
    version: 1,
    calId: "user:test",
    sourceView: "week",
    operation: "copy",
    savedAt: Date.now(),
    sessions: serializeEventsForClipboard([
      {
        id: "span",
        startISO: "2026-10-05T09:00:00",
        endISO: "2026-10-07T17:00:00",
        allDay: false,
        title: "Trip",
        color: "#3366ff",
      },
    ]),
  };
  const pasted = buildPasteEventsAtDate(payload, new Date(2026, 9, 16));
  assert.equal(pasted[0]!.startISO, "2026-10-16T09:00:00");
  assert.equal(pasted[0]!.endISO, "2026-10-18T17:00:00");
  assert.equal(pasted[0]!.allDay, false);
});

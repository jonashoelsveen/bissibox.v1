import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildPasteEventsAtDate,
  eventToDuplicatePatch,
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

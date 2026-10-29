import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildPasteEventsAtDate,
  eventToDuplicatePatch,
  serializeEventsForClipboard,
  type CalendarClipboardPayload,
} from "./calendarClipboard.ts";
import { sessionCopyMenu } from "./sessionCopyMenu.ts";

const webAddress = {
  id: "feed-1",
  startISO: "2026-10-29T09:00:00",
  endISO: "2026-10-29T10:00:00",
  allDay: false,
  title: "Lecture",
  color: "#3366ff",
  userCalendarId: "cal-web",
  followsCalendarColor: true,
};

test("web address copy drops the subscription calendar so the paste can be deleted", () => {
  const sessions = serializeEventsForClipboard([webAddress]);
  assert.equal("userCalendarId" in sessions[0]!, false);
  assert.equal("followsCalendarColor" in sessions[0]!, false);
  const payload: CalendarClipboardPayload = {
    version: 1,
    calId: "user:test",
    sourceView: "month",
    operation: "copy",
    savedAt: Date.now(),
    sessions,
  };
  const pasted = buildPasteEventsAtDate(payload, new Date(2026, 9, 30));
  assert.equal(pasted[0]!.userCalendarId, undefined);
  assert.equal(pasted[0]!.followsCalendarColor, undefined);
  assert.notEqual(pasted[0]!.id, webAddress.id);
  const duplicated = eventToDuplicatePatch(webAddress);
  assert.equal("userCalendarId" in duplicated, false);
  assert.equal("followsCalendarColor" in duplicated, false);
});

test("a standard web address session offers copy and duplicate, not delete", () => {
  const menu = sessionCopyMenu({
    count: 1,
    subscriptionOnly: true,
    anyDeletable: false,
    singleCanDuplicate: true,
  });
  assert.equal(menu.showCopy, true);
  assert.equal(menu.copyLabel, "Copy session");
  assert.equal(menu.showDuplicate, true);
  assert.equal(menu.duplicateEnabled, true);
  assert.equal(menu.showDelete, false);
  assert.equal(menu.rowCount, 2);
});

test("shift-selected web address sessions offer copy and not delete", () => {
  const menu = sessionCopyMenu({
    count: 3,
    subscriptionOnly: true,
    anyDeletable: false,
    singleCanDuplicate: false,
  });
  assert.equal(menu.showCopy, true);
  assert.equal(menu.copyLabel, "Copy sessions");
  assert.equal(menu.showDuplicate, false);
  assert.equal(menu.showDelete, false);
  assert.equal(menu.rowCount, 1);
});

test("a pasted web address session deletes like a normal session", () => {
  const menu = sessionCopyMenu({
    count: 1,
    subscriptionOnly: false,
    anyDeletable: true,
    singleCanDuplicate: true,
  });
  assert.equal(menu.showCopy, true);
  assert.equal(menu.showDuplicate, true);
  assert.equal(menu.duplicateEnabled, true);
  assert.equal(menu.showDelete, true);
  assert.equal(menu.deleteEnabled, true);
  assert.equal(menu.deleteLabel, "Delete session");
});

test("a mixed shift selection copies everything and deletes only the local sessions", () => {
  const menu = sessionCopyMenu({
    count: 2,
    subscriptionOnly: false,
    anyDeletable: true,
    singleCanDuplicate: false,
  });
  assert.equal(menu.showCopy, true);
  assert.equal(menu.showDuplicate, false);
  assert.equal(menu.showDelete, true);
  assert.equal(menu.deleteEnabled, true);
  assert.equal(menu.deleteLabel, "Delete sessions");
  assert.equal(menu.rowCount, 2);
});

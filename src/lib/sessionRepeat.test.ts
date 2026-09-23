import assert from "node:assert/strict";
import { test } from "node:test";
import {
  eventIdsForDeleteScope,
  eventsInRepeatSeries,
  resolveSessionRepeatState,
  sessionIsRepeatSeries,
} from "./sessionRepeat.ts";

function session(
  id: string,
  startISO: string,
  extra: Record<string, unknown> = {},
) {
  return {
    id,
    startISO,
    endISO: startISO.replace("T09:00:00", "T10:00:00"),
    allDay: false,
    title: "Practice",
    color: "#3366ff",
    ...extra,
  };
}

const source = session("a", "2026-09-07T09:00:00", {
  repeatRule: "weekly",
  repeatSeriesId: "series-1",
});
const tagged = session("b", "2026-09-14T09:00:00", {
  repeatRule: "weekly",
  repeatSeriesId: "series-1",
});
const untaggedLater = session("c", "2026-09-21T09:00:00");
const pasted = session("paste", "2026-09-10T09:00:00", {
  repeatRule: null,
  repeatSeriesId: null,
  repeatDetached: true,
});

test("All includes tagged and untagged later instances", () => {
  const all = [source, tagged, untaggedLater, pasted];
  const ids = eventIdsForDeleteScope("allInSeries", all, source).sort();
  assert.deepEqual(ids, ["a", "b", "c"]);
  const fromLater = eventIdsForDeleteScope("allInSeries", all, untaggedLater).sort();
  assert.deepEqual(fromLater, ["a", "b", "c"]);
});

test("pasted copy is not in the source series and has Repeat off", () => {
  const all = [source, tagged, untaggedLater, pasted];
  const series = eventsInRepeatSeries(all, source);
  assert.equal(
    series.some((e) => e.id === "paste"),
    false,
  );
  assert.equal(sessionIsRepeatSeries(pasted, all), false);
  assert.equal(resolveSessionRepeatState(pasted, all).enabled, false);
});

test("This scope is only the open session", () => {
  const all = [source, tagged, untaggedLater];
  assert.deepEqual(eventIdsForDeleteScope("this", all, tagged), ["b"]);
});

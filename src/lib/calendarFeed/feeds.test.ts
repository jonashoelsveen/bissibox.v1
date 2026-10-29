import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { expandFeed } from "./expand.ts";
import { parseFeed, rewriteWindowsTzids } from "./parse.ts";
import { FeedError, type SubscriptionEvent } from "./types.ts";

const CAL = "cal-1";
const FROM = new Date("2026-10-01T00:00:00Z");
const TO = new Date("2026-11-01T00:00:00Z");

function expand(body: string, from = FROM, to = TO, timeZone = "Europe/Oslo"): SubscriptionEvent[] {
  return expandFeed(parseFeed(body), { calendarId: CAL, from, to, timeZone });
}

function calendar(body: string): string {
  return `BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//bissibox//test//EN\r\n${body}END:VCALENDAR\r\n`;
}

describe("calendar feeds", () => {
  it("reads a Google-style timed event", () => {
    const events = expand(
      calendar(`X-WR-CALNAME:Google\r\nBEGIN:VEVENT\r\nUID:g@x\r\nDTSTART:20261028T090000Z\r\nDTEND:20261028T100000Z\r\nSUMMARY:Standup\r\nEND:VEVENT\r\n`),
    );
    assert.equal(events.length, 1);
    assert.equal(events[0]?.title, "Standup");
    assert.equal(events[0]?.start, "2026-10-28T09:00:00.000Z");
    assert.equal(events[0]?.end, "2026-10-28T10:00:00.000Z");
    assert.equal(events[0]?.readOnly, true);
    assert.equal(events[0]?.source, "subscription");
    assert.equal(events[0]?.recurrence, null);
  });

  it("keeps an Outlook Windows zone that ships its own VTIMEZONE", () => {
    const body = calendar(`BEGIN:VTIMEZONE\r\nTZID:W. Europe Standard Time\r\nBEGIN:STANDARD\r\nDTSTART:19701025T030000\r\nTZOFFSETFROM:+0200\r\nTZOFFSETTO:+0100\r\nRRULE:FREQ=YEARLY;BYDAY=-1SU;BYMONTH=10\r\nEND:STANDARD\r\nBEGIN:DAYLIGHT\r\nDTSTART:19700329T020000\r\nTZOFFSETFROM:+0100\r\nTZOFFSETTO:+0200\r\nRRULE:FREQ=YEARLY;BYDAY=-1SU;BYMONTH=3\r\nEND:DAYLIGHT\r\nEND:VTIMEZONE\r\nBEGIN:VEVENT\r\nUID:o@x\r\nDTSTART;TZID=W. Europe Standard Time:20260115T090000\r\nDTEND;TZID=W. Europe Standard Time:20260115T100000\r\nSUMMARY:Outlook\r\nEND:VEVENT\r\n`);
    assert.match(rewriteWindowsTzids(body), /TZID=W\. Europe Standard Time/);
    const events = expand(body, new Date("2026-01-01T00:00:00Z"), new Date("2026-02-01T00:00:00Z"));
    assert.equal(events[0]?.start, "2026-01-15T08:00:00.000Z");
  });

  it("rewrites a Windows TZID that has no VTIMEZONE", () => {
    const body = calendar(`BEGIN:VEVENT\r\nUID:w@x\r\nDTSTART;TZID=W. Europe Standard Time:20260115T090000\r\nDTEND;TZID=W. Europe Standard Time:20260115T100000\r\nSUMMARY:Mapped\r\nEND:VEVENT\r\n`);
    assert.match(rewriteWindowsTzids(body), /TZID=Europe\/Berlin/);
    const events = expand(body, new Date("2026-01-01T00:00:00Z"), new Date("2026-02-01T00:00:00Z"));
    assert.equal(events[0]?.start, "2026-01-15T08:00:00.000Z");
  });

  it("reads an iCloud-style all-day event with an exclusive end", () => {
    const events = expand(
      calendar(`X-WR-CALNAME:iCloud\r\nX-APPLE-CALENDAR-COLOR:#FF2D55\r\nBEGIN:VEVENT\r\nUID:i@x\r\nDTSTART;VALUE=DATE:20261021\r\nDTEND;VALUE=DATE:20261023\r\nSUMMARY:Trip\r\nEND:VEVENT\r\n`),
    );
    assert.equal(parseFeed(calendar(`X-APPLE-CALENDAR-COLOR:#FF2D55\r\nBEGIN:VEVENT\r\nUID:i@x\r\nDTSTART;VALUE=DATE:20261021\r\nEND:VEVENT\r\n`)).color, "#ff2d55");
    assert.equal(events[0]?.allDay, true);
    assert.equal(events[0]?.start, "2026-10-21");
    assert.equal(events[0]?.end, "2026-10-23");
  });

  it("gives a date-only event one day and a timed event with no end zero duration", () => {
    const allDay = expand(calendar(`BEGIN:VEVENT\r\nUID:d@x\r\nDTSTART;VALUE=DATE:20261021\r\nSUMMARY:Day\r\nEND:VEVENT\r\n`));
    assert.equal(allDay[0]?.end, "2026-10-22");
    const timed = expand(calendar(`BEGIN:VEVENT\r\nUID:t@x\r\nDTSTART:20261028T090000Z\r\nSUMMARY:Point\r\nEND:VEVENT\r\n`));
    assert.equal(timed[0]?.start, timed[0]?.end);
  });

  it("opens a MazeMap link from LOCATION, URL, or DESCRIPTION", () => {
    const fromLocation = expand(
      calendar(`BEGIN:VEVENT\r\nUID:m1@x\r\nDTSTART:20261028T090000Z\r\nDTEND:20261028T100000Z\r\nSUMMARY:Room\r\nLOCATION:Library https://use.mazemap.com/go/1\r\nEND:VEVENT\r\n`),
    );
    assert.equal(fromLocation[0]?.location?.provider, "mazemap");
    assert.equal(fromLocation[0]?.location?.label, "Library");
    assert.match(fromLocation[0]?.location?.url ?? "", /mazemap\.com/);

    const fromUrl = expand(
      calendar(`BEGIN:VEVENT\r\nUID:m2@x\r\nDTSTART:20261028T090000Z\r\nDTEND:20261028T100000Z\r\nSUMMARY:Link\r\nURL:https://use.mazemap.com/go/2\r\nEND:VEVENT\r\n`),
    );
    assert.equal(fromUrl[0]?.location?.provider, "mazemap");
    assert.equal(fromUrl[0]?.location?.label, "MazeMap");

    const fromDescription = expand(
      calendar(`BEGIN:VEVENT\r\nUID:m3@x\r\nDTSTART:20261028T090000Z\r\nDTEND:20261028T100000Z\r\nSUMMARY:Note\r\nDESCRIPTION:See https://use.mazemap.com/go/3\r\nEND:VEVENT\r\n`),
    );
    assert.equal(fromDescription[0]?.location?.provider, "mazemap");
    assert.equal(fromDescription[0]?.description, "See");
  });

  it("keeps a non-map URL in the description and drops it as a location", () => {
    const events = expand(
      calendar(`BEGIN:VEVENT\r\nUID:u@x\r\nDTSTART:20261028T090000Z\r\nDTEND:20261028T100000Z\r\nSUMMARY:Doc\r\nLOCATION:https://example.com/notes\r\nDESCRIPTION:Bring notes\r\nEND:VEVENT\r\n`),
    );
    assert.equal(events[0]?.location, null);
    assert.match(events[0]?.description ?? "", /example\.com\/notes/);
    assert.match(events[0]?.description ?? "", /Bring notes/);
  });

  it("skips an EXDATE and follows moved and cancelled overrides", () => {
    const skipped = expand(
      calendar(`BEGIN:VEVENT\r\nUID:ex@x\r\nDTSTART:20261001T090000Z\r\nDTEND:20261001T100000Z\r\nRRULE:FREQ=DAILY;COUNT=4\r\nEXDATE:20261003T090000Z\r\nSUMMARY:Daily\r\nEND:VEVENT\r\n`),
    );
    assert.deepEqual(skipped.map((event) => event.start), [
      "2026-10-01T09:00:00.000Z",
      "2026-10-02T09:00:00.000Z",
      "2026-10-04T09:00:00.000Z",
    ]);

    const changed = expand(
      calendar(`BEGIN:VEVENT\r\nUID:mv@x\r\nDTSTART:20261001T090000Z\r\nDTEND:20261001T100000Z\r\nRRULE:FREQ=DAILY;COUNT=2\r\nSUMMARY:Series\r\nEND:VEVENT\r\nBEGIN:VEVENT\r\nUID:mv@x\r\nRECURRENCE-ID:20261002T090000Z\r\nDTSTART:20261002T110000Z\r\nDTEND:20261002T120000Z\r\nSUMMARY:Moved\r\nEND:VEVENT\r\nBEGIN:VEVENT\r\nUID:cx@x\r\nDTSTART:20261001T090000Z\r\nDTEND:20261001T100000Z\r\nRRULE:FREQ=DAILY;COUNT=2\r\nSUMMARY:Keep\r\nEND:VEVENT\r\nBEGIN:VEVENT\r\nUID:cx@x\r\nRECURRENCE-ID:20261002T090000Z\r\nDTSTART:20261002T090000Z\r\nDTEND:20261002T100000Z\r\nSTATUS:CANCELLED\r\nSUMMARY:Gone\r\nEND:VEVENT\r\n`),
    );
    const moved = changed.find((event) => event.title === "Moved");
    assert.equal(moved?.start, "2026-10-02T11:00:00.000Z");
    assert.equal(changed.filter((event) => event.title === "Gone" || event.title === "Keep").map((event) => event.start).join(","), "2026-10-01T09:00:00.000Z");
  });

  it("places floating times in the feed zone and respects Oslo daylight time", () => {
    const winter = expand(
      calendar(`X-WR-TIMEZONE:Europe/Oslo\r\nBEGIN:VEVENT\r\nUID:f@x\r\nDTSTART:20260115T090000\r\nDTEND:20260115T100000\r\nSUMMARY:Float\r\nEND:VEVENT\r\n`),
      new Date("2026-01-01T00:00:00Z"),
      new Date("2026-02-01T00:00:00Z"),
    );
    assert.equal(winter[0]?.start, "2026-01-15T08:00:00.000Z");
    const summer = expand(
      calendar(`X-WR-TIMEZONE:Europe/Oslo\r\nBEGIN:VEVENT\r\nUID:s@x\r\nDTSTART:20260715T090000\r\nDTEND:20260715T100000\r\nSUMMARY:Summer\r\nEND:VEVENT\r\n`),
      new Date("2026-07-01T00:00:00Z"),
      new Date("2026-08-01T00:00:00Z"),
    );
    assert.equal(summer[0]?.start, "2026-07-15T07:00:00.000Z");
  });

  it("unfolds folded lines, unescapes text, and concatenates calendars", () => {
    const events = expand(
      `BEGIN:VCALENDAR\r\nBEGIN:VEVENT\r\nUID:fold@x\r\nDTSTART:20261028T090000Z\r\nDTEND:20261028T100000Z\r\nSUMMARY:Hello\\, folded\r\n  line\r\nEND:VEVENT\r\nEND:VCALENDAR\r\nBEGIN:VCALENDAR\r\nBEGIN:VEVENT\r\nUID:second@x\r\nDTSTART:20261028T110000Z\r\nDTEND:20261028T120000Z\r\nSUMMARY:Second\r\nEND:VEVENT\r\nEND:VCALENDAR\r\n`,
    );
    assert.equal(events.find((event) => event.title.startsWith("Hello"))?.title, "Hello, folded line");
    assert.equal(events.some((event) => event.title === "Second"), true);
  });

  it("rejects a malformed calendar and a body that is not a calendar", () => {
    assert.throws(() => parseFeed("BEGIN:VCALENDAR\nBEGIN:VEVENT\n"), (error: unknown) => {
      assert.ok(error instanceof FeedError);
      assert.equal(error.code, "parse_failed");
      return true;
    });
    assert.throws(() => parseFeed("hello there"), (error: unknown) => {
      assert.ok(error instanceof FeedError);
      assert.equal(error.code, "not_calendar");
      assert.equal(error.message.includes("hello"), false);
      return true;
    });
  });

  it("drops a cancelled series and includes an event that starts before the window", () => {
    const cancelled = expand(
      calendar(`BEGIN:VEVENT\r\nUID:c@x\r\nDTSTART:20261001T090000Z\r\nDTEND:20261001T100000Z\r\nRRULE:FREQ=DAILY;COUNT=3\r\nSTATUS:CANCELLED\r\nSUMMARY:No\r\nEND:VEVENT\r\n`),
    );
    assert.equal(cancelled.length, 0);
    const overlap = expand(
      calendar(`BEGIN:VEVENT\r\nUID:over@x\r\nDTSTART:20260930T220000Z\r\nDTEND:20261001T020000Z\r\nSUMMARY:Overnight\r\nEND:VEVENT\r\n`),
      new Date("2026-10-01T00:00:00Z"),
      new Date("2026-10-02T00:00:00Z"),
    );
    assert.equal(overlap.length, 1);
  });
});

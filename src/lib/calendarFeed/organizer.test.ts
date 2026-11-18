import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { calendarOwnerEmail, isInvitedByOther, mailboxEmailFromFeedUrl, type FeedParty } from "./organizer.ts";

const jonas = "jonas@gmail.com";
const ada = "ada@example.com";

function event(organizer: string | null, attendees: string[]): FeedParty {
  return { organizerEmail: organizer, attendeeEmails: attendees };
}

describe("synced calendar owner", () => {
  it("uses the signed-in address when the feed names it", () => {
    const events = [
      event(jonas, [jonas]),
      event(ada, [ada, jonas]),
    ];
    const owner = calendarOwnerEmail(events, "Jonas@Gmail.com");
    assert.equal(owner, jonas);
    assert.equal(isInvitedByOther(events[0]!, owner), false);
    assert.equal(isInvitedByOther(events[1]!, owner), true);
  });

  it("infers the person invited to every meeting they did not create", () => {
    const events = [
      event(ada, [ada, jonas]),
      event("ben@example.com", ["ben@example.com", jonas, "sam@example.com"]),
    ];
    const owner = calendarOwnerEmail(events, "other@bissibox.app");
    assert.equal(owner, jonas);
    assert.equal(isInvitedByOther(events[0]!, owner), true);
    assert.equal(isInvitedByOther(events[1]!, owner), true);
  });

  it("infers the person who both creates sessions and is invited to others", () => {
    const events = [
      event(jonas, [jonas]),
      event(ada, [ada, jonas, "assistant@example.com"]),
      event("ben@example.com", ["ben@example.com", jonas, "assistant@example.com"]),
    ];
    const owner = calendarOwnerEmail(events, null);
    assert.equal(owner, jonas);
    assert.equal(isInvitedByOther(events[0]!, owner), false);
    assert.equal(isInvitedByOther(events[1]!, owner), true);
  });

  it("does not mark a session when nobody was invited", () => {
    const events = [event(ada, []), event(null, [])];
    const owner = calendarOwnerEmail(events, jonas);
    assert.equal(owner, null);
    assert.equal(isInvitedByOther(events[0]!, owner), false);
    assert.equal(isInvitedByOther(events[1]!, owner), false);
  });

  it("marks an Outlook meeting that names another organizer and no attendees", () => {
    const events = [
      event(null, []),
      event(jonas, []),
      event(ada, []),
    ];
    const owner = calendarOwnerEmail(events, jonas);
    assert.equal(owner, jonas);
    assert.equal(isInvitedByOther(events[0]!, owner), false);
    assert.equal(isInvitedByOther(events[1]!, owner), false);
    assert.equal(isInvitedByOther(events[2]!, owner), true);
  });

  it("uses the mailbox in a Google subscription address when sign-in differs", () => {
    const events = [
      { ...event(jonas, []), mailboxEmail: jonas },
      { ...event(ada, []), mailboxEmail: jonas },
    ];
    const owner = calendarOwnerEmail(events, "other@bissibox.app");
    assert.equal(owner, jonas);
    assert.equal(isInvitedByOther(events[0]!, owner), false);
    assert.equal(isInvitedByOther(events[1]!, owner), true);
  });

  it("reads a mailbox from a secret iCal address and ignores a holiday calendar", () => {
    assert.equal(
      mailboxEmailFromFeedUrl("https://calendar.google.com/calendar/ical/jonas%40gmail.com/private-abc/basic.ics"),
      jonas,
    );
    assert.equal(
      mailboxEmailFromFeedUrl("webcal://calendar.google.com/calendar/ical/en.norwegian%23holiday%40group.v.calendar.google.com/public/basic.ics"),
      null,
    );
  });

  it("does not mark a holiday published by a calendar resource", () => {
    const events = [event("en.norwegian#holiday@group.v.calendar.google.com", [])];
    const owner = calendarOwnerEmail(events, jonas);
    assert.equal(owner, null);
    assert.equal(isInvitedByOther(events[0]!, jonas), false);
  });

  it("leaves the owner unknown when two people both own the feed", () => {
    const events = [
      event(jonas, [jonas, ada]),
      event(ada, [ada, jonas]),
    ];
    assert.equal(calendarOwnerEmail(events, null), null);
    assert.equal(isInvitedByOther(events[0]!, null), false);
  });
});

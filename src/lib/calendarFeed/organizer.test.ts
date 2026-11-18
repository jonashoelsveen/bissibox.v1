import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { calendarOwnerEmail, isInvitedByOther, type FeedParty } from "./organizer.ts";

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

  it("does not mark a public event the owner was not invited to", () => {
    const events = [event(jonas, [jonas]), event("news@example.com", [])];
    const owner = calendarOwnerEmail(events, jonas);
    assert.equal(isInvitedByOther(events[1]!, owner), false);
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

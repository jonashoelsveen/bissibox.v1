import assert from "node:assert/strict";
import { test } from "node:test";
import { entitySessionVisibleToMember, parseVisibleCalendar } from "./calendarVisiblePayload.ts";

const TEAM = "5171c598-d027-40bd-888a-e479437a283c";
const GROUP = "ab9df062-7533-4298-a866-b25be27c2e69";
const SESSION = "c0ffee00-15e5-4000-8000-000000000001";

test("parses camelCase RPC jsonb", () => {
  const parsed = parseVisibleCalendar({
    memberships: [{ teamId: TEAM, name: "Team 32", appGroupId: GROUP, groupIds: [GROUP] }],
    sessions: [
      {
        id: SESSION,
        entity_id: TEAM,
        title: "All members",
        starts_at: "2026-09-16T09:00:00+00:00",
        app_group_id: null,
      },
    ],
  });
  assert.equal(parsed.memberships[0]?.teamId, TEAM);
  assert.equal(parsed.sessions[0]?.id, SESSION);
  assert.equal(parsed.sessions[0]?.entity_id, TEAM);
});

test("parses snake_case membership keys and nested JSON strings", () => {
  const parsed = parseVisibleCalendar(
    JSON.stringify({
      memberships: JSON.stringify([
        { team_id: TEAM, name: "Team 32", app_group_id: GROUP, group_ids: [GROUP] },
      ]),
      sessions: JSON.stringify([
        { id: SESSION, entity_id: TEAM, title: "All members", starts_at: "2026-09-16T09:00:00+00:00" },
      ]),
    }),
  );
  assert.equal(parsed.memberships.length, 1);
  assert.equal(parsed.memberships[0]?.teamId, TEAM);
  assert.deepEqual(parsed.memberships[0]?.groupIds, [GROUP]);
  assert.equal(parsed.sessions.length, 1);
  assert.equal(parsed.sessions[0]?.id, SESSION);
});

test("All sessions are visible to every member, group sessions only to that group", () => {
  const groupA = new Set([GROUP]);
  const noGroup = new Set<string>();
  assert.equal(entitySessionVisibleToMember(null, noGroup, true), true);
  assert.equal(entitySessionVisibleToMember(null, groupA, true), true);
  assert.equal(entitySessionVisibleToMember(GROUP, groupA, true), true);
  assert.equal(entitySessionVisibleToMember(GROUP, noGroup, true), false);
  assert.equal(entitySessionVisibleToMember(null, groupA, false), false);
  assert.equal(
    entitySessionVisibleToMember("11111111-1111-4111-8111-111111111111", groupA, true),
    false,
  );
});

test("empty or invalid payloads do not throw", () => {
  assert.deepEqual(parseVisibleCalendar(null), { memberships: [], sessions: [] });
  assert.deepEqual(parseVisibleCalendar("not-json"), { memberships: [], sessions: [] });
  assert.deepEqual(parseVisibleCalendar({ sessions: SESSION }), { memberships: [], sessions: [] });
});

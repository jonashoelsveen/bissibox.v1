import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  compareSignupRosterLabels,
  sessionAudienceMembers,
  signupTabForMember,
  signupTabForRosterMember,
} from "./sessionSignupAudience.ts";

const group = "group-1";

function member(
  id: string,
  status: string,
  groupIds: string[],
  userId: string | null = id,
) {
  return {
    id,
    status,
    userId,
    groups: groupIds.map((groupId) => ({ groupId })),
  };
}

describe("session audience", () => {
  const roster = [
    member("a", "active", [group]),
    member("b", "roster", []),
    member("c", "pending", [group]),
    member("d", "active", ["other"]),
  ];

  it("includes every active and roster member when the session is for all", () => {
    assert.deepEqual(
      sessionAudienceMembers(roster, null).map((row) => row.id),
      ["a", "b", "d"],
    );
  });

  it("keeps only members of the chosen group", () => {
    assert.deepEqual(
      sessionAudienceMembers(roster, group).map((row) => row.id),
      ["a"],
    );
  });

  it("starts unanswered members in pending and moves them when they answer", () => {
    assert.equal(signupTabForMember("a", {}), "pending");
    assert.equal(signupTabForMember("a", { a: "accepted" }), "accepted");
    assert.equal(signupTabForMember("a", { a: "declined" }), "declined");
  });

  it("returns a cleared answer to pending", () => {
    assert.equal(signupTabForMember("a", {}), "pending");
  });

  it("keeps a member with no account in pending", () => {
    assert.equal(signupTabForMember(null, { a: "accepted" }), "pending");
  });

  it("uses the roster row when the account id is not stored on the member", () => {
    const row = { id: "member-1", userId: null };
    assert.equal(
      signupTabForRosterMember(row, { "member-1": "accepted" }, {}),
      "accepted",
    );
    assert.equal(signupTabForRosterMember(row, {}, {}), "pending");
  });
});

describe("signup search order", () => {
  it("groups accepted, then cancelled, then pending, alphabetically inside each", () => {
    const rows = [
      { tab: "pending" as const, label: "Nora" },
      { tab: "declined" as const, label: "ada" },
      { tab: "accepted" as const, label: "Zoe" },
      { tab: "accepted" as const, label: "ann" },
      { tab: "pending" as const, label: "Bo" },
      { tab: "declined" as const, label: "Mia" },
    ];
    rows.sort(compareSignupRosterLabels);
    assert.deepEqual(
      rows.map((row) => `${row.tab}:${row.label}`),
      [
        "accepted:ann",
        "accepted:Zoe",
        "declined:ada",
        "declined:Mia",
        "pending:Bo",
        "pending:Nora",
      ],
    );
  });
});

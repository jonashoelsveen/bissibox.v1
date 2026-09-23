import assert from "node:assert/strict";
import { test } from "node:test";
import { mergeRemoteSessions, type MergeableSession, type MergeMutation } from "./calendarSessionMerge.ts";

const older: MergeableSession = {
  id: "old",
  title: "Existing",
  startISO: "2026-05-01T09:00:00",
  endISO: "2026-05-01T10:00:00",
  synced: true,
};

const created: MergeableSession = {
  id: "new",
  title: "Created locally",
  startISO: "2026-05-02T09:00:00",
  endISO: "2026-05-02T10:00:00",
  synced: false,
};

test("GET older rows plus unsynced local id keeps the new id", () => {
  const mutations: MergeMutation[] = [{ id: "new", op: "upsert", event: created }];
  const merged = mergeRemoteSessions({
    remoteOk: true,
    remote: [older],
    local: [older, created],
    mutations,
  });
  const ids = merged.next.map((row) => row.id).sort();
  assert.deepEqual(ids, ["new", "old"]);
  assert.equal(merged.next.find((row) => row.id === "new")?.synced, false);
  assert.equal(merged.next.find((row) => row.id === "old")?.synced, true);
  assert.deepEqual(merged.ackUpsertIds, []);
});

test("GET that includes a pending upsert acks that id", () => {
  const remoteNew = { ...created, synced: true };
  const merged = mergeRemoteSessions({
    remoteOk: true,
    remote: [older, remoteNew],
    local: [older, created],
    mutations: [{ id: "new", op: "upsert", event: created }],
  });
  assert.deepEqual(merged.ackUpsertIds, ["new"]);
  assert.equal(merged.next.find((row) => row.id === "new")?.synced, true);
});

test("outbox delete plus GET that still has the id keeps it out of the painted set", () => {
  const merged = mergeRemoteSessions({
    remoteOk: true,
    remote: [older, created],
    local: [older],
    mutations: [{ id: "new", op: "delete" }],
  });
  assert.deepEqual(
    merged.next.map((row) => row.id),
    ["old"],
  );
  assert.deepEqual(merged.ackDeleteIds, []);
});

test("outbox delete is acked when GET omits the id", () => {
  const merged = mergeRemoteSessions({
    remoteOk: true,
    remote: [older],
    local: [older],
    mutations: [{ id: "new", op: "delete" }],
  });
  assert.deepEqual(merged.ackDeleteIds, ["new"]);
});

test("GET older rows plus unsynced local without outbox keeps the new id", () => {
  const merged = mergeRemoteSessions({
    remoteOk: true,
    remote: [older],
    local: [older, created],
    mutations: [],
  });
  const ids = merged.next.map((row) => row.id).sort();
  assert.deepEqual(ids, ["new", "old"]);
  assert.equal(merged.next.find((row) => row.id === "new")?.synced, false);
});

test("GET that omits a synced local id without outbox drops it", () => {
  const syncedLocal = { ...created, synced: true };
  const merged = mergeRemoteSessions({
    remoteOk: true,
    remote: [older],
    local: [older, syncedLocal],
    mutations: [],
  });
  assert.deepEqual(
    merged.next.map((row) => row.id),
    ["old"],
  );
});

test("GET that omits a retainIds local keeps it", () => {
  const syncedLocal = { ...created, synced: true };
  const merged = mergeRemoteSessions({
    remoteOk: true,
    remote: [older],
    local: [older, syncedLocal],
    mutations: [],
    retainIds: [created.id],
  });
  const ids = merged.next.map((row) => row.id).sort();
  assert.deepEqual(ids, ["new", "old"]);
  assert.equal(merged.next.find((row) => row.id === "new")?.synced, false);
});

test("incomplete remote row does not replace a complete local row", () => {
  const incomplete = { id: created.id, title: "Created locally", synced: true };
  const merged = mergeRemoteSessions({
    remoteOk: true,
    remote: [older, incomplete],
    local: [older, created],
    mutations: [],
  });
  const kept = merged.next.find((row) => row.id === created.id);
  assert.equal(kept?.startISO, created.startISO);
  assert.equal(kept?.endISO, created.endISO);
});

test("stale GET times do not replace an in-flight local move", () => {
  const moved: MergeableSession = {
    ...older,
    startISO: "2026-05-01T14:00:00",
    endISO: "2026-05-01T15:00:00",
    synced: false,
  };
  const merged = mergeRemoteSessions({
    remoteOk: true,
    remote: [older],
    local: [moved],
    mutations: [{ id: older.id, op: "upsert", event: moved }],
  });
  const kept = merged.next.find((row) => row.id === older.id);
  assert.equal(kept?.startISO, moved.startISO);
  assert.equal(kept?.endISO, moved.endISO);
  assert.equal(kept?.synced, false);
  assert.deepEqual(merged.ackUpsertIds, []);
});

test("failed GET leaves replica rows unchanged", () => {
  const local = [older, created];
  const merged = mergeRemoteSessions({
    remoteOk: false,
    remote: [],
    local,
    mutations: [{ id: "new", op: "upsert", event: created }],
  });
  assert.deepEqual(
    merged.next.map((row) => row.id).sort(),
    ["new", "old"],
  );
  assert.deepEqual(merged.ackUpsertIds, []);
  assert.deepEqual(merged.ackDeleteIds, []);
});

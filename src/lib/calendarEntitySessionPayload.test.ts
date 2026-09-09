import assert from "node:assert/strict";
import { test } from "node:test";
import { entityCalendarSessionCorePayload, entityCalendarSessionRpcPayload } from "./calendarEntitySessionPayload.ts";

const ENTITY = "5171c598-d027-40bd-888a-e479437a283c";
const ID = "c0ffee00-15e5-4000-8000-000000000001";

test("RPC payload matches the E2E jsonb keys and stamps entity_id", () => {
  const payload = entityCalendarSessionRpcPayload(
    {
      id: ID,
      title: "E2E member overlay 20260901",
      starts_at: "2026-09-15T09:00:00+00:00",
      ends_at: "2026-09-15T10:00:00+00:00",
      all_day: false,
    },
    ENTITY,
  );
  assert.ok(payload);
  assert.equal(payload.id, ID);
  assert.equal(payload.entity_id, ENTITY);
  assert.equal(payload.title, "E2E member overlay 20260901");
  assert.equal(payload.starts_at, "2026-09-15T09:00:00+00:00");
  assert.equal(payload.ends_at, "2026-09-15T10:00:00+00:00");
  assert.equal(payload.all_day, false);
});

test("RPC payload prefers the live team id over a stale row entity_id", () => {
  const payload = entityCalendarSessionRpcPayload(
    {
      id: ID,
      entity_id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
      title: "Practice",
      starts_at: "2026-09-01T08:00:00Z",
      ends_at: "2026-09-01T09:00:00Z",
      sort_index: 1756752000000,
      app_group_id: null,
    },
    ENTITY,
  );
  assert.ok(payload);
  assert.equal(payload.entity_id, ENTITY);
  assert.equal(payload.sort_index, "1756752000000");
  assert.equal("app_group_id" in payload, false);
});

test("core payload is the E2E insert keys only", () => {
  const payload = entityCalendarSessionCorePayload(
    {
      id: ID,
      title: "Fungerer_1",
      starts_at: "2026-09-16T09:00:00+00:00",
      ends_at: "2026-09-16T10:00:00+00:00",
      all_day: false,
      color: "#22c55e",
      category_id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
      sort_index: 1756752000000,
    },
    ENTITY,
  );
  assert.ok(payload);
  assert.deepEqual(Object.keys(payload).sort(), [
    "all_day",
    "ends_at",
    "entity_id",
    "id",
    "starts_at",
    "title",
  ]);
});

test("RPC payload is null without a title or timestamps", () => {
  assert.equal(
    entityCalendarSessionRpcPayload(
      { id: ID, title: "  ", starts_at: "2026-09-01T08:00:00Z", ends_at: "2026-09-01T09:00:00Z" },
      ENTITY,
    ),
    null,
  );
});

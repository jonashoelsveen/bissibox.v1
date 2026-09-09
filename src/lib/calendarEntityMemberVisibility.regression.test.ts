import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");
const sqlPath = join(root, "supabase/tests/calendar_entity_member_visibility.sql");

test("regression SQL encodes admin create → member sees → stranger does not", () => {
  const sql = readFileSync(sqlPath, "utf8");
  assert.match(sql, /upsert_entity_calendar_session_for/);
  assert.match(sql, /list_visible_calendar_sessions_for/);
  assert.match(sql, /entity_id = team/);
  assert.match(sql, /non-member list_visible returned entity session/);
});

test("linked DB: entity session is visible to a member and hidden from a stranger", () => {
  const result = spawnSync(
    "supabase",
    ["db", "query", "--linked", "-f", sqlPath],
    {
      cwd: root,
      encoding: "utf8",
      timeout: 60_000,
    },
  );
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.doesNotMatch(result.stderr + result.stdout, /ERROR/);
});

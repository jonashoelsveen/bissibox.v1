import assert from "node:assert/strict";
import { test } from "node:test";
import { ensureServiceRoleKeyFromDevVars } from "./supabase-service-role.server.ts";

test("service role falls back to the production misspelling", () => {
  const previous = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const previousAlias = process.env.SUPABSE_SERVICE_ROLE_KEY;
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  process.env.SUPABSE_SERVICE_ROLE_KEY = "test-role-key";
  try {
    ensureServiceRoleKeyFromDevVars();
    assert.equal(process.env.SUPABASE_SERVICE_ROLE_KEY, "test-role-key");
  } finally {
    if (previous == null) delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    else process.env.SUPABASE_SERVICE_ROLE_KEY = previous;
    if (previousAlias == null) delete process.env.SUPABSE_SERVICE_ROLE_KEY;
    else process.env.SUPABSE_SERVICE_ROLE_KEY = previousAlias;
  }
});

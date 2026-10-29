import { readFileSync } from "node:fs";
import { resolve } from "node:path";

let loaded = false;

function unquote(value: string): string {
  const trimmed = value.trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"') && trimmed.length >= 2) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'") && trimmed.length >= 2)
  ) {
    return trimmed.slice(1, -1).trim();
  }
  return trimmed;
}

/** The production host stored the service role under this misspelled name. */
function adoptMisspelledServiceRoleKey() {
  if (process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()) return;
  const aliased = process.env.SUPABSE_SERVICE_ROLE_KEY;
  if (!aliased?.trim()) return;
  const value = unquote(aliased);
  if (value) process.env.SUPABASE_SERVICE_ROLE_KEY = value;
}

/** Wrangler keeps SUPABASE_SERVICE_ROLE_KEY in gitignored `.dev.vars`. Vite `npm run dev` only loads `.env`. */
export function ensureServiceRoleKeyFromDevVars() {
  adoptMisspelledServiceRoleKey();
  if (loaded) return;
  loaded = true;
  if (process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()) return;
  try {
    const raw = readFileSync(resolve(process.cwd(), ".dev.vars"), "utf8");
    for (const line of raw.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq < 0) continue;
      const key = trimmed.slice(0, eq).trim();
      if (key !== "SUPABASE_SERVICE_ROLE_KEY") continue;
      let value = trimmed.slice(eq + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      if (value) process.env.SUPABASE_SERVICE_ROLE_KEY = value;
      return;
    }
  } catch {
    /* local .dev.vars is optional */
  }
  adoptMisspelledServiceRoleKey();
}

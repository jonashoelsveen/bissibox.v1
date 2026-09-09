/**
 * One-off: set location_url on calendar_sessions that have location text
 * but no MazeMap link (older imports before location_url was persisted).
 *
 * Usage: npx tsx scripts/backfill-session-location-urls.mts
 */

import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { resolveMazemapUrl } from "../src/lib/mazemapNtnu.server.ts";

function loadEnvFile(path: string) {
  try {
    const text = readFileSync(path, "utf8");
    for (const line of text.split("\n")) {
      const t = line.trim();
      if (!t || t.startsWith("#")) continue;
      const i = t.indexOf("=");
      if (i < 0) continue;
      const key = t.slice(0, i).trim();
      let val = t.slice(i + 1).trim();
      if (
        (val.startsWith('"') && val.endsWith('"')) ||
        (val.startsWith("'") && val.endsWith("'"))
      ) {
        val = val.slice(1, -1);
      }
      if (!(key in process.env)) process.env[key] = val;
    }
  } catch {
    // optional
  }
}

loadEnvFile(resolve(process.cwd(), ".env"));
loadEnvFile(resolve(process.cwd(), ".env.local"));

const url =
  process.env.SUPABASE_URL ||
  process.env.VITE_SUPABASE_URL ||
  "";
const serviceKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SUPABASE_SECRET_KEY ||
  "";

if (!url || !serviceKey) {
  console.error(
    "Missing SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (or SUPABASE_SECRET_KEY).",
  );
  process.exit(1);
}

const supabase = createClient(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

async function main() {
  const { data, error } = await supabase
    .from("calendar_sessions")
    .select("id, location, location_url")
    .not("location", "is", null)
    .neq("location", "")
    .or("location_url.is.null,location_url.eq.");

  if (error) {
    console.error("Select failed:", error.message);
    process.exit(1);
  }

  const rows = (data ?? []).filter(
    (r) => (r.location ?? "").trim() && !(r.location_url ?? "").trim(),
  );
  console.log(`Found ${rows.length} sessions to backfill`);

  const uniqueLocations = [
    ...new Set(rows.map((r) => String(r.location).trim())),
  ];
  const urlByLocation = new Map<string, string>();
  for (const loc of uniqueLocations) {
    urlByLocation.set(loc, await resolveMazemapUrl(loc));
  }

  let updated = 0;
  let failed = 0;
  for (const row of rows) {
    const loc = String(row.location).trim();
    const locationUrl = urlByLocation.get(loc);
    if (!locationUrl) continue;
    const { error: upErr } = await supabase
      .from("calendar_sessions")
      .update({ location_url: locationUrl })
      .eq("id", row.id);
    if (upErr) {
      failed++;
      console.error(`Update failed ${row.id}:`, upErr.message);
    } else {
      updated++;
    }
  }

  console.log(`Done. updated=${updated} failed=${failed}`);
}

void main();

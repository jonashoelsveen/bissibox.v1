import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const SKIP_REL = /schema cache|does not exist|Could not find the table|Could not find the .* column/i;

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function delEq(admin: ReturnType<typeof createClient>, table: string, column: string, value: string) {
  const { error } = await admin.from(table).delete().eq(column, value);
  if (error && !SKIP_REL.test(error.message)) throw new Error(`${table}: ${error.message}`);
}

async function delOr(admin: ReturnType<typeof createClient>, table: string, filter: string) {
  const { error } = await admin.from(table).delete().or(filter);
  if (error && !SKIP_REL.test(error.message)) throw new Error(`${table}: ${error.message}`);
}

async function deleteFolderRecursive(
  admin: ReturnType<typeof createClient>,
  bucket: string,
  prefix: string,
) {
  const { data, error } = await admin.storage.from(bucket).list(prefix, { limit: 1000, offset: 0 });
  if (error || !data?.length) return;
  const files: string[] = [];
  for (const item of data) {
    const path = prefix ? `${prefix}/${item.name}` : item.name;
    if (!item.id) await deleteFolderRecursive(admin, bucket, path);
    else files.push(path);
  }
  if (files.length) {
    const { error: rmErr } = await admin.storage.from(bucket).remove(files);
    if (rmErr) throw new Error(`${bucket}: ${rmErr.message}`);
  }
}

async function purgeAccountData(admin: ReturnType<typeof createClient>, userId: string) {
  const { data: buckets } = await admin.storage.listBuckets();
  for (const bucket of buckets ?? []) {
    await deleteFolderRecursive(admin, bucket.name, userId);
  }

  await delEq(admin, "calendar_sessions", "user_id", userId);
  await delEq(admin, "calendar_sessions", "created_by_coach_id", userId);
  await delEq(admin, "calendar_subscriptions", "created_by", userId);
  await delEq(admin, "calendar_import_batches", "created_by", userId);
  await delEq(admin, "calendar_categories", "user_id", userId);
  await delEq(admin, "calendar_category_coach_access", "coach_user_id", userId);

  await delOr(admin, "diary_day_notes", `author_id.eq.${userId},member_id.eq.${userId}`);
  await delOr(admin, "diary_session_notes", `author_id.eq.${userId},member_id.eq.${userId}`);
  await delEq(admin, "diary_session_note_views", "viewer_id", userId);

  await delEq(admin, "note_cover_jobs", "user_id", userId);
  await delEq(admin, "notes", "user_id", userId);
  await delEq(admin, "note_folders", "user_id", userId);
  await delEq(admin, "files", "user_id", userId);
  await delEq(admin, "file_folders", "user_id", userId);
  await delEq(admin, "media_items", "user_id", userId);
  await delEq(admin, "media_albums", "user_id", userId);

  await delEq(admin, "activities", "user_id", userId);
  await delEq(admin, "personal_bests", "user_id", userId);
  await delEq(admin, "registrations", "user_id", userId);
  await delEq(admin, "event_likes", "user_id", userId);
  await delEq(admin, "event_media", "added_by", userId);
  await delEq(admin, "event_co_organizers", "user_id", userId);
  await delEq(admin, "events", "owner_id", userId);

  await delOr(admin, "user_follows", `follower_id.eq.${userId},target_user_id.eq.${userId}`);
  await delOr(
    admin,
    "user_active_followers",
    `follower_id.eq.${userId},member_id.eq.${userId},created_by.eq.${userId}`,
  );
  await delOr(admin, "user_coaches", `owner_id.eq.${userId},coach_user_id.eq.${userId}`);
  await delEq(admin, "user_roles", "user_id", userId);
  await delEq(admin, "user_plans", "user_id", userId);
  await delEq(admin, "verification_attempts", "user_id", userId);
  await delEq(admin, "account_change_log", "user_id", userId);

  await delEq(admin, "entity_members", "user_id", userId);
  await delEq(admin, "app_team_admins", "user_id", userId);
  await delEq(admin, "app_team_athletes", "user_id", userId);
  await delEq(admin, "app_team_coaches", "user_id", userId);
  await delEq(admin, "team_members", "user_id", userId);
  await delEq(admin, "team_memberships", "user_id", userId);
  await delEq(admin, "team_board_members", "user_id", userId);
  await delEq(admin, "team_group_members", "user_id", userId);
  await delEq(admin, "team_group_leaders", "user_id", userId);
  await delOr(admin, "team_followers", `user_id.eq.${userId},follower_id.eq.${userId}`);
  await delOr(admin, "team_follows", `user_id.eq.${userId},follower_id.eq.${userId}`);

  await delEq(admin, "app_teams", "owner_id", userId);
  await delEq(admin, "teams", "owner_id", userId);
  await delEq(admin, "profiles", "id", userId);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    const token = authHeader.replace(/^Bearer\s+/i, "").trim();
    if (!token) return json({ error: "Unauthorized" }, 401);

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: userRes, error: userErr } = await admin.auth.getUser(token);
    if (userErr || !userRes.user) return json({ error: "Unauthorized" }, 401);

    const userId = userRes.user.id;
    await purgeAccountData(admin, userId);
    const { error } = await admin.auth.admin.deleteUser(userId);
    if (error) throw error;

    return json({ ok: true });
  } catch (e) {
    console.error("delete-account error", e);
    return json({ error: "Your account could not be deleted." }, 500);
  }
});

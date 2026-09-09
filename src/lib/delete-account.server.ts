/**
 * Service-role purge of every row and storage object owned by a user,
 * then auth.users deletion. Call only after the request has been
 * authenticated as that same user.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

type Admin = SupabaseClient<Database>;

type FilterBuilder = {
  delete: () => {
    eq: (column: string, value: string) => Promise<{ error: { message: string } | null }>;
    or: (filter: string) => Promise<{ error: { message: string } | null }>;
  };
};

const SKIP_REL = /schema cache|does not exist|Could not find the table|Could not find the .* column/i;

function table(admin: Admin, name: string): FilterBuilder {
  return (admin as unknown as { from: (t: string) => FilterBuilder }).from(name);
}

async function delEq(admin: Admin, name: string, column: string, value: string) {
  const { error } = await table(admin, name).delete().eq(column, value);
  if (error && !SKIP_REL.test(error.message)) {
    throw new Error(`${name}: ${error.message}`);
  }
}

async function delOr(admin: Admin, name: string, filter: string) {
  const { error } = await table(admin, name).delete().or(filter);
  if (error && !SKIP_REL.test(error.message)) {
    throw new Error(`${name}: ${error.message}`);
  }
}

async function deleteFolderRecursive(
  admin: Admin,
  bucket: string,
  prefix: string,
): Promise<void> {
  const { data, error } = await admin.storage.from(bucket).list(prefix, {
    limit: 1000,
    offset: 0,
  });
  if (error || !data?.length) return;

  const files: string[] = [];
  for (const item of data) {
    const path = prefix ? `${prefix}/${item.name}` : item.name;
    if (!item.id) {
      await deleteFolderRecursive(admin, bucket, path);
    } else {
      files.push(path);
    }
  }
  if (files.length) {
    const { error: rmErr } = await admin.storage.from(bucket).remove(files);
    if (rmErr) throw new Error(`${bucket}: ${rmErr.message}`);
  }
}

async function purgeStorage(admin: Admin, userId: string) {
  const { data: buckets, error } = await admin.storage.listBuckets();
  if (error) throw new Error(error.message);
  for (const bucket of buckets ?? []) {
    await deleteFolderRecursive(admin, bucket.name, userId);
  }
}

/** Wipe application data for `userId`. Does not delete the auth user. */
export async function purgeAccountData(admin: Admin, userId: string) {
  await purgeStorage(admin, userId);

  await delEq(admin, "calendar_sessions", "user_id", userId);
  await delEq(admin, "calendar_sessions", "created_by_coach_id", userId);
  await delEq(admin, "calendar_accounts", "user_id", userId);
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

export async function deleteAuthenticatedUser(admin: Admin, userId: string) {
  await purgeAccountData(admin, userId);
  const { error } = await admin.auth.admin.deleteUser(userId);
  if (error) throw new Error(error.message);
}

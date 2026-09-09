import { z } from "zod";
import {
  createUserSupabaseClient,
  type AuthenticatedContext,
} from "@/lib/account-auth.server";
import { generateEntityCode } from "@/lib/entity-code";
import { persistOptionalText, persistProfileName, ENTITY_PROFILE_NAME_MAX } from "@/lib/profileName";
import { getSupabaseAdminOrNull } from "@/lib/supabase-admin.server";

const GROUP_SELECT = "id,name,description,website,entity_code" as const;

export type AccountEntityRow = {
  id: string;
  name: string;
  description: string | null;
  website: string | null;
  entity_code: string;
};

export const AccountEntityCreateBody = z.object({
  name: z.string().trim().min(1).max(ENTITY_PROFILE_NAME_MAX).optional(),
});

export const AccountEntityPatchBody = z
  .object({
    name: z.string().max(ENTITY_PROFILE_NAME_MAX).optional(),
    description: z.string().max(4000).nullable().optional(),
    website: z.string().max(500).nullable().optional(),
  })
  .strict()
  .refine((body) => Object.keys(body).length > 0, { message: "No fields to update" });

type DbClient = Awaited<ReturnType<typeof createUserSupabaseClient>>;

async function userClient(ctx: AuthenticatedContext) {
  return createUserSupabaseClient(ctx.accessToken, ctx.refreshToken || undefined);
}

function needsEntityCode(message: string) {
  return /entity_code/i.test(message) && /null|not-null|not null|check/i.test(message);
}

function isUniqueEntityCode(message: string, code?: string) {
  return code === "23505" || /entity_code/i.test(message);
}

async function insertOwnedTeam(
  client: DbClient,
  ownerId: string,
  name: string,
  withCode: boolean,
) {
  const body: {
    name: string;
    owner_id: string;
    entity_code?: string;
  } = { name, owner_id: ownerId };
  if (withCode) body.entity_code = generateEntityCode();
  return client.from("app_teams").insert(body).select(GROUP_SELECT).single();
}

async function insertOwnedTeamWithRetry(client: DbClient, ownerId: string, name: string) {
  let result = await insertOwnedTeam(client, ownerId, name, false);
  if (result.error && needsEntityCode(result.error.message)) {
    for (let attempt = 0; attempt < 3; attempt++) {
      result = await insertOwnedTeam(client, ownerId, name, true);
      if (!result.error) break;
      if (!isUniqueEntityCode(result.error.message, result.error.code)) break;
    }
  }
  return result;
}

async function insertOwnerAdmin(
  client: DbClient,
  teamId: string,
  userId: string,
  email: string | null,
) {
  const { error } = await client.from("app_team_admins").insert({
    team_id: teamId,
    email,
    user_id: userId,
    status: "active",
  });
  if (error) {
    console.error("[account/entities] owner admin insert failed:", error.message);
  }
}

export async function listAccountEntities(
  ctx: AuthenticatedContext,
): Promise<{ ok: true; groups: AccountEntityRow[] } | { ok: false; status: number; error: string }> {
  const client = await userClient(ctx);
  const admin = await getSupabaseAdminOrNull();
  const reader = admin ?? client;

  const owned = await reader
    .from("app_teams")
    .select(GROUP_SELECT)
    .eq("owner_id", ctx.user.id)
    .order("created_at", { ascending: true });
  if (owned.error) return { ok: false, status: 500, error: owned.error.message };

  const adminLinks = await reader
    .from("app_team_admins")
    .select("team_id")
    .eq("user_id", ctx.user.id)
    .eq("status", "active");
  if (adminLinks.error) return { ok: false, status: 500, error: adminLinks.error.message };

  const ownedIds = new Set((owned.data ?? []).map((row) => row.id));
  const extraIds = [
    ...new Set(
      (adminLinks.data ?? [])
        .map((row) => row.team_id)
        .filter((id): id is string => typeof id === "string" && id.length > 0 && !ownedIds.has(id)),
    ),
  ];

  let adminTeams: AccountEntityRow[] = [];
  if (extraIds.length > 0) {
    const extra = await reader.from("app_teams").select(GROUP_SELECT).in("id", extraIds);
    if (extra.error) return { ok: false, status: 500, error: extra.error.message };
    adminTeams = (extra.data ?? []) as AccountEntityRow[];
  }

  return {
    ok: true,
    groups: [...((owned.data ?? []) as AccountEntityRow[]), ...adminTeams],
  };
}

export async function createAccountEntity(
  ctx: AuthenticatedContext,
  name: string,
): Promise<
  { ok: true; group: AccountEntityRow } | { ok: false; status: number; error: string }
> {
  const trimmed = persistProfileName(name, ENTITY_PROFILE_NAME_MAX) || "New entity";
  const email = typeof ctx.user.email === "string" ? ctx.user.email.toLowerCase() : null;

  const admin = await getSupabaseAdminOrNull();
  const client = admin ?? (await userClient(ctx));
  const result = await insertOwnedTeamWithRetry(client, ctx.user.id, trimmed);
  if (result.error || !result.data) {
    console.error("[account/entities] insert failed:", result.error?.message ?? "no row");
    return { ok: false, status: 500, error: result.error?.message ?? "Insert returned no row" };
  }

  await insertOwnerAdmin(client, result.data.id, ctx.user.id, email);
  return { ok: true, group: result.data as AccountEntityRow };
}

export async function updateAccountEntity(
  ctx: AuthenticatedContext,
  id: string,
  patch: z.infer<typeof AccountEntityPatchBody>,
): Promise<
  { ok: true; group: AccountEntityRow } | { ok: false; status: number; error: string }
> {
  const update: {
    name?: string;
    description?: string | null;
    website?: string | null;
    updated_at: string;
  } = { updated_at: new Date().toISOString() };
  if (typeof patch.name === "string") {
    update.name = persistProfileName(patch.name, ENTITY_PROFILE_NAME_MAX) || "New entity";
  }
  if (patch.description !== undefined) {
    update.description =
      patch.description && patch.description.length > 0 ? patch.description : null;
  }
  if (patch.website !== undefined) {
    update.website = persistOptionalText(patch.website ?? "") ?? null;
  }

  const apply = async (client: DbClient) =>
    client
      .from("app_teams")
      .update(update)
      .eq("id", id)
      .eq("owner_id", ctx.user.id)
      .select(GROUP_SELECT)
      .maybeSingle();

  const userSb = await userClient(ctx);
  let result = await apply(userSb);
  if (result.error || !result.data) {
    const admin = await getSupabaseAdminOrNull();
    if (admin) result = await apply(admin);
  }
  if (result.error) return { ok: false, status: 500, error: result.error.message };
  if (!result.data) return { ok: false, status: 404, error: "Entity not found" };
  return { ok: true, group: result.data as AccountEntityRow };
}

export async function deleteAccountEntity(
  ctx: AuthenticatedContext,
  id: string,
): Promise<{ ok: true } | { ok: false; status: number; error: string }> {
  const apply = async (client: DbClient) =>
    client.from("app_teams").delete().eq("id", id).eq("owner_id", ctx.user.id);

  const userSb = await userClient(ctx);
  let result = await apply(userSb);
  if (result.error) {
    const admin = await getSupabaseAdminOrNull();
    if (admin) result = await apply(admin);
  }
  if (result.error) return { ok: false, status: 500, error: result.error.message };
  return { ok: true };
}

import { z } from "zod";
import {
  createUserSupabaseClient,
  requestClientMeta,
  type AuthenticatedContext,
} from "@/lib/account-auth.server";
import {
  sendAccountPasswordChangeOtp,
  verifyAccountPasswordChangeOtp,
} from "@/lib/account-password-otp.server";
import { birthDateFromMetadata, normalizeBirthDate } from "@/lib/birth-date";
import { NEW_PASSWORD_MATCHES_CURRENT } from "@/lib/account-password-messages";
import { getSupabaseAdminOrNull } from "@/lib/supabase-admin.server";
import { supabaseServerAuth } from "@/lib/supabase-server-auth";

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((value) => {
    const [y, m, d] = value.split("-").map(Number);
    const dt = new Date(Date.UTC(y, m - 1, d));
    return (
      dt.getUTCFullYear() === y &&
      dt.getUTCMonth() === m - 1 &&
      dt.getUTCDate() === d
    );
  }, "Invalid date")
  .refine((value) => {
    const year = Number(value.slice(0, 4));
    const now = new Date().getUTCFullYear();
    return year >= 1900 && year <= now;
  }, "Date out of range");

const nullableText = (max: number) =>
  z
    .union([z.string().max(max), z.null()])
    .optional()
    .transform((v) => {
      if (v === undefined) return undefined;
      if (v === null) return null;
      const trimmed = v.trim();
      return trimmed.length ? trimmed : null;
    });

export const AccountProfilePatchBody = z
  .object({
    first_name: nullableText(120),
    last_name: nullableText(120),
    birth_date: z.union([isoDate, z.null()]).optional(),
    mobile: nullableText(40),
    expected_updated_at: z.string().optional(),
  })
  .strict()
  .refine((body) => Object.keys(body).some((k) => k !== "expected_updated_at"), {
    message: "No fields to update",
  });

export const AccountPasswordBody = z
  .object({
    current_password: z.string().min(1).max(200),
    new_password: z.string().min(8).max(200),
    code: z.string().regex(/^\d{6}$/).optional(),
    attempt_id: z.string().uuid().optional(),
  })
  .strict()
  .refine((b) => b.current_password !== b.new_password, {
    message: NEW_PASSWORD_MATCHES_CURRENT,
    path: ["new_password"],
  })
  .refine((b) => Boolean(b.code) === Boolean(b.attempt_id), {
    message: "Verification code is incomplete",
  });

export type AccountProfileResponse = {
  first_name: string | null;
  last_name: string | null;
  birth_date: string | null;
  email: string | null;
  mobile: string | null;
  updated_at: string;
};

const PROFILE_SELECT =
  "first_name, last_name, birth_date, email, mobile, updated_at" as const;

type ProfileRow = {
  first_name: string | null;
  last_name: string | null;
  birth_date: unknown;
  email: string | null;
  mobile: string | null;
  updated_at: string;
};

async function userClient(ctx: AuthenticatedContext) {
  return createUserSupabaseClient(ctx.accessToken, ctx.refreshToken || undefined);
}

function profileFromRow(data: ProfileRow, ctx: AuthenticatedContext): AccountProfileResponse {
  const meta = (ctx.user.user_metadata ?? {}) as Record<string, unknown>;
  return {
    first_name: data.first_name,
    last_name: data.last_name,
    birth_date: normalizeBirthDate(data.birth_date) ?? birthDateFromMetadata(meta),
    email: data.email ?? ctx.user.email ?? null,
    mobile: data.mobile,
    updated_at: data.updated_at,
  };
}

function profileFromAuthContext(ctx: AuthenticatedContext): AccountProfileResponse {
  const meta = (ctx.user.user_metadata ?? {}) as Record<string, unknown>;
  return {
    first_name: typeof meta.first_name === "string" ? meta.first_name : null,
    last_name: typeof meta.last_name === "string" ? meta.last_name : null,
    birth_date: birthDateFromMetadata(meta),
    email: ctx.user.email ?? null,
    mobile: null,
    updated_at: "",
  };
}

function profileBaseline(ctx: AuthenticatedContext) {
  const meta = (ctx.user.user_metadata ?? {}) as Record<string, unknown>;
  return {
    id: ctx.user.id,
    email: ctx.user.email ?? null,
    first_name: typeof meta.first_name === "string" ? meta.first_name : null,
    last_name: typeof meta.last_name === "string" ? meta.last_name : null,
    birth_date: birthDateFromMetadata(meta),
  };
}

async function birthDateFromAdminUser(ctx: AuthenticatedContext): Promise<string | null> {
  const admin = await getSupabaseAdminOrNull();
  if (!admin) return null;
  const { data, error } = await admin.auth.admin.getUserById(ctx.user.id);
  if (error || !data.user) return null;
  return birthDateFromMetadata(
    (data.user.user_metadata ?? {}) as Record<string, unknown>,
  );
}

async function persistBirthDateHeal(ctx: AuthenticatedContext, birthDate: string) {
  const admin = await getSupabaseAdminOrNull();
  if (admin) {
    const { error } = await admin
      .from("profiles")
      .update({ birth_date: birthDate })
      .eq("id", ctx.user.id);
    if (error) {
      console.error("[account/profile] birth_date heal (admin) failed:", error.message);
    }
    return;
  }

  const client = await userClient(ctx);
  const { error } = await client
    .from("profiles")
    .update({ birth_date: birthDate })
    .eq("id", ctx.user.id);
  if (error) {
    console.error("[account/profile] birth_date heal failed:", error.message);
  }
}

async function withHealedBirthDate(
  ctx: AuthenticatedContext,
  profile: AccountProfileResponse,
): Promise<AccountProfileResponse> {
  if (normalizeBirthDate(profile.birth_date)) return profile;

  const fromAuth =
    birthDateFromMetadata((ctx.user.user_metadata ?? {}) as Record<string, unknown>) ??
    (await birthDateFromAdminUser(ctx));
  if (!fromAuth) return profile;

  await persistBirthDateHeal(ctx, fromAuth);
  return { ...profile, birth_date: fromAuth };
}

export async function loadAccountProfile(
  ctx: AuthenticatedContext,
): Promise<AccountProfileResponse | null> {
  const client = await userClient(ctx);
  const { data, error } = await client
    .from("profiles")
    .select(PROFILE_SELECT)
    .eq("id", ctx.user.id)
    .maybeSingle();

  if (error) {
    console.error("[account/profile] load failed:", error.message);
  }
  if (data) return profileFromRow(data, ctx);

  const admin = await getSupabaseAdminOrNull();
  if (admin) {
    const { data: adminRow, error: adminError } = await admin
      .from("profiles")
      .select(PROFILE_SELECT)
      .eq("id", ctx.user.id)
      .maybeSingle();

    if (adminError) {
      console.error("[account/profile] admin load failed:", adminError.message);
    }
    if (adminRow) return profileFromRow(adminRow, ctx);
  }

  return null;
}

async function ensureProfileRowViaRpc(ctx: AuthenticatedContext): Promise<boolean> {
  const client = await userClient(ctx);
  const { error } = await client.rpc("ensure_own_profile_row");
  if (!error) return true;
  console.error("[account/profile] ensure rpc failed:", error.message);
  return false;
}

async function ensureProfileRowInDb(ctx: AuthenticatedContext): Promise<boolean> {
  if (await ensureProfileRowViaRpc(ctx)) return true;

  const client = await userClient(ctx);
  const { data: existing } = await client
    .from("profiles")
    .select("id")
    .eq("id", ctx.user.id)
    .maybeSingle();

  if (existing) return true;

  const baseline = profileBaseline(ctx);
  const { error: insertError } = await client.from("profiles").insert(baseline);
  if (!insertError) return true;
  if (insertError.code === "23505") return true;

  const admin = await getSupabaseAdminOrNull();
  if (!admin) {
    console.error("[account/profile] insert failed:", insertError.message);
    return false;
  }

  const { error: upsertError } = await admin
    .from("profiles")
    .upsert(baseline, { onConflict: "id" });

  if (upsertError) {
    console.error("[account/profile] admin ensure row failed:", upsertError.message);
    return false;
  }
  return true;
}

/** Create a profiles row when auth exists but handle_new_user did not run. */
export async function ensureAccountProfile(
  ctx: AuthenticatedContext,
): Promise<AccountProfileResponse> {
  await ensureProfileRowInDb(ctx);
  const loaded = await loadAccountProfile(ctx);
  return withHealedBirthDate(ctx, loaded ?? profileFromAuthContext(ctx));
}

async function syncAuthUserMetadata(
  ctx: AuthenticatedContext,
  profile: AccountProfileResponse,
) {
  const admin = await getSupabaseAdminOrNull();
  if (!admin) return;
  const { error } = await admin.auth.admin.updateUserById(ctx.user.id, {
    user_metadata: {
      first_name: profile.first_name ?? "",
      last_name: profile.last_name ?? "",
      birth_date: profile.birth_date ?? null,
    },
  });
  if (error) {
    console.error("[account/profile] auth metadata sync failed:", error.message);
  }
}

async function writeAccountChangeLog(args: {
  userId: string;
  changeType: "profile_update" | "password_change";
  fieldNames: string[];
  request: Request;
}) {
  const admin = await getSupabaseAdminOrNull();
  if (!admin) return;

  try {
    const { ip, userAgent } = requestClientMeta(args.request);
    await admin.from("account_change_log").insert({
      user_id: args.userId,
      change_type: args.changeType,
      field_names: args.fieldNames,
      ip_address: ip,
      user_agent: userAgent,
    });
  } catch (e) {
    console.error("[account/profile] audit log failed:", e);
  }
}

function profilePatchApplied(
  profile: AccountProfileResponse,
  patch: Record<string, string | null>,
): boolean {
  for (const [key, value] of Object.entries(patch)) {
    let current = profile[key as keyof AccountProfileResponse];
    if (key === "birth_date") {
      current = normalizeBirthDate(current as string | null);
    }
    if (current !== value) return false;
  }
  return true;
}

async function patchViaRpc(
  ctx: AuthenticatedContext,
  body: z.infer<typeof AccountProfilePatchBody>,
): Promise<
  | { ok: true; profile: AccountProfileResponse }
  | { ok: false; error: string }
> {
  const client = await userClient(ctx);
  const { data, error } = await client.rpc("patch_own_account_profile", {
    p_first_name: body.first_name ?? null,
    p_last_name: body.last_name ?? null,
    p_birth_date: body.birth_date ?? null,
    p_mobile: body.mobile ?? null,
    p_patch_first_name: body.first_name !== undefined,
    p_patch_last_name: body.last_name !== undefined,
    p_patch_birth_date: body.birth_date !== undefined,
    p_patch_mobile: body.mobile !== undefined,
  });

  if (error) {
    console.error("[account/profile] patch rpc failed:", error.message);
    return { ok: false, error: error.message };
  }

  const row = (Array.isArray(data) ? data[0] : data) as ProfileRow | undefined;
  if (!row) {
    return { ok: false, error: "Profile row missing after save" };
  }

  return { ok: true, profile: profileFromRow(row, ctx) };
}

async function patchViaDirectUpdate(
  ctx: AuthenticatedContext,
  patch: Record<string, string | null>,
): Promise<AccountProfileResponse | null> {
  const client = await userClient(ctx);
  const { error: userUpdateError } = await client
    .from("profiles")
    .update(patch)
    .eq("id", ctx.user.id);

  if (userUpdateError) {
    console.error("[account/profile] user update failed:", userUpdateError.message);
  }

  let saved = await loadAccountProfile(ctx);
  if (saved && profilePatchApplied(saved, patch)) return saved;

  const admin = await getSupabaseAdminOrNull();
  if (admin) {
    const { error: adminUpsertError } = await admin
      .from("profiles")
      .upsert({ ...profileBaseline(ctx), ...patch }, { onConflict: "id" });

    if (adminUpsertError) {
      console.error("[account/profile] admin upsert failed:", adminUpsertError.message);
    } else {
      saved = await loadAccountProfile(ctx);
      if (saved && profilePatchApplied(saved, patch)) return saved;
    }
  }

  return null;
}

export async function patchAccountProfile(
  ctx: AuthenticatedContext,
  request: Request,
  body: z.infer<typeof AccountProfilePatchBody>,
): Promise<
  | { ok: true; profile: AccountProfileResponse }
  | { ok: false; status: number; error: string }
> {
  const client = await userClient(ctx);

  if (body.expected_updated_at) {
    const { data: current } = await client
      .from("profiles")
      .select("updated_at")
      .eq("id", ctx.user.id)
      .maybeSingle();
    if (current?.updated_at && current.updated_at !== body.expected_updated_at) {
      return {
        ok: false,
        status: 409,
        error: "Profile was updated elsewhere. Refresh and try again.",
      };
    }
  }

  const patch: Record<string, string | null> = {};
  const changedFields: string[] = [];

  if (body.first_name !== undefined) {
    patch.first_name = body.first_name;
    changedFields.push("first_name");
  }
  if (body.last_name !== undefined) {
    patch.last_name = body.last_name;
    changedFields.push("last_name");
  }
  if (body.birth_date !== undefined) {
    patch.birth_date = body.birth_date;
    changedFields.push("birth_date");
  }
  if (body.mobile !== undefined) {
    patch.mobile = body.mobile;
    changedFields.push("mobile");
  }

  const rpcResult = await patchViaRpc(ctx, body);
  if (rpcResult.ok) {
    await writeAccountChangeLog({
      userId: ctx.user.id,
      changeType: "profile_update",
      fieldNames: changedFields,
      request,
    });
    await syncAuthUserMetadata(ctx, rpcResult.profile);
    return { ok: true, profile: rpcResult.profile };
  }

  const rowReady = await ensureProfileRowInDb(ctx);
  if (!rowReady) {
    return {
      ok: false,
      status: 400,
      error: rpcResult.error || "Could not prepare your profile for saving.",
    };
  }

  const saved = await patchViaDirectUpdate(ctx, patch);
  if (!saved) {
    return {
      ok: false,
      status: 400,
      error: rpcResult.error || "Could not update profile",
    };
  }

  await writeAccountChangeLog({
    userId: ctx.user.id,
    changeType: "profile_update",
    fieldNames: changedFields,
    request,
  });

  await syncAuthUserMetadata(ctx, saved);
  return { ok: true, profile: saved };
}

export async function changeAccountPassword(
  ctx: AuthenticatedContext,
  request: Request,
  body: z.infer<typeof AccountPasswordBody>,
): Promise<
  | { ok: true; pending?: undefined }
  | { ok: true; pending: true; masked: string; attempt_id: string }
  | { ok: false; status: number; error: string; code?: string; remaining?: number }
> {
  const email = ctx.user.email;
  if (!email) {
    return { ok: false, status: 400, error: "Account email is missing" };
  }

  const { error: verifyError } = await supabaseServerAuth.auth.signInWithPassword({
    email,
    password: body.current_password,
  });

  if (verifyError) {
    return { ok: false, status: 401, error: "Current password is incorrect" };
  }

  if (!body.code || !body.attempt_id) {
    const sent = await sendAccountPasswordChangeOtp(ctx);
    if (!sent.ok) return sent;
    return {
      ok: true,
      pending: true,
      masked: sent.masked,
      attempt_id: sent.attempt_id,
    };
  }

  const otp = await verifyAccountPasswordChangeOtp(ctx, body.attempt_id, body.code);
  if (!otp.ok) return otp;

  const userClientInstance = await userClient(ctx);
  const { error: updateError } = await userClientInstance.auth.updateUser({
    password: body.new_password,
  });

  if (updateError) {
    return {
      ok: false,
      status: 400,
      error: updateError.message ?? "Could not update password",
    };
  }

  await writeAccountChangeLog({
    userId: ctx.user.id,
    changeType: "password_change",
    fieldNames: ["password"],
    request,
  });

  return { ok: true };
}

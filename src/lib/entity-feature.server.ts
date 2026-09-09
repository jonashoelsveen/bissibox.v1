import type { FeatureFlag } from "@/lib/features";
import { isFeatureEnabled, isFeatureEnabledForUser } from "@/lib/features";
import {
  createUserSupabaseClient,
  type AuthenticatedContext,
} from "@/lib/account-auth.server";

export async function loadIsBetaTester(ctx: AuthenticatedContext): Promise<boolean> {
  try {
    const client = await createUserSupabaseClient(ctx.accessToken, ctx.refreshToken);
    const { data } = await client
      .from("profiles")
      .select("is_beta_tester")
      .eq("id", ctx.user.id)
      .maybeSingle();
    return data?.is_beta_tester === true;
  } catch {
    return false;
  }
}

export async function entityFeatureAllowedForActor(
  flag: FeatureFlag,
  ctx: AuthenticatedContext,
): Promise<boolean> {
  if (isFeatureEnabled(flag)) return true;
  const isBetaTester = await loadIsBetaTester(ctx);
  return isFeatureEnabledForUser(flag, { isBetaTester });
}

export async function anyEntityFeatureAllowedForActor(
  flags: FeatureFlag[],
  ctx: AuthenticatedContext,
): Promise<boolean> {
  if (flags.some((flag) => isFeatureEnabled(flag))) return true;
  const isBetaTester = await loadIsBetaTester(ctx);
  return flags.some((flag) => isFeatureEnabledForUser(flag, { isBetaTester }));
}

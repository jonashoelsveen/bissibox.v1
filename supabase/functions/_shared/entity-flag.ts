import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

/**
 * Must match FEATURES.entityFlag in src/lib/features.ts.
 * Flip to true in the same launch commit as entityFlag: true.
 */
export const ENTITY_FLAG_LAUNCHED = false;

export async function entityInviteCallerAllowed(
  req: Request,
  admin: ReturnType<typeof createClient>,
): Promise<boolean> {
  if (ENTITY_FLAG_LAUNCHED) return true;
  const authHeader = req.headers.get("Authorization") ?? "";
  if (!authHeader) return false;
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: userData } = await userClient.auth.getUser();
  if (!userData.user) return false;
  const { data: profile } = await admin
    .from("profiles")
    .select("is_beta_tester")
    .eq("id", userData.user.id)
    .maybeSingle();
  return (profile as { is_beta_tester?: boolean } | null)?.is_beta_tester === true;
}

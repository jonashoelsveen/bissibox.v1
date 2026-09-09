import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { ensureServiceRoleKeyFromDevVars } from "@/lib/supabase-service-role.server";

type AdminClient = SupabaseClient<Database>;

/** Service-role client when configured; null in local dev without SUPABASE_SERVICE_ROLE_KEY. */
export async function getSupabaseAdminOrNull(): Promise<AdminClient | null> {
  ensureServiceRoleKeyFromDevVars();
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()) {
    return null;
  }
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    return supabaseAdmin;
  } catch (e) {
    console.error("[account] admin client unavailable:", e);
    return null;
  }
}

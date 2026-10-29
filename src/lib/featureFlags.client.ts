import { supabase } from "@/integrations/supabase/client";
import { setFeatureFlagSnapshot } from "@/lib/features";

let loadGeneration = 0;

/** Drops an in-flight load and clears the client snapshot. */
export function clearFeatureFlagSnapshot(): void {
  loadGeneration += 1;
  setFeatureFlagSnapshot(null, null);
}

/** Loads accepted flag keys for this user. A failed lookup stays off. */
export async function loadAcceptedFeatureFlags(userId: string): Promise<void> {
  const ticket = ++loadGeneration;
  const { data, error } = await supabase
    .from("feature_flag_users")
    .select("flag_key")
    .eq("user_id", userId)
    .not("accepted_at", "is", null);
  if (ticket !== loadGeneration) return;
  if (error) {
    setFeatureFlagSnapshot(userId, null);
    return;
  }
  setFeatureFlagSnapshot(
    userId,
    new Set((data ?? []).map((row) => row.flag_key)),
  );
}

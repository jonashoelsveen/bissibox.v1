import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

function createServerAuthClient() {
  const url = process.env.SUPABASE_URL;
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_PUBLISHABLE_KEY;

  if (!url || !key) {
    const missing = [
      ...(!url ? ["SUPABASE_URL"] : []),
      ...(!key ? ["SUPABASE_SERVICE_ROLE_KEY or SUPABASE_PUBLISHABLE_KEY"] : []),
    ];
    throw new Error(
      `Missing Supabase environment variable(s): ${missing.join(", ")}. Add them to .env at the repo root.`,
    );
  }

  return createClient<Database>(url, key, {
    auth: {
      storage: undefined,
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

let _supabaseServerAuth: ReturnType<typeof createServerAuthClient> | undefined;

/** Server client for sign-in and session refresh (works with publishable key locally). */
export const supabaseServerAuth = new Proxy({} as ReturnType<typeof createServerAuthClient>, {
  get(_, prop, receiver) {
    if (!_supabaseServerAuth) _supabaseServerAuth = createServerAuthClient();
    return Reflect.get(_supabaseServerAuth, prop, receiver);
  },
});

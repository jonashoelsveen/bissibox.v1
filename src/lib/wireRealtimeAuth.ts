import type { SupabaseClient } from "@supabase/supabase-js";

/** Keep the Realtime websocket JWT in sync with the Supabase auth session. */
export function wireRealtimeAuth(client: SupabaseClient) {
  const sync = (token?: string | null) => {
    void client.realtime.setAuth(token ?? null);
  };

  void client.auth.getSession().then(({ data }) => {
    sync(data.session?.access_token);
  });

  client.auth.onAuthStateChange((_event, session) => {
    sync(session?.access_token);
  });
}

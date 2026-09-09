import type { RealtimeChannel, SupabaseClient } from "@supabase/supabase-js";

export const CATEGORY_SYNC_EVENT = "categories-changed";

function channelName(userId: string, teamId: string | null) {
  return `calendar-categories-sync:${teamId ?? `user:${userId}`}`;
}

type SyncEntry = {
  channel: RealtimeChannel;
  ready: Promise<void>;
  listeners: Set<() => void>;
};

const pools = new WeakMap<SupabaseClient, Map<string, SyncEntry>>();

async function ensureRealtimeAuth(client: SupabaseClient): Promise<boolean> {
  const { data } = await client.auth.getSession();
  if (data.session?.access_token) {
    await client.realtime.setAuth(data.session.access_token);
    return true;
  }

  if (typeof window !== "undefined") {
    try {
      const res = await fetch("/api/auth/session", {
        method: "GET",
        credentials: "include",
        headers: { Accept: "application/json" },
      });
      if (res.ok) {
        const body = (await res.json()) as {
          access_token?: string;
          refresh_token?: string;
        };
        if (body.access_token && body.refresh_token) {
          await client.auth.setSession({
            access_token: body.access_token,
            refresh_token: body.refresh_token,
          });
          await client.realtime.setAuth(body.access_token);
          return true;
        }
      }
    } catch {
      /* ignore */
    }
  }

  return false;
}

async function getOrCreateEntry(
  client: SupabaseClient,
  key: string,
): Promise<SyncEntry> {
  let pool = pools.get(client);
  if (!pool) {
    pool = new Map();
    pools.set(client, pool);
  }

  let entry = pool.get(key);
  if (!entry) {
    const listeners = new Set<() => void>();
    const channel = client.channel(key, {
      config: { broadcast: { self: false } },
    });

    channel.on("broadcast", { event: CATEGORY_SYNC_EVENT }, () => {
      for (const listener of listeners) listener();
    });

    const ready = new Promise<void>((resolve, reject) => {
      channel.subscribe((status) => {
        if (status === "SUBSCRIBED") resolve();
        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          reject(new Error(`Realtime subscribe failed: ${status}`));
        }
      });
    });

    entry = { channel, ready, listeners };
    pool.set(key, entry);
  }

  await ensureRealtimeAuth(client);
  await entry.ready;
  return entry;
}

export function subscribeCategorySync(
  client: SupabaseClient,
  userId: string,
  teamId: string | null,
  onChanged: () => void,
): () => void {
  const key = channelName(userId, teamId);
  let active = true;

  void getOrCreateEntry(client, key)
    .then((entry) => {
      if (!active) return;
      entry.listeners.add(onChanged);
    })
    .catch((error) => {
      console.warn("[categorySync] subscribe failed:", error);
    });

  return () => {
    active = false;
    const pool = pools.get(client);
    const entry = pool?.get(key);
    if (entry) {
      entry.listeners.delete(onChanged);
      if (entry.listeners.size === 0) {
        void client.removeChannel(entry.channel);
        pool?.delete(key);
      }
    }
  };
}

export async function notifyCategoryChanged(
  client: SupabaseClient,
  userId: string,
  teamId: string | null,
): Promise<void> {
  const key = channelName(userId, teamId);
  try {
    const entry = await getOrCreateEntry(client, key);
    const status = await entry.channel.send({
      type: "broadcast",
      event: CATEGORY_SYNC_EVENT,
      payload: { at: Date.now() },
    });
    if (status !== "ok") {
      console.warn("[categorySync] broadcast send status:", status);
    }
  } catch (error) {
    console.warn("[categorySync] notify failed:", error);
  }
}

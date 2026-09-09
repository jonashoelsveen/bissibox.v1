import type { RealtimeChannel, SupabaseClient } from "@supabase/supabase-js";

export const ENTITY_ROSTER_SYNC_EVENT = "roster-changed";

function syncChannelName(teamId: string) {
  return `entity-roster-sync:${teamId}`;
}

type SyncEntry = {
  channel: RealtimeChannel;
  ready: Promise<void>;
  listeners: Set<() => void>;
};

const pools = new WeakMap<SupabaseClient, Map<string, SyncEntry>>();

/** Ensure the Realtime socket has a fresh JWT (cookie auth on web needs /api/auth/session). */
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
  teamId: string,
): Promise<SyncEntry> {
  let pool = pools.get(client);
  if (!pool) {
    pool = new Map();
    pools.set(client, pool);
  }

  let entry = pool.get(teamId);
  if (!entry) {
    const listeners = new Set<() => void>();
    const channel = client.channel(syncChannelName(teamId), {
      config: { broadcast: { self: false } },
    });

    channel.on("broadcast", { event: ENTITY_ROSTER_SYNC_EVENT }, () => {
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
    pool.set(teamId, entry);
  }

  await ensureRealtimeAuth(client);
  await entry.ready;
  return entry;
}

/** Subscribe to cross-client roster refresh signals (web ↔ mobile). */
export function subscribeEntityRosterSync(
  client: SupabaseClient,
  teamId: string,
  onChanged: () => void,
): () => void {
  let active = true;

  void getOrCreateEntry(client, teamId)
    .then((entry) => {
      if (!active) return;
      entry.listeners.add(onChanged);
    })
    .catch((error) => {
      console.warn("[entityRosterSync] subscribe failed:", error);
    });

  return () => {
    active = false;
    const pool = pools.get(client);
    const entry = pool?.get(teamId);
    if (entry) {
      entry.listeners.delete(onChanged);
      if (entry.listeners.size === 0) {
        void client.removeChannel(entry.channel);
        pool?.delete(teamId);
      }
    }
  };
}

/** Tell other clients to refresh roster data after a local save. */
export async function notifyEntityRosterChanged(
  client: SupabaseClient,
  teamId: string,
): Promise<void> {
  try {
    const entry = await getOrCreateEntry(client, teamId);
    const status = await entry.channel.send({
      type: "broadcast",
      event: ENTITY_ROSTER_SYNC_EVENT,
      payload: { at: Date.now() },
    });
    if (status !== "ok") {
      console.warn("[entityRosterSync] broadcast send status:", status);
    }
  } catch (error) {
    console.warn("[entityRosterSync] notify failed:", error);
  }
}

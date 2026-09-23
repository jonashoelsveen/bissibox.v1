/**
 * Pure merge of a server GET with the local replica and mutation outbox.
 * Incomplete GET payloads must not erase unsynced or in-flight local writes
 * or resurrect locally deleted sessions. A write is only treated as synced
 * once a GET has contained its id.
 */

export type MergeableSession = {
  id: string;
  synced?: boolean;
  title?: string;
  startISO?: string;
  endISO?: string;
} & Record<string, unknown>;

export type MergeMutation = {
  id: string;
  op: "upsert" | "delete";
  event?: MergeableSession;
};

export type MergeRemoteResult<T extends MergeableSession = MergeableSession> = {
  next: T[];
  ackUpsertIds: string[];
  ackDeleteIds: string[];
};

function hasRenderableSession(row: MergeableSession | undefined): row is MergeableSession {
  if (!row || typeof row.id !== "string") return false;
  const title = typeof row.title === "string" ? row.title.trim() : "";
  const startISO = typeof row.startISO === "string" ? row.startISO : "";
  const endISO = typeof row.endISO === "string" ? row.endISO : "";
  return title.length > 0 && startISO.length > 0 && endISO.length > 0;
}

function sessionTimeKey(row: MergeableSession): string {
  return `${row.startISO ?? ""}|${row.endISO ?? ""}|${row.allDay === true ? "1" : "0"}`;
}

export function mergeRemoteSessions<T extends MergeableSession>(opts: {
  remoteOk: boolean;
  remote: T[];
  local: T[];
  mutations: MergeMutation[];
  /** Local ids that must survive a GET that omitted them (in-flight or just-acked writes). */
  retainIds?: Iterable<string>;
}): MergeRemoteResult<T> {
  const { remoteOk, remote, local, mutations } = opts;
  const retainIds = new Set(opts.retainIds ?? []);

  if (!remoteOk) {
    const deleteIds = new Set(mutations.filter((m) => m.op === "delete").map((m) => m.id));
    const byId = new Map<string, T>();
    for (const row of local) {
      if (!deleteIds.has(row.id)) byId.set(row.id, row);
    }
    for (const mutation of mutations) {
      if (mutation.op !== "upsert" || deleteIds.has(mutation.id) || byId.has(mutation.id)) continue;
      if (!hasRenderableSession(mutation.event)) continue;
      byId.set(mutation.id, { ...(mutation.event as T), synced: false });
    }
    return {
      next: [...byId.values()],
      ackUpsertIds: [],
      ackDeleteIds: [],
    };
  }

  const deleteIds = new Set(mutations.filter((m) => m.op === "delete").map((m) => m.id));
  const upsertById = new Map(
    mutations.filter((m) => m.op === "upsert").map((m) => [m.id, m] as const),
  );
  const localById = new Map(local.map((row) => [row.id, row] as const));
  const remoteIds = new Set(remote.map((row) => row.id));
  const byId = new Map<string, T>();

  for (const row of remote) {
    if (deleteIds.has(row.id)) continue;
    if (!hasRenderableSession(row)) continue;
    const mutationEvent = upsertById.get(row.id)?.event;
    const localRow = localById.get(row.id);
    const pending =
      (hasRenderableSession(mutationEvent) ? mutationEvent : null) ??
      (localRow &&
      hasRenderableSession(localRow) &&
      (localRow.synced !== true || retainIds.has(row.id))
        ? localRow
        : null);
    // A GET that still has the previous wall-clock (common for a second or
    // two after drag/time-edit) must not replace the in-flight local write.
    if (pending && sessionTimeKey(pending) !== sessionTimeKey(row)) {
      byId.set(row.id, { ...(pending as T), synced: false });
      continue;
    }
    byId.set(row.id, { ...row, synced: true });
  }

  const unsyncedLocal = local.filter(
    (row) =>
      !deleteIds.has(row.id) &&
      !byId.has(row.id) &&
      hasRenderableSession(row) &&
      (row.synced !== true || upsertById.has(row.id) || retainIds.has(row.id)),
  );
  for (const row of unsyncedLocal) {
    byId.set(row.id, { ...row, synced: false });
  }

  for (const mutation of upsertById.values()) {
    if (deleteIds.has(mutation.id) || byId.has(mutation.id)) continue;
    const event = mutation.event;
    if (!hasRenderableSession(event)) continue;
    byId.set(mutation.id, { ...(event as T), synced: false });
  }

  const ackUpsertIds = mutations
    .filter((m) => m.op === "upsert" && byId.get(m.id)?.synced === true && !deleteIds.has(m.id))
    .map((m) => m.id);
  const ackDeleteIds = mutations
    .filter((m) => m.op === "delete" && !remoteIds.has(m.id))
    .map((m) => m.id);

  return { next: [...byId.values()], ackUpsertIds, ackDeleteIds };
}

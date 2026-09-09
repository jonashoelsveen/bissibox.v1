/**
 * IndexedDB replica + mutation outbox for calendar sessions.
 *
 * Postgres remains ground truth. This store is the crash-safe client copy so
 * a Vite restart or tab close cannot drop tiles that have not been GET-acked.
 * Mutations also land in a synchronous localStorage WAL because IndexedDB
 * puts are async and upsertEvent must not wait on the network.
 */

import Dexie, { type Table } from "dexie";
import type { MergeableSession, MergeMutation } from "@/lib/calendarSessionMerge";

export type ReplicaEvent = MergeableSession;

export type CalendarSessionRow = Record<string, unknown> & { id: string };

export type ReplicaSession = {
  id: string;
  calId: string;
  synced: boolean;
  updatedAt: number;
  event: ReplicaEvent;
};

export type OutboxMutation = MergeMutation & {
  calId: string;
  session?: CalendarSessionRow;
  createdAt: number;
};

const DB_NAME = "aponna-calendar-sessions";
const WAL_KEY = "calendar:outbox-wal:v1";
const MIGRATED_KEY = "calendar:replica-migrated:v1";
const LEGACY_PENDING_KEY = "calendar:pending-writes:v1";
const LEGACY_OUTBOX_KEY = "calendar:session-outbox:v1";
const CACHE_PREFIX = "calendar:cache:v2:";
const SNAPSHOT_PREFIX = "calendar:local:v1:";

class CalendarSessionDB extends Dexie {
  sessions!: Table<ReplicaSession, string>;
  mutations!: Table<OutboxMutation, string>;

  constructor() {
    super(DB_NAME);
    this.version(1).stores({
      sessions: "id, calId, synced, updatedAt",
      mutations: "id, calId, op, createdAt",
    });
  }
}

const replicaMemory = new Map<string, ReplicaSession>();
const mutationMemory = new Map<string, OutboxMutation>();

let dbInstance: CalendarSessionDB | null | undefined;
let migrateStarted: Promise<void> | null = null;

function canUseWindow(): boolean {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

function getDb(): CalendarSessionDB | null {
  if (!canUseWindow()) return null;
  if (dbInstance === undefined) {
    try {
      dbInstance = new CalendarSessionDB();
    } catch (error) {
      console.error("[calendar_sessions replica] failed to open IndexedDB", error);
      dbInstance = null;
    }
  }
  return dbInstance;
}

function dbToIso(value: unknown): string {
  if (typeof value !== "string" || !value) {
    if (value instanceof Date && !Number.isNaN(value.getTime())) {
      return value.toISOString().replace(/(Z|[+-]\d{2}:?\d{2})$/i, "").slice(0, 19);
    }
    return "";
  }
  return value.replace(" ", "T").replace(/(Z|[+-]\d{2}:?\d{2})$/i, "").slice(0, 19);
}

function isReplicaEvent(value: unknown): value is ReplicaEvent {
  if (!value || typeof value !== "object") return false;
  const row = value as ReplicaEvent;
  return (
    typeof row.id === "string" &&
    typeof row.title === "string" &&
    row.title.trim().length > 0 &&
    typeof row.startISO === "string" &&
    row.startISO.length > 0 &&
    typeof row.endISO === "string" &&
    row.endISO.length > 0
  );
}

function eventFromSessionRow(session: CalendarSessionRow): ReplicaEvent | null {
  const title = typeof session.title === "string" ? session.title : "";
  const starts = dbToIso(session.starts_at ?? (session as { startISO?: unknown }).startISO);
  const ends = dbToIso(session.ends_at ?? (session as { endISO?: unknown }).endISO);
  if (!session.id || !title.trim() || !starts || !ends) return null;
  const entityId =
    typeof session.entity_id === "string" && session.entity_id
      ? session.entity_id
      : typeof (session as { entityId?: unknown }).entityId === "string"
        ? ((session as { entityId: string }).entityId)
        : null;
  return {
    ...session,
    id: session.id,
    title,
    startISO: starts,
    endISO: ends,
    ...(entityId ? { entityId } : {}),
  };
}

function readJson(key: string): unknown {
  if (!canUseWindow()) return null;
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function writeWal(items: OutboxMutation[]) {
  mutationMemory.clear();
  for (const item of items) mutationMemory.set(item.id, item);
  if (!canUseWindow()) return;
  try {
    window.localStorage.setItem(WAL_KEY, JSON.stringify(items));
  } catch {
    /* quota */
  }
}

function readWal(): OutboxMutation[] {
  if (mutationMemory.size > 0) return [...mutationMemory.values()];
  const parsed = readJson(WAL_KEY);
  if (!Array.isArray(parsed)) return [];
  const out: OutboxMutation[] = [];
  for (const item of parsed) {
    if (!item || typeof item !== "object") continue;
    const row = item as Partial<OutboxMutation>;
    if (typeof row.id !== "string" || !row.id) continue;
    if (typeof row.calId !== "string" || !row.calId) continue;
    if (row.op !== "upsert" && row.op !== "delete") continue;
    const mutation: OutboxMutation = {
      id: row.id,
      calId: row.calId,
      op: row.op,
      createdAt: typeof row.createdAt === "number" ? row.createdAt : Date.now(),
    };
    if (row.session && typeof row.session === "object" && typeof row.session.id === "string") {
      mutation.session = row.session;
    }
    if (isReplicaEvent(row.event)) mutation.event = row.event;
    out.push(mutation);
    mutationMemory.set(mutation.id, mutation);
  }
  return out;
}

function persistWal() {
  writeWal([...mutationMemory.values()]);
}

function rememberReplica(row: ReplicaSession) {
  replicaMemory.set(row.id, row);
}

function forgetReplica(id: string) {
  replicaMemory.delete(id);
}

async function putReplicaRow(row: ReplicaSession) {
  rememberReplica(row);
  const db = getDb();
  if (!db) return;
  try {
    await db.sessions.put(row);
  } catch (error) {
    console.error("[calendar_sessions replica] put session failed", error);
  }
}

async function putMutationRow(row: OutboxMutation) {
  mutationMemory.set(row.id, row);
  persistWal();
  const db = getDb();
  if (!db) return;
  try {
    await db.mutations.put(row);
  } catch (error) {
    console.error("[calendar_sessions replica] put mutation failed", error);
  }
}

function parseLegacyPending(): OutboxMutation[] {
  const parsed = readJson(LEGACY_PENDING_KEY);
  if (!Array.isArray(parsed)) return [];
  const out: OutboxMutation[] = [];
  for (const item of parsed) {
    if (!item || typeof item !== "object") continue;
    const row = item as { calId?: unknown; session?: unknown };
    if (typeof row.calId !== "string" || !row.calId) continue;
    if (!row.session || typeof row.session !== "object") continue;
    const session = row.session as CalendarSessionRow;
    if (typeof session.id !== "string" || !session.id) continue;
    out.push({
      id: session.id,
      calId: row.calId,
      op: "upsert",
      session,
      event: eventFromSessionRow(session) ?? undefined,
      createdAt: Date.now(),
    });
  }
  return out;
}

function parseLegacyOutbox(): OutboxMutation[] {
  const parsed = readJson(LEGACY_OUTBOX_KEY);
  if (!Array.isArray(parsed)) return [];
  const out: OutboxMutation[] = [];
  for (const item of parsed) {
    if (!item || typeof item !== "object") continue;
    const row = item as {
      op?: string;
      calId?: string;
      session?: CalendarSessionRow;
    };
    if (row.op !== "upsert" || typeof row.calId !== "string" || !row.session?.id) continue;
    out.push({
      id: row.session.id,
      calId: row.calId,
      op: "upsert",
      session: row.session,
      event: eventFromSessionRow(row.session) ?? undefined,
      createdAt: Date.now(),
    });
  }
  return out;
}

function collectLegacySnapshots(): ReplicaSession[] {
  if (!canUseWindow()) return [];
  const now = Date.now();
  const byId = new Map<string, ReplicaSession>();
  for (let i = 0; i < window.localStorage.length; i++) {
    const key = window.localStorage.key(i);
    if (!key) continue;
    let calId = "";
    if (key.startsWith(CACHE_PREFIX)) calId = key.slice(CACHE_PREFIX.length);
    else if (key.startsWith(SNAPSHOT_PREFIX)) {
      const rest = key.slice(SNAPSHOT_PREFIX.length);
      const split = rest.indexOf(":");
      if (split <= 0) continue;
      calId = rest.slice(split + 1);
    } else continue;
    if (!calId || calId === "anon") continue;
    const parsed = readJson(key);
    if (!Array.isArray(parsed)) continue;
    for (const row of parsed) {
      if (!isReplicaEvent(row)) continue;
      byId.set(row.id, {
        id: row.id,
        calId,
        synced: false,
        updatedAt: now,
        event: row,
      });
    }
  }
  return [...byId.values()];
}

export async function migrateLegacyLocalCalendar(): Promise<void> {
  if (!canUseWindow()) return;
  if (migrateStarted) return migrateStarted;
  migrateStarted = (async () => {
    if (window.localStorage.getItem(MIGRATED_KEY) === "1") {
      readWal();
      return;
    }
    const snapshots = collectLegacySnapshots();
    const mutations = [...parseLegacyPending(), ...parseLegacyOutbox(), ...readWal()];
    const db = getDb();
    try {
      if (db) {
        if (snapshots.length > 0) await db.sessions.bulkPut(snapshots);
        if (mutations.length > 0) await db.mutations.bulkPut(mutations);
      }
    } catch (error) {
      console.error("[calendar_sessions replica] legacy migrate failed", error);
    }
    for (const row of snapshots) rememberReplica(row);
    for (const row of mutations) mutationMemory.set(row.id, row);
    persistWal();
    try {
      window.localStorage.setItem(MIGRATED_KEY, "1");
    } catch {
      /* ignore */
    }
  })();
  return migrateStarted;
}

export function stageCalendarSessionUpsert(
  calId: string,
  session: CalendarSessionRow,
  event?: ReplicaEvent | object | null,
): void {
  if (!calId || calId === "anon" || !session.id) return;
  const display = isReplicaEvent(event) ? event : eventFromSessionRow(session);
  const mutation: OutboxMutation = {
    id: session.id,
    calId,
    op: "upsert",
    session,
    event: display ?? undefined,
    createdAt: Date.now(),
  };
  void putMutationRow(mutation);
  if (display) {
    void putReplicaRow({
      id: session.id,
      calId,
      synced: false,
      updatedAt: Date.now(),
      event: display,
    });
  }
}

export function stageCalendarSessionDelete(calId: string, id: string): void {
  if (!calId || !id) return;
  forgetReplica(id);
  const mutation: OutboxMutation = {
    id,
    calId,
    op: "delete",
    createdAt: Date.now(),
  };
  void putMutationRow(mutation);
  const db = getDb();
  if (db) void db.sessions.delete(id).catch(() => undefined);
}

export async function ackCalendarSessionWrite(id: string, synced = true): Promise<void> {
  mutationMemory.delete(id);
  persistWal();
  const existing = replicaMemory.get(id);
  if (existing && synced) {
    const next = { ...existing, synced: true, updatedAt: Date.now() };
    await putReplicaRow(next);
  }
  const db = getDb();
  if (db) {
    try {
      await db.mutations.delete(id);
    } catch (error) {
      console.error("[calendar_sessions replica] ack mutation failed", error);
    }
  }
}

export async function removeReplicaSession(id: string): Promise<void> {
  forgetReplica(id);
  mutationMemory.delete(id);
  persistWal();
  const db = getDb();
  if (!db) return;
  try {
    await db.transaction("rw", db.sessions, db.mutations, async () => {
      await db.sessions.delete(id);
      await db.mutations.delete(id);
    });
  } catch (error) {
    console.error("[calendar_sessions replica] remove failed", error);
  }
}

export function listMutationsSync(calId?: string): OutboxMutation[] {
  readWal();
  const all = [...mutationMemory.values()];
  return calId ? all.filter((row) => row.calId === calId) : all;
}

export async function listMutations(calId?: string): Promise<OutboxMutation[]> {
  await migrateLegacyLocalCalendar();
  const db = getDb();
  let rows: OutboxMutation[] = listMutationsSync(calId);
  if (db) {
    try {
      const fromDb = calId
        ? await db.mutations.where("calId").equals(calId).toArray()
        : await db.mutations.toArray();
      const byId = new Map(fromDb.map((row) => [row.id, row]));
      for (const row of rows) byId.set(row.id, row);
      rows = [...byId.values()];
    } catch (error) {
      console.error("[calendar_sessions replica] list mutations failed", error);
    }
  }
  return calId ? rows.filter((row) => row.calId === calId) : rows;
}

export function listReplicaEventsSync(calId: string): Array<ReplicaEvent & { synced: boolean }> {
  const byId = new Map<string, ReplicaEvent & { synced: boolean }>();
  if (canUseWindow() && window.localStorage.getItem(MIGRATED_KEY) !== "1") {
    for (const row of collectLegacySnapshots()) {
      if (row.calId !== calId || !isReplicaEvent(row.event)) continue;
      byId.set(row.id, { ...row.event, synced: false });
    }
    for (const mutation of [...parseLegacyPending(), ...parseLegacyOutbox()]) {
      if (mutation.calId !== calId) continue;
      if (mutation.op === "delete") {
        byId.delete(mutation.id);
        continue;
      }
      if (mutation.event && isReplicaEvent(mutation.event)) {
        byId.set(mutation.id, { ...mutation.event, synced: false });
      }
    }
  }
  for (const row of replicaMemory.values()) {
    if (row.calId !== calId) continue;
    byId.set(row.id, { ...row.event, synced: row.synced });
  }
  for (const mutation of listMutationsSync(calId)) {
    if (mutation.op === "delete") {
      byId.delete(mutation.id);
      continue;
    }
    if (mutation.event && isReplicaEvent(mutation.event) && !byId.has(mutation.id)) {
      byId.set(mutation.id, { ...mutation.event, synced: false });
    }
  }
  return [...byId.values()];
}

export async function listReplicaEvents(
  calId: string,
): Promise<Array<ReplicaEvent & { synced: boolean }>> {
  await migrateLegacyLocalCalendar();
  const db = getDb();
  const byId = new Map<string, ReplicaEvent & { synced: boolean }>();
  if (db) {
    try {
      const rows = await db.sessions.where("calId").equals(calId).toArray();
      for (const row of rows) {
        if (!isReplicaEvent(row.event)) continue;
        rememberReplica(row);
        byId.set(row.id, { ...row.event, synced: row.synced });
      }
    } catch (error) {
      console.error("[calendar_sessions replica] list sessions failed", error);
    }
  }
  for (const row of listReplicaEventsSync(calId)) {
    byId.set(row.id, row);
  }
  return [...byId.values()];
}

export async function replaceReplicaCalendar(
  calId: string,
  events: Array<ReplicaEvent & { synced?: boolean }>,
): Promise<void> {
  const now = Date.now();
  const keep = new Set(events.map((event) => event.id));
  const rows: ReplicaSession[] = events.filter(isReplicaEvent).map((event) => ({
    id: event.id,
    calId,
    synced: event.synced !== false,
    updatedAt: now,
    event,
  }));
  for (const [id, row] of [...replicaMemory.entries()]) {
    if (row.calId === calId && !keep.has(id)) replicaMemory.delete(id);
  }
  for (const row of rows) rememberReplica(row);
  const db = getDb();
  if (!db) return;
  try {
    await db.transaction("rw", db.sessions, async () => {
      const existing = await db.sessions.where("calId").equals(calId).toArray();
      const stale = existing.filter((row) => !keep.has(row.id)).map((row) => row.id);
      if (stale.length > 0) await db.sessions.bulkDelete(stale);
      if (rows.length > 0) await db.sessions.bulkPut(rows);
    });
  } catch (error) {
    console.error("[calendar_sessions replica] replace calendar failed", error);
  }
}

export async function markReplicaSessionsSynced(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  const now = Date.now();
  for (const id of ids) {
    const existing = replicaMemory.get(id);
    if (existing) rememberReplica({ ...existing, synced: true, updatedAt: now });
  }
  const db = getDb();
  if (!db) return;
  try {
    await db.transaction("rw", db.sessions, async () => {
      for (const id of ids) {
        const row = await db.sessions.get(id);
        if (row) await db.sessions.put({ ...row, synced: true, updatedAt: now });
      }
    });
  } catch (error) {
    console.error("[calendar_sessions replica] mark synced failed", error);
  }
}

if (canUseWindow()) {
  readWal();
  void migrateLegacyLocalCalendar();
}

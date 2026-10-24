/**
 * Entity roster — administrators, groups, and members for the active
 * app_team (entity). Powers the /entity page and shares tables with mobile.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  notifyEntityRosterChanged,
  subscribeEntityRosterSync,
} from "@/lib/entityRosterSync";
import {
  applyPersonGroupMove,
  collectMovesFromSelection,
  personGroupSetsEqual,
} from "@/lib/entityMemberMove";

export type EntityRosterStatus = "roster" | "pending" | "active";

export interface EntityAdministrator {
  id: string;
  name: string;
  surname: string;
  sex: string;
  born: string;
  email: string;
  phone: string;
  group: string;
  status: EntityRosterStatus;
  groups?: EntityMemberGroupRow[];
}

export interface EntityGroup {
  id: string;
  name: string;
  ageFrom: string;
  ageTo: string;
  color: string;
  /** False for local plus-click drafts that have not been saved to the DB. */
  persisted?: boolean;
}

export interface EntityMemberGroupRow {
  id: string;
  groupId: string | null;
  name: string;
  ageFrom: string;
  ageTo: string;
}

export interface EntityMember {
  id: string;
  /** Auth user id, when this roster row is linked to an account. */
  userId: string | null;
  name: string;
  surname: string;
  sex: string;
  born: string;
  email: string;
  phone: string;
  group: string;
  paymentStatus: string;
  status: EntityRosterStatus;
  groups?: EntityMemberGroupRow[];
}

type DbAdmin = {
  id: string;
  team_id: string;
  email: string | null;
  phone: string | null;
  first_name: string | null;
  last_name: string | null;
  sex: string | null;
  date_of_birth: string | null;
  status: string | null;
};

type DbGroup = {
  id: string;
  team_id: string;
  name: string;
  age_from: number | null;
  age_to: number | null;
  sort_order: number;
  deleted_at: string | null;
  color?: string | null;
};

export const DEFAULT_GROUP_COLOR = "#3b82f6";
export const DEFAULT_GROUP_NAME = "New group";

export function isPlaceholderGroupName(name: string | null | undefined): boolean {
  const trimmed = (name ?? "").trim();
  return !trimmed || trimmed.toLowerCase() === DEFAULT_GROUP_NAME.toLowerCase();
}

function isPersistedGroup(group: EntityGroup): boolean {
  return group.persisted !== false;
}
const GROUP_SELECT_WITH_COLOR =
  "id, team_id, name, age_from, age_to, sort_order, deleted_at, color";
const GROUP_SELECT =
  "id, team_id, name, age_from, age_to, sort_order, deleted_at";

type DbMember = {
  id: string;
  user_id?: string | null;
  team_id: string;
  email: string | null;
  phone: string | null;
  first_name: string | null;
  last_name: string | null;
  sex: string | null;
  date_of_birth: string | null;
  payment_status: string | null;
  app_group_id: string | null;
  status: string | null;
};

type DbAdminGroup = {
  id: string;
  admin_id: string;
  group_id: string;
  team_id?: string;
};

type DbMemberGroup = {
  id: string;
  member_id: string;
  group_id: string;
};

const GROUP_AGE_MIN = 1;
const GROUP_AGE_MAX = 130;

/** PostgREST / Postgres errors when entity_admin_groups migration is not applied yet. */
function isMissingAdminGroupsTableError(error: { message?: string; code?: string } | null): boolean {
  if (!error) return false;
  const msg = (error.message ?? "").toLowerCase();
  const code = error.code ?? "";
  return (
    code === "PGRST205" ||
    code === "42P01" ||
    (msg.includes("entity_admin_groups") &&
      (msg.includes("schema cache") ||
        msg.includes("does not exist") ||
        msg.includes("could not find")))
  );
}

function isMissingGroupColorColumnError(error: { message?: string; code?: string } | null): boolean {
  if (!error) return false;
  const msg = (error.message ?? "").toLowerCase();
  const code = error.code ?? "";
  return (
    code === "PGRST204" ||
    code === "42703" ||
    (msg.includes("color") &&
      (msg.includes("schema cache") ||
        msg.includes("does not exist") ||
        msg.includes("could not find")))
  );
}

function isMissingPhoneColumnError(error: { message?: string; code?: string } | null): boolean {
  if (!error) return false;
  const msg = (error.message ?? "").toLowerCase();
  const code = error.code ?? "";
  return (
    code === "PGRST204" ||
    code === "42703" ||
    (msg.includes("phone") &&
      (msg.includes("schema cache") ||
        msg.includes("does not exist") ||
        msg.includes("could not find")))
  );
}

const ADMIN_SELECT_WITH_PHONE =
  "id, team_id, email, phone, first_name, last_name, sex, date_of_birth, status";
const ADMIN_SELECT =
  "id, team_id, email, first_name, last_name, sex, date_of_birth, status";
const MEMBER_SELECT_WITH_PHONE =
  "id, user_id, team_id, email, phone, first_name, last_name, sex, date_of_birth, payment_status, app_group_id, status";
const MEMBER_SELECT =
  "id, user_id, team_id, email, first_name, last_name, sex, date_of_birth, payment_status, app_group_id, status";

function parseRosterStatus(value: string | null | undefined): EntityRosterStatus {
  if (value === "pending" || value === "active") return value;
  return "roster";
}

function buildAdminPayload(
  teamId: string,
  row: EntityAdministrator,
  includePhone: boolean,
) {
  const payload = {
    team_id: teamId,
    first_name: row.name.trim() || null,
    last_name: row.surname.trim() || null,
    sex: row.sex || null,
    date_of_birth: row.born || null,
    email: row.email.trim() || null,
    status: "roster" as const,
  };
  return includePhone ? { ...payload, phone: row.phone.trim() || null } : payload;
}

function buildMemberPayload(
  teamId: string,
  row: EntityMember,
  includePhone: boolean,
) {
  const payload = {
    team_id: teamId,
    first_name: row.name.trim() || null,
    last_name: row.surname.trim() || null,
    sex: row.sex || null,
    date_of_birth: row.born || null,
    payment_status: row.paymentStatus ?? "",
    email: row.email.trim() || null,
    status: "roster" as const,
    app_group_id: row.groups?.find((g) => g.groupId)?.groupId ?? null,
  };
  return includePhone ? { ...payload, phone: row.phone.trim() || null } : payload;
}

export function validateEntityGroupAges(row: EntityGroup): string | null {
  const fromRaw = row.ageFrom.trim();
  const toRaw = row.ageTo.trim();
  if (fromRaw) {
    const n = Number(fromRaw);
    if (!Number.isFinite(n) || Math.round(n) < GROUP_AGE_MIN || Math.round(n) > GROUP_AGE_MAX) {
      return "Age from must be between 1 and 130.";
    }
  }
  if (toRaw) {
    const n = Number(toRaw);
    if (!Number.isFinite(n) || Math.round(n) < GROUP_AGE_MIN || Math.round(n) > GROUP_AGE_MAX) {
      return "Age to must be between 1 and 130.";
    }
  }
  if (fromRaw && toRaw) {
    const from = Math.round(Number(fromRaw));
    const to = Math.round(Number(toRaw));
    if (from > to) return "Age from cannot be greater than age to.";
  }
  return null;
}

function parseAge(value: string): number | null {
  const n = Number(value);
  if (!Number.isFinite(n) || n < GROUP_AGE_MIN || n > GROUP_AGE_MAX) return null;
  return Math.round(n);
}

function ageToStr(value: number | null | undefined): string {
  return value == null ? "" : String(value);
}

function buildAdmin(
  row: DbAdmin,
  links: DbAdminGroup[],
  groupById: Map<string, EntityGroup>,
): EntityAdministrator {
  const groups: EntityMemberGroupRow[] = links.map((link) => {
    const g = groupById.get(link.group_id);
    return {
      id: link.id,
      groupId: link.group_id,
      name: g?.name ?? "",
      ageFrom: g?.ageFrom ?? "",
      ageTo: g?.ageTo ?? "",
    };
  });
  return {
    id: row.id,
    name: row.first_name ?? "",
    surname: row.last_name ?? "",
    sex: row.sex ?? "",
    born: row.date_of_birth ?? "",
    email: row.email ?? "",
    phone: row.phone ?? "",
    group: memberGroupLabel(groups),
    status: parseRosterStatus(row.status),
    groups,
  };
}

function toGroup(row: DbGroup): EntityGroup {
  return {
    id: row.id,
    name: row.name,
    ageFrom: ageToStr(row.age_from),
    ageTo: ageToStr(row.age_to),
    color: row.color?.trim() || DEFAULT_GROUP_COLOR,
    persisted: true,
  };
}

/** Realtime UPDATE payloads can omit unchanged columns. Never blank out a known group. */
function mergeRealtimeGroup(current: EntityGroup, row: DbGroup): EntityGroup {
  return {
    id: row.id || current.id,
    name: row.name != null && row.name !== "" ? row.name : current.name,
    ageFrom: row.age_from !== undefined ? ageToStr(row.age_from) : current.ageFrom,
    ageTo: row.age_to !== undefined ? ageToStr(row.age_to) : current.ageTo,
    color: row.color != null && row.color.trim() ? row.color.trim() : current.color,
  };
}

function memberGroupLabel(groups: EntityMemberGroupRow[]): string {
  return groups.map((g) => g.name).filter(Boolean).join(", ");
}

function buildMember(
  row: DbMember,
  links: DbMemberGroup[],
  groupById: Map<string, EntityGroup>,
): EntityMember {
  const groups: EntityMemberGroupRow[] = links.map((link) => {
    const g = groupById.get(link.group_id);
    return {
      id: link.id,
      groupId: link.group_id,
      name: g?.name ?? "",
      ageFrom: g?.ageFrom ?? "",
      ageTo: g?.ageTo ?? "",
    };
  });
  if (groups.length === 0 && row.app_group_id) {
    const g = groupById.get(row.app_group_id);
    groups.push({
      id: `app-group:${row.id}`,
      groupId: row.app_group_id,
      name: g?.name ?? "",
      ageFrom: g?.ageFrom ?? "",
      ageTo: g?.ageTo ?? "",
    });
  }
  return {
    id: row.id,
    userId: row.user_id ?? null,
    name: row.first_name ?? "",
    surname: row.last_name ?? "",
    sex: row.sex ?? "",
    born: row.date_of_birth ?? "",
    email: row.email ?? "",
    phone: row.phone ?? "",
    group: groups.map((g) => g.name).filter(Boolean).join(", "),
    paymentStatus: row.payment_status ?? "",
    status: parseRosterStatus(row.status),
    groups,
  };
}

function mergeRealtimePerson<T extends { name: string; surname: string; born: string }>(
  existing: T | undefined,
  next: T,
  row: { first_name?: string | null; last_name?: string | null; date_of_birth?: string | null },
): T {
  if (!existing) return next;
  return {
    ...next,
    name: row.first_name !== undefined ? next.name : existing.name,
    surname: row.last_name !== undefined ? next.surname : existing.surname,
    born: row.date_of_birth !== undefined ? next.born : existing.born,
  };
}

export function useEntityRoster(teamId: string | null) {
  const [admins, setAdmins] = useState<EntityAdministrator[]>([]);
  const [groups, setGroups] = useState<EntityGroup[]>([]);
  const [members, setMembers] = useState<EntityMember[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [realtimeEpoch, setRealtimeEpoch] = useState(0);
  const groupsRef = useRef(groups);
  groupsRef.current = groups;
  const adminsRef = useRef(admins);
  adminsRef.current = admins;
  const membersRef = useRef(members);
  membersRef.current = members;
  const teamIdRef = useRef(teamId);
  teamIdRef.current = teamId;
  const loadRef = useRef<(opts?: { silent?: boolean }) => Promise<void>>(async () => {});
  const remoteLoadTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const adminGroupsSupportedRef = useRef(false);
  const phoneColumnSupportedRef = useRef(false);
  const colorColumnSupportedRef = useRef(true);
  const [adminGroupsSupported, setAdminGroupsSupported] = useState(false);

  const load = useCallback(async (opts?: { silent?: boolean }) => {
    if (!teamId) {
      setAdmins([]);
      setGroups([]);
      setMembers([]);
      setLoading(false);
      setError(null);
      adminGroupsSupportedRef.current = false;
      setAdminGroupsSupported(false);
      phoneColumnSupportedRef.current = false;
      colorColumnSupportedRef.current = true;
      return;
    }
    if (!opts?.silent) {
      setLoading(true);
      setError(null);
    }

    const [adminRes, groupResRaw, memberRes, memberLinkRes, adminLinkRes] = await Promise.all([
      supabase
        .from("app_team_admins")
        .select(ADMIN_SELECT_WITH_PHONE)
        .eq("team_id", teamId)
        .order("created_at"),
      supabase
        .from("app_team_groups")
        .select(GROUP_SELECT_WITH_COLOR)
        .eq("team_id", teamId)
        .is("deleted_at", null)
        .order("sort_order"),
      supabase
        .from("entity_members")
        .select(MEMBER_SELECT_WITH_PHONE)
        .eq("team_id", teamId)
        .neq("status", "inactive")
        .order("created_at"),
      supabase
        .from("entity_member_groups")
        .select("id, member_id, group_id")
        .eq("team_id", teamId),
      supabase
        .from("entity_admin_groups")
        .select("id, admin_id, group_id")
        .eq("team_id", teamId),
    ]);

    let adminRows = adminRes;
    let memberRows = memberRes;
    let groupRes = groupResRaw;
    let phoneSupported = !adminRes.error && !memberRes.error;

    if (adminRes.error && isMissingPhoneColumnError(adminRes.error)) {
      adminRows = await supabase
        .from("app_team_admins")
        .select(ADMIN_SELECT)
        .eq("team_id", teamId)
        .order("created_at");
      phoneSupported = false;
    }
    if (memberRes.error && isMissingPhoneColumnError(memberRes.error)) {
      memberRows = await supabase
        .from("entity_members")
        .select(MEMBER_SELECT)
        .eq("team_id", teamId)
        .neq("status", "inactive")
        .order("created_at");
      phoneSupported = false;
    }
    if (groupResRaw.error && isMissingGroupColorColumnError(groupResRaw.error)) {
      groupRes = await supabase
        .from("app_team_groups")
        .select(GROUP_SELECT)
        .eq("team_id", teamId)
        .is("deleted_at", null)
        .order("sort_order");
      colorColumnSupportedRef.current = false;
    } else if (!groupResRaw.error) {
      colorColumnSupportedRef.current = true;
    }

    phoneColumnSupportedRef.current = phoneSupported;

    if (
      adminRows.error ||
      groupRes.error ||
      memberRows.error ||
      memberLinkRes.error
    ) {
      const msg =
        adminRows.error?.message ??
        groupRes.error?.message ??
        memberRows.error?.message ??
        memberLinkRes.error?.message ??
        "Could not load entity roster";
      console.error("[useEntityRoster] load", msg);
      setError(msg);
      if (!opts?.silent) setLoading(false);
      return;
    }

    let adminLinkRows: DbAdminGroup[] = [];
    if (adminLinkRes.error) {
      if (isMissingAdminGroupsTableError(adminLinkRes.error)) {
        console.warn(
          "[useEntityRoster] entity_admin_groups not in schema yet — roster loads without admin group links",
        );
      } else {
        console.warn(
          "[useEntityRoster] could not load admin group links:",
          adminLinkRes.error.message,
        );
      }
      adminGroupsSupportedRef.current = false;
      setAdminGroupsSupported(false);
    } else {
      adminLinkRows = (adminLinkRes.data ?? []) as DbAdminGroup[];
      adminGroupsSupportedRef.current = true;
      setAdminGroupsSupported(true);
    }

    const activeGroups = ((groupRes.data ?? []) as DbGroup[]).filter((g) => !g.deleted_at);
    const mappedGroups = activeGroups.map(toGroup);
    const groupById = new Map(mappedGroups.map((g) => [g.id, g]));
    const linksByMember = new Map<string, DbMemberGroup[]>();
    for (const link of (memberLinkRes.data ?? []) as DbMemberGroup[]) {
      const list = linksByMember.get(link.member_id) ?? [];
      list.push(link);
      linksByMember.set(link.member_id, list);
    }
    const linksByAdmin = new Map<string, DbAdminGroup[]>();
    for (const link of adminLinkRows) {
      const list = linksByAdmin.get(link.admin_id) ?? [];
      list.push(link);
      linksByAdmin.set(link.admin_id, list);
    }

    setAdmins(
      ((adminRows.data ?? []) as DbAdmin[]).map((row) =>
        buildAdmin(row, linksByAdmin.get(row.id) ?? [], groupById),
      ),
    );
    setGroups((prev) => {
      const drafts = prev.filter((g) => !isPersistedGroup(g));
      if (drafts.length === 0) return mappedGroups;
      const ids = new Set(mappedGroups.map((g) => g.id));
      return [...mappedGroups, ...drafts.filter((d) => !ids.has(d.id))];
    });
    setMembers(
      ((memberRows.data ?? []) as DbMember[])
        .filter((row) => row.status !== "inactive")
        .map((row) => buildMember(row, linksByMember.get(row.id) ?? [], groupById)),
    );
    if (!opts?.silent) setLoading(false);
  }, [teamId]);

  loadRef.current = load;

  const broadcastRosterChange = useCallback(async () => {
    if (teamId) await notifyEntityRosterChanged(supabase, teamId);
  }, [teamId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!teamId) return;
    return subscribeEntityRosterSync(supabase, teamId, () => {
      if (remoteLoadTimer.current) clearTimeout(remoteLoadTimer.current);
      remoteLoadTimer.current = setTimeout(() => {
        void loadRef.current({ silent: true });
      }, 50);
    });
  }, [teamId]);

  useEffect(() => {
    const { data: authSub } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_IN" || event === "TOKEN_REFRESHED") {
        setRealtimeEpoch((n) => n + 1);
      }
    });
    return () => authSub.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!teamId) return;

    let cancelled = false;
    const filter = `team_id=eq.${teamId}`;

    const applyAdmin = (payload: { eventType: string; new: unknown; old: unknown }) => {
      if (payload.eventType === "DELETE") {
        const id = (payload.old as { id?: string })?.id;
        if (id) setAdmins((prev) => prev.filter((a) => a.id !== id));
        return;
      }
      const row = payload.new as DbAdmin;
      if (row.team_id !== teamId) return;
      const groupById = new Map(groupsRef.current.map((g) => [g.id, g]));
      const admin = buildAdmin(row, [], groupById);
      setAdmins((prev) => {
        const idx = prev.findIndex((a) => a.id === admin.id);
        const existing = idx >= 0 ? prev[idx] : undefined;
        const existingGroups = existing?.groups ?? [];
        const merged = {
          ...mergeRealtimePerson(existing, admin, row),
          groups: existingGroups,
          group: memberGroupLabel(existingGroups),
        };
        if (idx >= 0) return prev.map((a) => (a.id === merged.id ? merged : a));
        return [...prev, merged];
      });
    };

    const applyGroup = (payload: { eventType: string; new: unknown; old: unknown }) => {
      if (payload.eventType === "DELETE") {
        const id = (payload.old as { id?: string })?.id;
        if (!id) return;
        setGroups((prev) => prev.filter((g) => g.id !== id));
        setMembers((prev) =>
          prev.map((m) => {
            const nextGroups = (m.groups ?? []).filter((g) => g.groupId !== id);
            if (nextGroups.length === (m.groups ?? []).length) return m;
            return { ...m, groups: nextGroups, group: memberGroupLabel(nextGroups) };
          }),
        );
        setAdmins((prev) =>
          prev.map((a) => {
            const nextGroups = (a.groups ?? []).filter((g) => g.groupId !== id);
            if (nextGroups.length === (a.groups ?? []).length) return a;
            return { ...a, groups: nextGroups, group: memberGroupLabel(nextGroups) };
          }),
        );
        return;
      }
      const row = payload.new as DbGroup;
      if (row.team_id !== teamId) return;
      if (row.deleted_at) {
        setGroups((prev) => prev.filter((g) => g.id !== row.id));
        return;
      }
      setGroups((prev) => {
        const idx = prev.findIndex((g) => g.id === row.id);
        if (idx >= 0) {
          const merged = mergeRealtimeGroup(prev[idx], row);
          return prev.map((g, i) => (i === idx ? merged : g));
        }
        if (!row.id) return prev;
        // Partial INSERT payloads without a name are not real roster tabs.
        if (!(row.name ?? "").trim()) return prev;
        return [...prev, toGroup(row)];
      });
      setMembers((prev) =>
        prev.map((m) => {
          const nextGroups = (m.groups ?? []).map((g) =>
            g.groupId === row.id
              ? {
                  ...g,
                  name: row.name != null && row.name !== "" ? row.name : g.name,
                  ageFrom: row.age_from !== undefined ? ageToStr(row.age_from) : g.ageFrom,
                  ageTo: row.age_to !== undefined ? ageToStr(row.age_to) : g.ageTo,
                }
              : g,
          );
          if (nextGroups.every((g, i) => g === (m.groups ?? [])[i])) return m;
          return { ...m, groups: nextGroups, group: memberGroupLabel(nextGroups) };
        }),
      );
      setAdmins((prev) =>
        prev.map((a) => {
          const nextGroups = (a.groups ?? []).map((g) =>
            g.groupId === row.id
              ? {
                  ...g,
                  name: row.name != null && row.name !== "" ? row.name : g.name,
                  ageFrom: row.age_from !== undefined ? ageToStr(row.age_from) : g.ageFrom,
                  ageTo: row.age_to !== undefined ? ageToStr(row.age_to) : g.ageTo,
                }
              : g,
          );
          if (nextGroups.every((g, i) => g === (a.groups ?? [])[i])) return a;
          return { ...a, groups: nextGroups, group: memberGroupLabel(nextGroups) };
        }),
      );
    };

    const applyMember = (payload: { eventType: string; new: unknown; old: unknown }) => {
      if (payload.eventType === "DELETE") {
        const id = (payload.old as { id?: string })?.id;
        if (id) setMembers((prev) => prev.filter((m) => m.id !== id));
        return;
      }
      const row = payload.new as DbMember;
      if (row.team_id !== teamId) return;
      if (row.status === "inactive") {
        setMembers((prev) => prev.filter((m) => m.id !== row.id));
        return;
      }
      const groupById = new Map(groupsRef.current.map((g) => [g.id, g]));
      const member = buildMember(row, [], groupById);
      setMembers((prev) => {
        const idx = prev.findIndex((m) => m.id === member.id);
        const existing = idx >= 0 ? prev[idx] : undefined;
        const existingGroups = existing?.groups ?? [];
        const merged = {
          ...mergeRealtimePerson(existing, member, row),
          groups: existingGroups,
          group: memberGroupLabel(existingGroups),
        };
        if (idx >= 0) return prev.map((m) => (m.id === merged.id ? merged : m));
        return [...prev, merged];
      });
    };

    const applyMemberGroup = (payload: { eventType: string; new: unknown; old: unknown }) => {
      if (payload.eventType === "DELETE") {
        const old = payload.old as DbMemberGroup & { group_id?: string };
        if (!old?.id && !old?.group_id) return;
        setMembers((prev) =>
          prev.map((m) => {
            if (old.member_id && String(m.id) !== String(old.member_id)) return m;
            const nextGroups = (m.groups ?? []).filter((g) => {
              if (old.id && g.id === old.id) return false;
              if (old.group_id && g.groupId === old.group_id) return false;
              return true;
            });
            if (nextGroups.length === (m.groups ?? []).length) return m;
            return { ...m, groups: nextGroups, group: memberGroupLabel(nextGroups) };
          }),
        );
        return;
      }
      const row = payload.new as DbMemberGroup & { team_id?: string };
      // team_id may be absent on partial payloads — only reject hard mismatches.
      if (row.team_id && row.team_id !== teamId) return;
      const g = groupsRef.current.find((gr) => gr.id === row.group_id);
      const link: EntityMemberGroupRow = {
        id: row.id,
        groupId: row.group_id,
        name: g?.name ?? "",
        ageFrom: g?.ageFrom ?? "",
        ageTo: g?.ageTo ?? "",
      };
      setMembers((prev) =>
        prev.map((m) => {
          if (String(m.id) !== String(row.member_id)) return m;
          const without = (m.groups ?? []).filter((x) => x.groupId !== row.group_id);
          const nextGroups = [...without, link];
          return { ...m, groups: nextGroups, group: memberGroupLabel(nextGroups) };
        }),
      );
    };

    const applyAdminGroup = (payload: { eventType: string; new: unknown; old: unknown }) => {
      if (payload.eventType === "DELETE") {
        const old = payload.old as DbAdminGroup & { group_id?: string };
        if (!old?.id && !old?.group_id) return;
        setAdmins((prev) =>
          prev.map((a) => {
            if (old.admin_id && String(a.id) !== String(old.admin_id)) return a;
            const nextGroups = (a.groups ?? []).filter((g) => {
              if (old.id && g.id === old.id) return false;
              if (old.group_id && g.groupId === old.group_id) return false;
              return true;
            });
            if (nextGroups.length === (a.groups ?? []).length) return a;
            return { ...a, groups: nextGroups, group: memberGroupLabel(nextGroups) };
          }),
        );
        return;
      }
      const row = payload.new as DbAdminGroup;
      if (row.team_id && row.team_id !== teamId) return;
      const g = groupsRef.current.find((gr) => gr.id === row.group_id);
      const link: EntityMemberGroupRow = {
        id: row.id,
        groupId: row.group_id,
        name: g?.name ?? "",
        ageFrom: g?.ageFrom ?? "",
        ageTo: g?.ageTo ?? "",
      };
      setAdmins((prev) =>
        prev.map((a) => {
          if (String(a.id) !== String(row.admin_id)) return a;
          const without = (a.groups ?? []).filter((x) => x.groupId !== row.group_id);
          const nextGroups = [...without, link];
          return { ...a, groups: nextGroups, group: memberGroupLabel(nextGroups) };
        }),
      );
    };

    let ch = supabase.channel(`entity-roster-${teamId}-${realtimeEpoch}`);

    void (async () => {
      const { data } = await supabase.auth.getSession();
      if (cancelled || !data.session?.access_token) return;
      await supabase.realtime.setAuth(data.session.access_token);
      if (cancelled) return;

      ch = ch
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "app_team_admins", filter },
          applyAdmin,
        )
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "app_team_groups", filter },
          applyGroup,
        )
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "entity_members", filter },
          applyMember,
        )
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "entity_member_groups", filter },
          applyMemberGroup,
        );

      if (adminGroupsSupported) {
        ch = ch.on(
          "postgres_changes",
          { event: "*", schema: "public", table: "entity_admin_groups", filter },
          applyAdminGroup,
        );
      }

      ch = ch
        .subscribe((status) => {
          if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
            setRealtimeEpoch((n) => n + 1);
          }
        });
    })();

    return () => {
      cancelled = true;
      if (remoteLoadTimer.current) clearTimeout(remoteLoadTimer.current);
      void supabase.removeChannel(ch);
    };
  }, [teamId, realtimeEpoch, adminGroupsSupported]);

  const syncAdminGroups = async (
    adminId: string,
    nextGroups: EntityMemberGroupRow[],
  ): Promise<boolean> => {
    const teamIdNow = teamIdRef.current;
    if (!teamIdNow) return false;
    const { data: existing, error: readError } = await supabase
      .from("entity_admin_groups")
      .select("id, group_id")
      .eq("admin_id", adminId);
    if (readError) {
      if (isMissingAdminGroupsTableError(readError)) {
        adminGroupsSupportedRef.current = false;
        setAdminGroupsSupported(false);
        setError(
          "Could not save administrator group assignments. Apply the latest database migration (entity_admin_groups), then reload the page.",
        );
        return false;
      }
      console.error("[useEntityRoster] syncAdminGroups read", readError.message);
      setError(readError.message);
      return false;
    }

    adminGroupsSupportedRef.current = true;
    setAdminGroupsSupported(true);

    const wantIds = new Set(
      nextGroups.map((g) => g.groupId).filter((id): id is string => !!id),
    );
    const toDelete = ((existing ?? []) as Array<{ id: string; group_id: string }>).filter(
      (row) => !wantIds.has(row.group_id),
    );
    if (toDelete.length > 0) {
      const { error } = await supabase
        .from("entity_admin_groups")
        .delete()
        .in(
          "id",
          toDelete.map((r) => r.id),
        );
      if (error) {
        console.error("[useEntityRoster] syncAdminGroups delete", error.message);
        setError(error.message);
        return false;
      }
    }
    const existingGroupIds = new Set(
      ((existing ?? []) as Array<{ group_id: string }>).map((r) => r.group_id),
    );
    const toInsert = [...wantIds].filter((id) => !existingGroupIds.has(id));
    if (toInsert.length > 0) {
      const { error } = await supabase.from("entity_admin_groups").insert(
        toInsert.map((groupId) => ({
          team_id: teamIdNow,
          admin_id: adminId,
          group_id: groupId,
        })),
      );
      if (error) {
        console.error("[useEntityRoster] syncAdminGroups insert", error.message);
        setError(error.message);
        return false;
      }
    }
    return true;
  };

  const saveAdministrator = useCallback(
    async (row: EntityAdministrator): Promise<boolean> => {
      if (!teamId) return false;
      setError(null);
      let includePhone = phoneColumnSupportedRef.current;
      let payload = buildAdminPayload(teamId, row, includePhone);
      const isExisting = admins.some((a) => a.id === row.id);
      if (isExisting) {
        let { error: updateError } = await supabase
          .from("app_team_admins")
          .update(payload)
          .eq("id", row.id);
        if (updateError && includePhone && isMissingPhoneColumnError(updateError)) {
          phoneColumnSupportedRef.current = false;
          includePhone = false;
          payload = buildAdminPayload(teamId, row, false);
          ({ error: updateError } = await supabase
            .from("app_team_admins")
            .update(payload)
            .eq("id", row.id));
        }
        if (updateError) {
          console.error("[useEntityRoster] saveAdministrator", updateError.message);
          setError(updateError.message);
          return false;
        }
        const ok = await syncAdminGroups(row.id, row.groups ?? []);
        if (!ok) {
          await load();
          return false;
        }
        await load({ silent: true });
        await broadcastRosterChange();
        return true;
      }
      let { data, error: insertError } = await supabase
        .from("app_team_admins")
        .insert(payload)
        .select(includePhone ? ADMIN_SELECT_WITH_PHONE : ADMIN_SELECT)
        .single();
      if (insertError && includePhone && isMissingPhoneColumnError(insertError)) {
        phoneColumnSupportedRef.current = false;
        payload = buildAdminPayload(teamId, row, false);
        ({ data, error: insertError } = await supabase
          .from("app_team_admins")
          .insert(payload)
          .select(ADMIN_SELECT)
          .single());
      }
      if (insertError || !data) {
        console.error("[useEntityRoster] saveAdministrator", insertError?.message);
        setError(insertError?.message ?? "Could not save administrator");
        return false;
      }
      const adminId = (data as DbAdmin).id;
      const ok = await syncAdminGroups(adminId, row.groups ?? []);
      if (!ok) {
        await load();
        return false;
      }
      await load({ silent: true });
      await broadcastRosterChange();
      return true;
    },
    [teamId, admins, load, broadcastRosterChange],
  );

  const deleteAdministrators = useCallback(
    async (ids: string[]): Promise<boolean> => {
      if (!teamId || ids.length === 0) return true;
      const { error: linkError } = await supabase
        .from("entity_admin_groups")
        .delete()
        .in("admin_id", ids);
      if (linkError && !isMissingAdminGroupsTableError(linkError)) {
        console.warn("[useEntityRoster] deleteAdministrators links", linkError.message);
      }
      const { error: deleteError } = await supabase.from("app_team_admins").delete().in("id", ids);
      if (deleteError) {
        console.error("[useEntityRoster] deleteAdministrators", deleteError.message);
        setError(deleteError.message);
        await load();
        return false;
      }
      setAdmins((prev) => prev.filter((a) => !ids.includes(a.id)));
      await broadcastRosterChange();
      return true;
    },
    [teamId, load, broadcastRosterChange],
  );

  const saveGroup = useCallback(
    async (row: EntityGroup): Promise<EntityGroup | null> => {
      if (!teamId) return null;
      const ageError = validateEntityGroupAges(row);
      if (ageError) {
        setError(ageError);
        return null;
      }
      const includeColor = colorColumnSupportedRef.current;
      const payload = {
        team_id: teamId,
        name: row.name.trim() || DEFAULT_GROUP_NAME,
        age_from: parseAge(row.ageFrom),
        age_to: parseAge(row.ageTo),
        updated_at: new Date().toISOString(),
        ...(includeColor ? { color: row.color?.trim() || DEFAULT_GROUP_COLOR } : {}),
      };
      const existing = groupsRef.current.find((g) => g.id === row.id);
      const isDraft = existing ? !isPersistedGroup(existing) : row.persisted === false;
      const nextRow: EntityGroup = {
        ...row,
        name: payload.name,
        color: row.color?.trim() || DEFAULT_GROUP_COLOR,
        persisted: isDraft ? false : existing ? isPersistedGroup(existing) : false,
      };

      const applyLocal = (value: EntityGroup) => {
        setGroups((prev) => {
          const idx = prev.findIndex((g) => g.id === value.id);
          const next =
            idx >= 0 ? prev.map((g, i) => (i === idx ? value : g)) : [...prev, value];
          groupsRef.current = next;
          return next;
        });
      };

      const insertRow = async (value: EntityGroup): Promise<EntityGroup | null> => {
        const maxOrder = groupsRef.current.filter((g) => g.id !== value.id && isPersistedGroup(g)).length;
        const insertPayload = { ...payload, id: value.id, sort_order: maxOrder, name: value.name };
        const insertOnly = async (body: Record<string, unknown>) =>
          supabase.from("app_team_groups").insert(body as typeof insertPayload);

        let body: Record<string, unknown> = { ...insertPayload };
        let insertError = (await insertOnly(body)).error;
        if (insertError && includeColor && isMissingGroupColorColumnError(insertError)) {
          colorColumnSupportedRef.current = false;
          const { color: _c, ...withoutColor } = body;
          body = withoutColor;
          insertError = (await insertOnly(body)).error;
        }
        if (insertError) {
          console.error("[useEntityRoster] saveGroup", insertError.message);
          setError(insertError.message);
          return null;
        }
        const persisted = { ...value, persisted: true };
        applyLocal(persisted);
        setError(null);
        await broadcastRosterChange();
        return persisted;
      };

      if (existing && !isDraft) {
        applyLocal({ ...nextRow, persisted: true });
        const { error: updateError } = await supabase
          .from("app_team_groups")
          .update(payload)
          .eq("id", row.id);
        if (updateError) {
          if (includeColor && isMissingGroupColorColumnError(updateError)) {
            colorColumnSupportedRef.current = false;
            const { color: _c, ...withoutColor } = payload as typeof payload & { color?: string };
            const retry = await supabase.from("app_team_groups").update(withoutColor).eq("id", row.id);
            if (retry.error) {
              console.error("[useEntityRoster] saveGroup", retry.error.message);
              setError(retry.error.message);
              return null;
            }
          } else {
            console.error("[useEntityRoster] saveGroup", updateError.message);
            setError(updateError.message);
            return null;
          }
        }
        await broadcastRosterChange();
        return { ...nextRow, persisted: true };
      }

      applyLocal({ ...nextRow, persisted: false });
      return insertRow({ ...nextRow, persisted: false });
    },
    [teamId, broadcastRosterChange],
  );

  const addGroup = useCallback(
    async (draft?: EntityGroup): Promise<EntityGroup | null> => {
      if (!teamId) return null;
      return saveGroup({
        id: draft?.id ?? crypto.randomUUID(),
        name: draft?.name?.trim() || DEFAULT_GROUP_NAME,
        ageFrom: draft?.ageFrom ?? "",
        ageTo: draft?.ageTo ?? "",
        color: draft?.color || DEFAULT_GROUP_COLOR,
        persisted: false,
      });
    },
    [teamId, saveGroup],
  );

  const deleteGroups = useCallback(
    async (ids: string[]): Promise<boolean> => {
      if (!teamId || ids.length === 0) return true;
      const persistedIds = ids.filter((id) => {
        const g = groupsRef.current.find((x) => x.id === id);
        return g ? isPersistedGroup(g) : true;
      });
      setGroups((prev) => {
        const next = prev.filter((g) => !ids.includes(g.id));
        groupsRef.current = next;
        return next;
      });
      if (persistedIds.length === 0) return true;
      const now = new Date().toISOString();
      const { error: softError } = await supabase
        .from("app_team_groups")
        .update({ deleted_at: now, updated_at: now })
        .in("id", persistedIds);
      if (softError) {
        console.error("[useEntityRoster] deleteGroups", softError.message);
        setError(softError.message);
        await load();
        return false;
      }
      await load({ silent: true });
      await broadcastRosterChange();
      return true;
    },
    [teamId, load, broadcastRosterChange],
  );

  const rehomeGroupPeople = useCallback(
    async (fromGroupId: string, toGroupId: string | null): Promise<boolean> => {
      if (!teamId) return false;
      if (toGroupId === fromGroupId) return false;

      const rehomeMemberLinks = async (): Promise<boolean> => {
        const { data: fromLinks, error: fromError } = await supabase
          .from("entity_member_groups")
          .select("id, member_id")
          .eq("group_id", fromGroupId)
          .eq("team_id", teamId);
        if (fromError) {
          console.error("[useEntityRoster] rehomeGroupPeople members read", fromError.message);
          setError(fromError.message);
          return false;
        }
        const links = fromLinks ?? [];
        if (links.length === 0) return true;

        if (!toGroupId) {
          const { error } = await supabase
            .from("entity_member_groups")
            .delete()
            .in("id", links.map((row) => row.id));
          if (error) {
            console.error("[useEntityRoster] rehomeGroupPeople members unlink", error.message);
            setError(error.message);
            return false;
          }
          return true;
        }

        const { data: targetLinks, error: targetError } = await supabase
          .from("entity_member_groups")
          .select("member_id")
          .eq("group_id", toGroupId)
          .eq("team_id", teamId);
        if (targetError) {
          console.error("[useEntityRoster] rehomeGroupPeople members target", targetError.message);
          setError(targetError.message);
          return false;
        }
        const already = new Set((targetLinks ?? []).map((row) => row.member_id));
        const toDelete = links.filter((row) => already.has(row.member_id)).map((row) => row.id);
        const toUpdate = links.filter((row) => !already.has(row.member_id));
        if (toDelete.length > 0) {
          const { error } = await supabase.from("entity_member_groups").delete().in("id", toDelete);
          if (error) {
            console.error("[useEntityRoster] rehomeGroupPeople members dedupe", error.message);
            setError(error.message);
            return false;
          }
        }
        if (toUpdate.length > 0) {
          const results = await Promise.all(
            toUpdate.map((row) =>
              supabase.from("entity_member_groups").update({ group_id: toGroupId }).eq("id", row.id),
            ),
          );
          const failed = results.find((r) => r.error);
          if (failed?.error) {
            console.error("[useEntityRoster] rehomeGroupPeople members move", failed.error.message);
            setError(failed.error.message);
            return false;
          }
        }
        return true;
      };

      const rehomeAdminLinks = async (): Promise<boolean> => {
        const { data: fromLinks, error: fromError } = await supabase
          .from("entity_admin_groups")
          .select("id, admin_id")
          .eq("group_id", fromGroupId)
          .eq("team_id", teamId);
        if (fromError) {
          if (isMissingAdminGroupsTableError(fromError)) return true;
          console.error("[useEntityRoster] rehomeGroupPeople admins read", fromError.message);
          setError(fromError.message);
          return false;
        }
        const links = fromLinks ?? [];
        if (links.length === 0) return true;

        if (!toGroupId) {
          const { error } = await supabase
            .from("entity_admin_groups")
            .delete()
            .in("id", links.map((row) => row.id));
          if (error) {
            console.error("[useEntityRoster] rehomeGroupPeople admins unlink", error.message);
            setError(error.message);
            return false;
          }
          return true;
        }

        const { data: targetLinks, error: targetError } = await supabase
          .from("entity_admin_groups")
          .select("admin_id")
          .eq("group_id", toGroupId)
          .eq("team_id", teamId);
        if (targetError) {
          console.error("[useEntityRoster] rehomeGroupPeople admins target", targetError.message);
          setError(targetError.message);
          return false;
        }
        const already = new Set((targetLinks ?? []).map((row) => row.admin_id));
        const toDelete = links.filter((row) => already.has(row.admin_id)).map((row) => row.id);
        const toUpdate = links.filter((row) => !already.has(row.admin_id));
        if (toDelete.length > 0) {
          const { error } = await supabase.from("entity_admin_groups").delete().in("id", toDelete);
          if (error) {
            console.error("[useEntityRoster] rehomeGroupPeople admins dedupe", error.message);
            setError(error.message);
            return false;
          }
        }
        if (toUpdate.length > 0) {
          const results = await Promise.all(
            toUpdate.map((row) =>
              supabase.from("entity_admin_groups").update({ group_id: toGroupId }).eq("id", row.id),
            ),
          );
          const failed = results.find((r) => r.error);
          if (failed?.error) {
            console.error("[useEntityRoster] rehomeGroupPeople admins move", failed.error.message);
            setError(failed.error.message);
            return false;
          }
        }
        return true;
      };

      const membersOk = await rehomeMemberLinks();
      if (!membersOk) return false;
      const adminsOk = await rehomeAdminLinks();
      if (!adminsOk) return false;

      const { error: primaryError } = await supabase
        .from("entity_members")
        .update({ app_group_id: toGroupId })
        .eq("team_id", teamId)
        .eq("app_group_id", fromGroupId);
      if (primaryError) {
        console.error("[useEntityRoster] rehomeGroupPeople app_group_id", primaryError.message);
        setError(primaryError.message);
        return false;
      }

      return deleteGroups([fromGroupId]);
    },
    [teamId, deleteGroups],
  );

  const reorderGroups = useCallback(
    async (next: EntityGroup[]): Promise<boolean> => {
      if (!teamId || next.length === 0) return true;
      const previous = groupsRef.current;
      setGroups(next);
      groupsRef.current = next;
      const now = new Date().toISOString();
      const results = await Promise.all(
        next.map((g, idx) => {
          if (!isPersistedGroup(g)) {
            return Promise.resolve({ error: null });
          }
          return supabase
            .from("app_team_groups")
            .update({ sort_order: idx, updated_at: now })
            .eq("id", g.id);
        }),
      );
      const failed = results.find((r) => r.error);
      if (failed?.error) {
        console.error("[useEntityRoster] reorderGroups", failed.error.message);
        setError(failed.error.message);
        setGroups(previous);
        groupsRef.current = previous;
        return false;
      }
      await broadcastRosterChange();
      return true;
    },
    [teamId, broadcastRosterChange],
  );

  const syncMemberGroups = async (
    memberId: string,
    nextGroups: EntityMemberGroupRow[],
    groupById: Map<string, EntityGroup>,
  ) => {
    const teamIdNow = teamIdRef.current;
    if (!teamIdNow) return false;
    const { data: existing, error: readError } = await supabase
      .from("entity_member_groups")
      .select("id, group_id")
      .eq("member_id", memberId);
    if (readError) {
      console.error("[useEntityRoster] syncMemberGroups read", readError.message);
      return false;
    }
    const wantIds = new Set(
      nextGroups.map((g) => g.groupId).filter((id): id is string => !!id),
    );
    const toDelete = ((existing ?? []) as Array<{ id: string; group_id: string }>).filter(
      (row) => !wantIds.has(row.group_id),
    );
    if (toDelete.length > 0) {
      const { error } = await supabase
        .from("entity_member_groups")
        .delete()
        .in(
          "id",
          toDelete.map((r) => r.id),
        );
      if (error) {
        console.error("[useEntityRoster] syncMemberGroups delete", error.message);
        return false;
      }
    }
    const existingGroupIds = new Set(
      ((existing ?? []) as Array<{ group_id: string }>).map((r) => r.group_id),
    );
    const toInsert = [...wantIds].filter((id) => !existingGroupIds.has(id));
    if (toInsert.length > 0) {
      const { error } = await supabase.from("entity_member_groups").insert(
        toInsert.map((groupId) => ({
          team_id: teamIdNow,
          member_id: memberId,
          group_id: groupId,
        })),
      );
      if (error) {
        console.error("[useEntityRoster] syncMemberGroups insert", error.message);
        return false;
      }
    }
    const primaryGroupId = nextGroups.find((g) => g.groupId)?.groupId ?? null;
    await supabase
      .from("entity_members")
      .update({ app_group_id: primaryGroupId })
      .eq("id", memberId);
    void groupById;
    return true;
  };

  const syncAdminGroupsRef = useRef(syncAdminGroups);
  syncAdminGroupsRef.current = syncAdminGroups;
  const syncMemberGroupsRef = useRef(syncMemberGroups);
  syncMemberGroupsRef.current = syncMemberGroups;

  const saveMember = useCallback(
    async (row: EntityMember): Promise<boolean> => {
      if (!teamId) return false;
      const groupById = new Map(groups.map((g) => [g.id, g]));
      let includePhone = phoneColumnSupportedRef.current;
      let payload = buildMemberPayload(teamId, row, includePhone);
      const isExisting = members.some((m) => m.id === row.id);
      if (isExisting) {
        let { error: updateError } = await supabase
          .from("entity_members")
          .update(payload)
          .eq("id", row.id);
        if (updateError && includePhone && isMissingPhoneColumnError(updateError)) {
          phoneColumnSupportedRef.current = false;
          includePhone = false;
          payload = buildMemberPayload(teamId, row, false);
          ({ error: updateError } = await supabase
            .from("entity_members")
            .update(payload)
            .eq("id", row.id));
        }
        if (updateError) {
          console.error("[useEntityRoster] saveMember", updateError.message);
          setError(updateError.message);
          return false;
        }
        const ok = await syncMemberGroups(row.id, row.groups ?? [], groupById);
        if (!ok) {
          await load();
          return false;
        }
        await load({ silent: true });
        await broadcastRosterChange();
        return true;
      }
      let { data, error: insertError } = await supabase
        .from("entity_members")
        .insert(payload)
        .select(includePhone ? MEMBER_SELECT_WITH_PHONE : MEMBER_SELECT)
        .single();
      if (insertError && includePhone && isMissingPhoneColumnError(insertError)) {
        phoneColumnSupportedRef.current = false;
        payload = buildMemberPayload(teamId, row, false);
        ({ data, error: insertError } = await supabase
          .from("entity_members")
          .insert(payload)
          .select(MEMBER_SELECT)
          .single());
      }
      if (insertError || !data) {
        console.error("[useEntityRoster] saveMember", insertError?.message);
        setError(insertError?.message ?? "Could not save member");
        return false;
      }
      const memberId = (data as DbMember).id;
      const ok = await syncMemberGroups(memberId, row.groups ?? [], groupById);
      if (!ok) {
        await load();
        return false;
      }
      await load({ silent: true });
      await broadcastRosterChange();
      return true;
    },
    [teamId, groups, members, load, broadcastRosterChange],
  );

  const deleteMembers = useCallback(
    async (ids: string[]): Promise<boolean> => {
      if (!teamId || ids.length === 0) return true;
      await supabase.from("entity_member_groups").delete().in("member_id", ids);
      const { error: cancelError } = await supabase
        .from("entity_members")
        .update({ status: "inactive", cancelled_at: new Date().toISOString() })
        .in("id", ids);
      if (cancelError) {
        const { error: deleteError } = await supabase.from("entity_members").delete().in("id", ids);
        if (deleteError) {
          console.error("[useEntityRoster] deleteMembers", deleteError.message);
          setError(deleteError.message);
          await load();
          return false;
        }
      }
      setMembers((prev) => prev.filter((m) => !ids.includes(m.id)));
      await broadcastRosterChange();
      return true;
    },
    [teamId, load, broadcastRosterChange],
  );

  const sendTeamInvite = useCallback(
    async (email: string, role: "admin" | "member"): Promise<boolean> => {
      if (!teamId) return false;
      const normalized = email.trim().toLowerCase();
      if (!normalized) return false;
      const { data, error } = await supabase.functions.invoke("mobile-team-invite", {
        body: { team_id: teamId, email: normalized, role },
      });
      const payload = data as { error?: string; ok?: boolean } | null;
      if (error || payload?.error) {
        const msg = payload?.error ?? error?.message ?? "Could not send invite";
        console.error("[useEntityRoster] sendTeamInvite", msg);
        setError(msg);
        return false;
      }
      return true;
    },
    [teamId],
  );

  const inviteAdministrator = useCallback(
    async (
      row: EntityAdministrator,
      options?: { withGroups?: boolean },
    ): Promise<boolean> => {
      const email = row.email.trim();
      if (!email) return false;
      setError(null);
      const withGroups = options?.withGroups !== false;
      const saveRow = withGroups
        ? row
        : { ...row, groups: [], group: "" };
      const ok = await saveAdministrator(saveRow);
      if (!ok) return false;
      const invited = await sendTeamInvite(email, "admin");
      if (!invited) {
        await load({ silent: true });
        return false;
      }
      await load({ silent: true });
      await broadcastRosterChange();
      return true;
    },
    [saveAdministrator, sendTeamInvite, load, broadcastRosterChange],
  );

  const inviteMember = useCallback(
    async (row: EntityMember, options?: { withGroups?: boolean }): Promise<boolean> => {
      const email = row.email.trim();
      if (!email) return false;
      setError(null);
      const withGroups = options?.withGroups !== false;
      const saveRow = withGroups
        ? row
        : { ...row, groups: [], group: "" };
      const ok = await saveMember(saveRow);
      if (!ok) return false;
      const invited = await sendTeamInvite(email, "member");
      if (!invited) {
        await load({ silent: true });
        return false;
      }
      await load({ silent: true });
      await broadcastRosterChange();
      return true;
    },
    [saveMember, sendTeamInvite, load, broadcastRosterChange],
  );

  /** Immediate UI update for group membership (drag-and-drop); persist separately. */
  const patchPersonGroups = useCallback(
    (
      kind: "admin" | "member",
      personId: string,
      nextGroups: EntityMemberGroupRow[],
    ) => {
      const label = nextGroups.map((g) => g.name).filter(Boolean).join(", ");
      if (kind === "admin") {
        setAdmins((prev) =>
          prev.map((a) =>
            String(a.id) === String(personId)
              ? { ...a, groups: nextGroups, group: label }
              : a,
          ),
        );
      } else {
        setMembers((prev) =>
          prev.map((m) =>
            String(m.id) === String(personId)
              ? { ...m, groups: nextGroups, group: label }
              : m,
          ),
        );
      }
    },
    [],
  );

  /**
   * Finder-style move of selected person row instances into `targetGroupId`.
   * Patches local state first, then syncs junction tables using current teamId.
   */
  const movePeopleToGroup = useCallback(
    async (rowIds: string[], targetGroupId: string): Promise<boolean> => {
      const teamIdNow = teamIdRef.current;
      const targetGroup = groupsRef.current.find((g) => g.id === targetGroupId);
      if (!teamIdNow || !targetGroup || rowIds.length === 0) {
        console.error("[useEntityRoster] movePeopleToGroup: missing team/target", {
          teamIdNow,
          targetGroupId,
          rowIds,
        });
        return false;
      }

      const moves = collectMovesFromSelection(rowIds);
      if (moves.length === 0) {
        console.error("[useEntityRoster] movePeopleToGroup: no parseable row ids", rowIds);
        return false;
      }

      type Planned = {
        kind: "admin" | "member";
        personId: string;
        nextGroups: EntityMemberGroupRow[];
      };
      const planned: Planned[] = [];

      for (const move of moves) {
        if (move.kind === "admin") {
          const admin = adminsRef.current.find(
            (a) => String(a.id) === String(move.personId),
          );
          if (!admin) {
            console.error("[useEntityRoster] movePeopleToGroup: admin not found", move.personId);
            continue;
          }
          const nextGroups = applyPersonGroupMove({
            groups: admin.groups,
            fromGroupIds: move.fromGroupIds,
            targetGroup,
          });
          if (personGroupSetsEqual(admin.groups, nextGroups)) continue;
          planned.push({ kind: "admin", personId: admin.id, nextGroups });
        } else {
          const member = membersRef.current.find(
            (m) => String(m.id) === String(move.personId),
          );
          if (!member) {
            console.error("[useEntityRoster] movePeopleToGroup: member not found", move.personId);
            continue;
          }
          const nextGroups = applyPersonGroupMove({
            groups: member.groups,
            fromGroupIds: move.fromGroupIds,
            targetGroup,
          });
          if (personGroupSetsEqual(member.groups, nextGroups)) continue;
          planned.push({ kind: "member", personId: member.id, nextGroups });
        }
      }

      if (planned.length === 0) {
        console.error("[useEntityRoster] movePeopleToGroup: nothing to change", {
          rowIds,
          targetGroupId,
          moves: moves.map((m) => ({
            kind: m.kind,
            personId: m.personId,
            from: [...m.fromGroupIds],
          })),
        });
        return false;
      }

      for (const item of planned) {
        patchPersonGroups(item.kind, item.personId, item.nextGroups);
      }

      const groupById = new Map(groupsRef.current.map((g) => [g.id, g]));
      for (const item of planned) {
        const ok =
          item.kind === "admin"
            ? await syncAdminGroupsRef.current(item.personId, item.nextGroups)
            : await syncMemberGroupsRef.current(
                item.personId,
                item.nextGroups,
                groupById,
              );
        if (!ok) {
          console.error("[useEntityRoster] movePeopleToGroup: sync failed", item);
          await load();
          return false;
        }
      }

      await broadcastRosterChange();
      return true;
    },
    [patchPersonGroups, load, broadcastRosterChange],
  );

  return {
    admins,
    groups,
    members,
    loading,
    error,
    reload: load,
    saveAdministrator,
    inviteAdministrator,
    deleteAdministrators,
    saveGroup,
    addGroup,
    deleteGroups,
    rehomeGroupPeople,
    reorderGroups,
    saveMember,
    inviteMember,
    deleteMembers,
    patchPersonGroups,
    movePeopleToGroup,
  };
}

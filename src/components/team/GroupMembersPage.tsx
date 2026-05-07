import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Search, UsersRound } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { useIsGroupLeader } from "@/hooks/useIsGroupLeader";
import { supabase } from "@/integrations/supabase/client";

interface MemberRow {
  user_id: string;
  group_id: string;
  group_name: string;
  first_name: string | null;
  last_name: string | null;
  avatar_url: string | null;
  email: string | null;
}

export function GroupMembersPage() {
  const { user, mode, activeEntityId, loading: authLoading } = useAuth();
  const isGroupLeader = useIsGroupLeader();
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [members, setMembers] = useState<MemberRow[]>([]);
  const [loading, setLoading] = useState(false);

  const isTeamMode = mode === "team" || mode === "organizer" || !!activeEntityId;

  useEffect(() => {
    if (!authLoading && !user) navigate({ to: "/auth" });
  }, [authLoading, user, navigate]);

  useEffect(() => {
    if (!user || !isGroupLeader) return;
    let cancelled = false;
    void (async () => {
      setLoading(true);
      const email = (user.email ?? "").toLowerCase();
      // 1. Find leader records for this user → which (team_id, group_id) groups they lead.
      const orFilter = email
        ? `user_id.eq.${user.id},email.ilike.${email}`
        : `user_id.eq.${user.id}`;
      const { data: leaderRows } = await supabase
        .from("team_group_leaders")
        .select("team_id, group_id, group_name")
        .or(orFilter);

      const groupIds = Array.from(
        new Set((leaderRows ?? []).map((r) => r.group_id).filter((x): x is string => !!x)),
      );
      if (groupIds.length === 0) {
        if (!cancelled) { setMembers([]); setLoading(false); }
        return;
      }

      // 2. Group names (for display).
      const { data: groupsData } = await supabase
        .from("team_groups")
        .select("id, name")
        .in("id", groupIds);
      const groupNameById = new Map<string, string>(
        (groupsData ?? []).map((g) => [g.id as string, (g.name as string) ?? ""]),
      );

      // 3. Members of those groups.
      const { data: memberRows } = await supabase
        .from("team_group_members")
        .select("user_id, group_id")
        .in("group_id", groupIds);

      const userIds = Array.from(new Set((memberRows ?? []).map((r) => r.user_id as string)));
      if (userIds.length === 0) {
        if (!cancelled) { setMembers([]); setLoading(false); }
        return;
      }

      // 4. Profile info for each member (includes the leader themselves if they're also a member).
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, first_name, last_name, avatar_url, email")
        .in("id", userIds);
      const profileById = new Map(
        (profiles ?? []).map((p) => [p.id as string, p]),
      );

      const rows: MemberRow[] = (memberRows ?? []).map((m) => {
        const p = profileById.get(m.user_id as string);
        return {
          user_id: m.user_id as string,
          group_id: m.group_id as string,
          group_name: groupNameById.get(m.group_id as string) ?? "",
          first_name: (p?.first_name as string) ?? null,
          last_name: (p?.last_name as string) ?? null,
          avatar_url: (p?.avatar_url as string) ?? null,
          email: (p?.email as string) ?? null,
        };
      });

      if (!cancelled) {
        setMembers(rows);
        setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [user, isGroupLeader]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return members;
    return members.filter((m) => {
      const name = `${m.first_name ?? ""} ${m.last_name ?? ""}`.trim().toLowerCase();
      return name.includes(q) || (m.email ?? "").toLowerCase().includes(q);
    });
  }, [members, query]);

  if (!user) return null;
  if (!isTeamMode || !isGroupLeader) {
    return (
      <div className="px-6 py-16 text-center text-sm text-muted-foreground">
        Group Members are available to group leaders only.
      </div>
    );
  }

  return (
    <div className="px-4 md:px-6">
      <div className="sticky top-14 z-20 -mx-4 flex items-end gap-0 border-b border-hairline bg-background pl-4 pr-4 md:-mx-6 md:pl-6 md:pr-6">
        <button
          className="-mb-px inline-flex shrink-0 select-none items-center gap-1.5 border-b-2 border-primary py-2.5 pl-0 pr-4 text-sm font-medium text-ink"
          style={{ width: 220, justifyContent: "flex-start" }}
          title="Group members"
        >
          <UsersRound className="h-3.5 w-3.5 opacity-70" strokeWidth={2.25} />
          <span>Group members</span>
        </button>
      </div>

      <div className="grid gap-6 pt-4 md:grid-cols-[220px_1fr]">
        <aside className="md:sticky md:top-28 md:self-start">
          <div className="flex flex-col gap-3">
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search members"
                className="h-9 w-full rounded-md border border-hairline bg-transparent pl-8 pr-3 text-sm outline-none placeholder:text-muted-foreground focus:border-ink/30"
              />
            </div>
            <div className="flex flex-col gap-0.5">
              {loading && (
                <div className="px-3 py-2 text-xs text-muted-foreground">Loading…</div>
              )}
              {!loading && filtered.length === 0 && (
                <div className="px-3 py-2 text-xs text-muted-foreground">No members yet.</div>
              )}
              {filtered.map((m) => {
                const name = `${m.first_name ?? ""} ${m.last_name ?? ""}`.trim() || m.email || "Unnamed";
                return (
                  <button
                    key={`${m.group_id}-${m.user_id}`}
                    className="flex items-center gap-2 rounded-md px-3 py-1.5 text-left text-sm text-ink transition hover:bg-secondary/60"
                    title={name}
                  >
                    {m.avatar_url ? (
                      <img src={m.avatar_url} alt="" className="h-6 w-6 shrink-0 rounded-full object-cover" />
                    ) : (
                      <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-secondary text-[10px] uppercase text-muted-foreground">
                        {name.slice(0, 1)}
                      </span>
                    )}
                    <span className="min-w-0 flex-1 truncate">{name}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </aside>
        <div className="min-w-0 px-2 py-12 text-sm text-muted-foreground">
          Select a member to view their data.
        </div>
      </div>
    </div>
  );
}

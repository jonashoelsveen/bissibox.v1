import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { ArrowUpRight, Search, UsersRound, X } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { useIsGroupLeader } from "@/hooks/useIsGroupLeader";
import { supabase } from "@/integrations/supabase/client";
import { MemberWorkspace } from "./MemberWorkspace";

interface MemberRow {
  user_id: string;
  group_id: string;
  group_name: string;
  first_name: string | null;
  last_name: string | null;
  avatar_url: string | null;
  email: string | null;
}

interface OpenMemberTab {
  user_id: string;
  group_id: string;
  name: string;
  avatar_url: string | null;
}

const MAX_TABS = 10;

export function GroupMembersPage() {
  const { user, mode, activeEntityId, loading: authLoading } = useAuth();
  const isGroupLeader = useIsGroupLeader();
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [members, setMembers] = useState<MemberRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [openTabs, setOpenTabs] = useState<OpenMemberTab[]>([]);
  const [activeMemberId, setActiveMemberId] = useState<string | null>(null);

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

      const { data: groupsData } = await supabase
        .from("team_groups")
        .select("id, name")
        .in("id", groupIds);
      const groupNameById = new Map<string, string>(
        (groupsData ?? []).map((g) => [g.id as string, (g.name as string) ?? ""]),
      );

      const { data: memberRows } = await supabase
        .from("team_group_members")
        .select("user_id, group_id")
        .in("group_id", groupIds);

      const userIds = Array.from(new Set((memberRows ?? []).map((r) => r.user_id as string)));
      if (userIds.length === 0) {
        if (!cancelled) { setMembers([]); setLoading(false); }
        return;
      }

      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, first_name, last_name, avatar_url, email")
        .in("id", userIds);
      const profileById = new Map((profiles ?? []).map((p) => [p.id as string, p]));

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

  const memberName = (m: MemberRow) =>
    `${m.first_name ?? ""} ${m.last_name ?? ""}`.trim() || m.email || "Unnamed";

  const openMemberTab = (m: MemberRow) => {
    setOpenTabs((prev) => {
      if (prev.some((t) => t.user_id === m.user_id)) return prev;
      if (prev.length >= MAX_TABS) return prev;
      return [...prev, {
        user_id: m.user_id,
        group_id: m.group_id,
        name: memberName(m),
        avatar_url: m.avatar_url,
      }];
    });
    setActiveMemberId(m.user_id);
  };

  const closeMemberTab = (id: string) => {
    setOpenTabs((prev) => {
      const idx = prev.findIndex((t) => t.user_id === id);
      const next = prev.filter((t) => t.user_id !== id);
      if (activeMemberId === id) {
        if (next.length === 0) setActiveMemberId(null);
        else setActiveMemberId(next[Math.max(0, idx - 1)].user_id);
      }
      return next;
    });
  };

  /* ----- tab DnD (replica of /map) ----- */
  const tabStripRef = useRef<HTMLDivElement | null>(null);
  const tabRefs = useRef<Map<string, HTMLButtonElement>>(new Map());
  const [dragId, setDragId] = useState<string | null>(null);
  const [dragDx, setDragDx] = useState(0);
  const dragStateRef = useRef<{
    id: string;
    startX: number;
    startIndex: number;
    currentIndex: number;
    width: number;
    offsets: number[];
    moved: boolean;
  } | null>(null);
  const flipRef = useRef<{ id: string; fromLeft: number } | null>(null);
  const [edgeFade, setEdgeFade] = useState({ left: false, right: false });
  const updateEdgeFade = useCallback(() => {
    const el = tabStripRef.current;
    if (!el) return;
    setEdgeFade({
      left: el.scrollLeft > 2,
      right: el.scrollLeft + el.clientWidth < el.scrollWidth - 2,
    });
  }, []);
  useEffect(() => {
    updateEdgeFade();
  }, [openTabs, updateEdgeFade]);
  useLayoutEffect(() => {
    const flip = flipRef.current;
    if (!flip) return;
    flipRef.current = null;
    const el = tabRefs.current.get(flip.id);
    if (!el) return;
    const newLeft = el.getBoundingClientRect().left;
    const delta = flip.fromLeft - newLeft;
    if (Math.abs(delta) < 0.5) return;
    el.style.transition = "none";
    el.style.transform = `translate3d(${delta}px,0,0)`;
    void el.offsetWidth;
    el.style.transition = "transform 220ms cubic-bezier(0.2, 0.8, 0.2, 1)";
    el.style.transform = "translate3d(0,0,0)";
    const cleanup = () => {
      el.style.transition = "";
      el.style.transform = "";
      el.removeEventListener("transitionend", cleanup);
    };
    el.addEventListener("transitionend", cleanup);
  });

  const onTabPointerDown = (e: React.PointerEvent<HTMLButtonElement>, id: string) => {
    if (e.button !== 0) return;
    const target = e.target as HTMLElement;
    if (target.closest("[data-tab-close]")) return;
    setActiveMemberId(id);
    const strip = tabStripRef.current;
    if (!strip) return;
    const arr = openTabs;
    const startIndex = arr.findIndex((t) => t.user_id === id);
    if (startIndex < 0) return;
    const buttons = arr
      .map((t) => tabRefs.current.get(t.user_id))
      .filter((b): b is HTMLButtonElement => !!b);
    if (buttons.length !== arr.length) return;
    const stripRect = strip.getBoundingClientRect();
    const offsets = buttons.map(
      (b) => b.getBoundingClientRect().left - stripRect.left + strip.scrollLeft,
    );
    const width = buttons[startIndex].getBoundingClientRect().width;
    dragStateRef.current = {
      id, startX: e.clientX, startIndex, currentIndex: startIndex, width, offsets, moved: false,
    };
    const onMove = (ev: PointerEvent) => {
      const st = dragStateRef.current;
      if (!st) return;
      const dx = ev.clientX - st.startX;
      if (!st.moved && Math.abs(dx) < 4) return;
      st.moved = true;
      if (dragId !== st.id) setDragId(st.id);
      setDragDx(dx);
      const stripEl = tabStripRef.current;
      if (!stripEl) return;
      const pointerX = ev.clientX - stripEl.getBoundingClientRect().left + stripEl.scrollLeft;
      let newIdx = 0;
      for (let i = 0; i < st.offsets.length; i++) {
        const mid = st.offsets[i] + st.width / 2;
        if (pointerX < mid) { newIdx = i; break; }
        newIdx = i;
      }
      if (newIdx !== st.currentIndex) st.currentIndex = newIdx;
    };
    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
      const st = dragStateRef.current;
      dragStateRef.current = null;
      const willReorder = !!(st && st.moved && st.currentIndex !== st.startIndex);
      if (willReorder && st) {
        const el = tabRefs.current.get(st.id);
        if (el) flipRef.current = { id: st.id, fromLeft: el.getBoundingClientRect().left };
        setOpenTabs((prev) => {
          const next = prev.slice();
          const [m] = next.splice(st.startIndex, 1);
          next.splice(st.currentIndex, 0, m);
          return next;
        });
      }
      setDragId(null);
      setDragDx(0);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
  };

  if (!user) return null;
  if (!isTeamMode || !isGroupLeader) {
    return (
      <div className="px-6 py-16 text-center text-sm text-muted-foreground">
        Group Members are available to group leaders only.
      </div>
    );
  }

  const activeTab = activeMemberId
    ? openTabs.find((t) => t.user_id === activeMemberId) ?? null
    : null;

  return (
    <div className="px-4 md:px-6">
      {/* Sticky horizontal tab bar */}
      <div className="sticky top-14 z-20 -mx-4 flex items-end justify-between gap-0 border-b border-hairline bg-background pl-4 pr-4 md:-mx-6 md:pl-6 md:pr-6">
        <button
          onClick={() => setActiveMemberId(null)}
          className={`-mb-px inline-flex shrink-0 select-none items-center gap-1.5 border-b-2 py-2.5 pl-0 pr-4 text-sm font-medium ${
            activeTab
              ? "border-transparent text-muted-foreground hover:text-ink"
              : "border-primary text-ink"
          }`}
          style={{ width: 220, justifyContent: "flex-start" }}
          title="Group members"
        >
          <UsersRound className="h-3.5 w-3.5 opacity-70" strokeWidth={2.25} />
          <span>Group members</span>
        </button>
        <NavIconTabs activeKey="group-members" />
        <nav className="flex min-w-0 flex-1 items-end overflow-hidden pl-2">
          {openTabs.length > 0 && (
            <div className="relative min-w-0 flex-1">
              {edgeFade.left && (
                <div className="pointer-events-none absolute inset-y-0 left-0 z-10 w-6 bg-gradient-to-r from-background to-transparent" />
              )}
              {edgeFade.right && (
                <div className="pointer-events-none absolute inset-y-0 right-0 z-10 w-6 bg-gradient-to-l from-background to-transparent" />
              )}
              <div
                ref={tabStripRef}
                onScroll={updateEdgeFade}
                className="flex min-w-0 items-end overflow-x-auto overflow-y-hidden whitespace-nowrap [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
                style={{ scrollBehavior: "smooth" }}
              >
                {openTabs.map((t, idx) => {
                  const isActive = activeMemberId === t.user_id;
                  const colorActive = "border-muted-foreground text-ink";
                  const colorIdle = "border-transparent text-muted-foreground hover:text-ink";
                  const isDragging = dragId === t.user_id;
                  let translateX = 0;
                  if (dragId && !isDragging) {
                    const st = dragStateRef.current;
                    if (st) {
                      const from = st.startIndex;
                      const to = st.currentIndex;
                      if (to > from && idx > from && idx <= to) translateX = -st.width;
                      else if (to < from && idx >= to && idx < from) translateX = st.width;
                    }
                  }
                  const dragStyle: React.CSSProperties = isDragging
                    ? { transform: `translate3d(${dragDx}px,0,0)`, transition: "none", zIndex: 5 }
                    : { transform: `translate3d(${translateX}px,0,0)` };
                  return (
                    <button
                      key={t.user_id}
                      ref={(el) => {
                        if (el) tabRefs.current.set(t.user_id, el);
                        else tabRefs.current.delete(t.user_id);
                      }}
                      onPointerDown={(e) => onTabPointerDown(e, t.user_id)}
                      onClick={() => setActiveMemberId(t.user_id)}
                      style={{
                        flex: "1 1 200px",
                        minWidth: 140,
                        maxWidth: 240,
                        touchAction: "pan-y",
                        ...dragStyle,
                        transition: isDragging
                          ? "none"
                          : dragId
                            ? "transform 180ms cubic-bezier(0.2, 0.8, 0.2, 1), color 150ms, border-color 150ms"
                            : "color 150ms, border-color 150ms",
                      }}
                      className={`group -mb-px inline-flex shrink-0 select-none items-center gap-1.5 border-b-2 px-3 py-2.5 text-sm ${
                        isActive ? colorActive : colorIdle
                      }`}
                      title={t.name}
                    >
                      {t.avatar_url ? (
                        <img src={t.avatar_url} alt="" className="h-3.5 w-3.5 shrink-0 rounded-full object-cover" />
                      ) : (
                        <span className="grid h-3.5 w-3.5 shrink-0 place-items-center rounded-full bg-secondary text-[8px] uppercase text-muted-foreground">
                          {t.name.slice(0, 1)}
                        </span>
                      )}
                      <span className="min-w-0 flex-1 truncate text-left">{t.name}</span>
                      <span
                        data-tab-close
                        role="button"
                        tabIndex={0}
                        onPointerDown={(e) => e.stopPropagation()}
                        onClick={(e) => {
                          e.stopPropagation();
                          closeMemberTab(t.user_id);
                        }}
                        className="ml-1 shrink-0 rounded px-1 text-xs opacity-60 hover:opacity-100"
                      >
                        ✕
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </nav>
      </div>

      <div className="grid gap-6 pt-4 md:grid-cols-[200px_1fr]">
        <aside className="md:sticky md:top-28 md:self-start">
          <div className="flex flex-col gap-2">
            <div className="relative">
              <Search className="pointer-events-none absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-muted-foreground" />
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search members"
                className="h-7 w-full rounded-md border border-hairline bg-transparent pl-7 pr-2 text-xs outline-none placeholder:text-muted-foreground focus:border-ink/30"
              />
            </div>
            <div className="flex flex-col gap-0.5">
              {loading && (
                <div className="px-2 py-1.5 text-[11px] text-muted-foreground">Loading…</div>
              )}
              {!loading && filtered.length === 0 && (
                <div className="px-2 py-1.5 text-[11px] text-muted-foreground">No members yet.</div>
              )}
              {filtered.map((m) => {
                const name = memberName(m);
                return (
                  <div
                    key={`${m.group_id}-${m.user_id}`}
                    className="group flex items-center gap-1.5 rounded-md px-2 py-1 text-left text-xs text-ink transition hover:bg-secondary/60"
                    title={name}
                  >
                    {m.avatar_url ? (
                      <img src={m.avatar_url} alt="" className="h-5 w-5 shrink-0 rounded-full object-cover" />
                    ) : (
                      <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-secondary text-[9px] uppercase text-muted-foreground">
                        {name.slice(0, 1)}
                      </span>
                    )}
                    <span className="min-w-0 flex-1 truncate">{name}</span>
                    <button
                      onClick={() => openMemberTab(m)}
                      aria-label={`Open ${name}`}
                      title="Open as tab"
                      className="grid h-5 w-5 shrink-0 place-items-center rounded text-muted-foreground opacity-0 transition hover:bg-secondary hover:text-ink group-hover:opacity-100"
                    >
                      <ArrowUpRight className="h-3 w-3" strokeWidth={2.25} />
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        </aside>
        <div className="min-w-0">
          {activeTab ? (
            <MemberWorkspace
              key={activeTab.user_id}
              userId={activeTab.user_id}
              name={activeTab.name}
            />
          ) : (
            <div className="px-2 py-12 text-sm text-muted-foreground">
              Select a member to view their data.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

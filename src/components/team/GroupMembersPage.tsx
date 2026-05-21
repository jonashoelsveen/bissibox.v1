import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";

import { useNavigate } from "@tanstack/react-router";
import { Search } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { useIsGroupLeader } from "@/hooks/useIsGroupLeader";
import { TopBarSlot } from "@/components/TopBarSlot";
import { useGroupMembers, memberDisplayName, type GroupMemberRow } from "@/hooks/useGroupMembers";
import { MemberWorkspace } from "./MemberWorkspace";

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
  const { members, loading } = useGroupMembers();
  const [openTabs, setOpenTabs] = useState<OpenMemberTab[]>([]);
  const [activeMemberId, setActiveMemberId] = useState<string | null>(null);
  // Member selected in the left list (single-click) — shows the info pane on
  // the right without opening a tab.
  const [selectedMemberId, setSelectedMemberId] = useState<string | null>(null);

  const isTeamMode = mode === "team" || mode === "organizer" || !!activeEntityId;

  useEffect(() => {
    if (!authLoading && !user) navigate({ to: "/auth" });
  }, [authLoading, user, navigate]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return members;
    return members.filter((m) => {
      const name = memberDisplayName(m).toLowerCase();
      return name.includes(q) || (m.email ?? "").toLowerCase().includes(q);
    });
  }, [members, query]);

  const openMemberTab = useCallback((m: { user_id: string; group_id: string; name: string; avatar_url: string | null }) => {
    setOpenTabs((prev) => {
      if (prev.some((t) => t.user_id === m.user_id)) return prev;
      if (prev.length >= MAX_TABS) return prev;
      return [...prev, m];
    });
    setActiveMemberId(m.user_id);
  }, []);

  /* Listen for "open from hover menu" events. */
  useEffect(() => {
    const onOpen = (e: Event) => {
      const detail = (e as CustomEvent).detail as {
        user_id: string; group_id: string; name: string; avatar_url: string | null;
      } | undefined;
      if (!detail) return;
      openMemberTab(detail);
    };
    window.addEventListener("group-member:open", onOpen);
    return () => window.removeEventListener("group-member:open", onOpen);
  }, [openMemberTab]);

  const openMemberFromRow = (m: GroupMemberRow) =>
    openMemberTab({
      user_id: m.user_id,
      group_id: m.group_id,
      name: memberDisplayName(m),
      avatar_url: m.avatar_url,
    });

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

  const selectedMember = selectedMemberId
    ? members.find((m) => m.user_id === selectedMemberId) ?? null
    : null;

  const tabStrip = (
    <TopBarSlot>
      <nav className="flex min-w-0 flex-1 items-end overflow-hidden">
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
    </TopBarSlot>
  );

  /* ----- When a member tab is active, render the full MemberWorkspace
       (which provides its own calendar/diary left rail). ----- */
  if (activeTab) {
    return (
      <div className="h-full overflow-hidden bg-white">
        {tabStrip}
        <MemberWorkspace
          key={activeTab.user_id}
          userId={activeTab.user_id}
          name={activeTab.name}
        />
      </div>
    );
  }

  /* ----- Default: members list on the left, info pane on the right. ----- */
  return (
    <div className="h-full overflow-hidden bg-white">
      {tabStrip}
      <div
        className="grid h-full overflow-hidden"
        style={{ gridTemplateColumns: "256px 1fr" }}
      >
        <aside className="relative md:h-full overflow-hidden">
          <div className="relative h-full pl-2 pr-2 py-2">
            <div className="relative h-full overflow-hidden rounded-lg border border-hairline bg-subtle shadow-sm">
              <div className="h-full overflow-y-auto px-3 pb-6 pt-3">
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
                      const name = memberDisplayName(m);
                      const isSelected = selectedMemberId === m.user_id;
                      return (
                        <button
                          key={`${m.group_id}-${m.user_id}`}
                          type="button"
                          onClick={() => setSelectedMemberId(m.user_id)}
                          onDoubleClick={() => openMemberFromRow(m)}
                          className={`group flex items-center gap-1.5 rounded-md px-2 py-1 text-left text-xs text-ink transition ${
                            isSelected ? "bg-secondary" : "hover:bg-secondary/60"
                          }`}
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
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
              <div className="pointer-events-none absolute inset-x-0 bottom-0 h-10 rounded-b-lg bg-gradient-to-t from-subtle to-transparent" />
            </div>
          </div>
        </aside>

        <div className="min-w-0 md:h-full md:overflow-y-auto">
          {selectedMember ? (
            <MemberInfoPlaceholder member={selectedMember} />
          ) : (
            <div className="px-6 py-12 text-sm text-muted-foreground">
              Select a member to see their information. Double-click to open as a tab.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function MemberInfoPlaceholder({ member }: { member: GroupMemberRow }) {
  const name = memberDisplayName(member);
  return (
    <div className="flex h-full flex-col px-8 py-10">
      <div className="flex items-center gap-4">
        {member.avatar_url ? (
          <img src={member.avatar_url} alt="" className="h-16 w-16 rounded-full object-cover" />
        ) : (
          <span className="grid h-16 w-16 place-items-center rounded-full bg-secondary text-lg uppercase text-muted-foreground">
            {name.slice(0, 1)}
          </span>
        )}
        <div className="min-w-0">
          <div className="truncate text-xl font-semibold text-ink">{name}</div>
          {member.email && (
            <div className="truncate text-xs text-muted-foreground">{member.email}</div>
          )}
          {member.group_name && (
            <div className="mt-1 text-[11px] uppercase tracking-wide text-muted-foreground/70">
              {member.group_name}
            </div>
          )}
        </div>
      </div>
      <div className="mt-10 rounded-lg border border-dashed border-hairline bg-card/40 px-6 py-12 text-center text-sm text-muted-foreground">
        Member information page coming soon.
      </div>
    </div>
  );
}

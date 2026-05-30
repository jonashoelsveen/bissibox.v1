import {
  Fragment,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { useNavigate } from "@tanstack/react-router";
import { ArrowUp, PanelRight, Plus, Search, User as UserIcon } from "lucide-react";
import { GroupMemberHoverMenu } from "@/components/team/GroupMemberHoverMenu";
import { useAuth } from "@/lib/auth";
import { useIsGroupLeader } from "@/hooks/useIsGroupLeader";
import { useLibrarySetting } from "@/lib/library-settings";
import { TopBarSlot } from "@/components/TopBarSlot";
import {
  useGroupMembers,
  memberDisplayName,
  type GroupMemberRow,
} from "@/hooks/useGroupMembers";
import { MemberWorkspace } from "./MemberWorkspace";

interface OpenClientTab {
  user_id: string;
  group_id: string;
  name: string;
  avatar_url: string | null;
}

const MAX_TABS = 10;

export function ClientsPage() {
  const { user, loading: authLoading } = useAuth();
  const isGroupLeader = useIsGroupLeader();
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const { members, loading } = useGroupMembers();
  const [openTabs, setOpenTabs] = useState<OpenClientTab[]>([]);
  const [activeClientId, setActiveClientId] = useState<string | null>(null);
  const [selectedClientId, setSelectedClientId] = useState<string | null>(null);

  const panelScopeKey = user?.id ?? "anon";
  const [panelOpen, setPanelOpen] = useLibrarySetting<boolean>(
    `clients:panel:open:${panelScopeKey}`,
    true,
  );

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

  const openClientTab = useCallback(
    (m: { user_id: string; group_id: string; name: string; avatar_url: string | null }) => {
      setOpenTabs((prev) => {
        if (prev.some((t) => t.user_id === m.user_id)) return prev;
        if (prev.length >= MAX_TABS) return prev;
        return [...prev, m];
      });
      setActiveClientId(m.user_id);
      setSelectedClientId(null);
    },
    [],
  );

  /* Reuse the same hover-menu open event so the group-members icon's
   * hover menu can also pin a client to the top tab-bar. */
  useEffect(() => {
    const onOpen = (e: Event) => {
      const detail = (e as CustomEvent).detail as
        | { user_id: string; group_id: string; name: string; avatar_url: string | null }
        | undefined;
      if (!detail) return;
      openClientTab(detail);
    };
    const onShowList = () => {
      setActiveClientId(null);
      setSelectedClientId(null);
      setPanelOpen(true);
    };
    window.addEventListener("group-member:open", onOpen);
    window.addEventListener("group-members:show-list", onShowList);
    return () => {
      window.removeEventListener("group-member:open", onOpen);
      window.removeEventListener("group-members:show-list", onShowList);
    };
  }, [openClientTab, setPanelOpen]);

  const pinClientFromRow = (m: GroupMemberRow) =>
    openClientTab({
      user_id: m.user_id,
      group_id: m.group_id,
      name: memberDisplayName(m),
      avatar_url: m.avatar_url,
    });

  const [closingIds, setClosingIds] = useState<Set<string>>(() => new Set());
  const closeClientTab = (id: string) => {
    if (closingIds.has(id)) return;
    setClosingIds((prev) => {
      const next = new Set(prev);
      next.add(id);
      return next;
    });
    window.setTimeout(() => {
      setOpenTabs((prev) => {
        const idx = prev.findIndex((t) => t.user_id === id);
        const next = prev.filter((t) => t.user_id !== id);
        if (activeClientId === id) {
          if (next.length === 0) setActiveClientId(null);
          else setActiveClientId(next[Math.max(0, idx - 1)].user_id);
        }
        return next;
      });
      setClosingIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }, 180);
  };

  /* ----- tab DnD (matches GroupMembersPage) ----- */
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
    setActiveClientId(id);
    setSelectedClientId(null);
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
      id,
      startX: e.clientX,
      startIndex,
      currentIndex: startIndex,
      width,
      offsets,
      moved: false,
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
        if (pointerX < mid) {
          newIdx = i;
          break;
        }
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


  const activeTab = activeClientId
    ? openTabs.find((t) => t.user_id === activeClientId) ?? null
    : null;
  const selectedClient = selectedClientId
    ? members.find((m) => m.user_id === selectedClientId) ?? null
    : null;

  /* ===== Top-tab strip — same visual family as other surfaces. ===== */
  const tabStrip = (
    <TopBarSlot>
      <nav className="flex min-w-0 flex-1 items-end overflow-hidden">
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
                const isActive = activeClientId === t.user_id;
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

                const next = openTabs[idx + 1];
                const nextIsActive = next ? activeClientId === next.user_id : false;
                const isClosing = closingIds.has(t.user_id);
                const showDivider =
                  idx < openTabs.length - 1 && !isActive && !nextIsActive && !isClosing;

                const baseStyle: React.CSSProperties = isClosing
                  ? {
                      flex: "0 0 0px",
                      minWidth: 0,
                      maxWidth: 0,
                      height: 38,
                      marginRight: 0,
                      padding: 0,
                      marginBottom: -1,
                      paddingBottom: 1,
                      overflow: "hidden",
                      opacity: 0,
                      pointerEvents: "none",
                      transition:
                        "flex-basis 180ms cubic-bezier(0.2,0.8,0.2,1), min-width 180ms cubic-bezier(0.2,0.8,0.2,1), max-width 180ms cubic-bezier(0.2,0.8,0.2,1), margin 180ms cubic-bezier(0.2,0.8,0.2,1), padding 180ms cubic-bezier(0.2,0.8,0.2,1), opacity 140ms ease-out",
                    }
                  : {
                      flex: "0 1 200px",
                      minWidth: 140,
                      maxWidth: 220,
                      height: 38,
                      marginRight: 4,
                      background: "transparent",
                      padding: "0 28px 0 12px",
                      marginBottom: -1,
                      paddingBottom: 1,
                      touchAction: "pan-y",
                      ...dragStyle,
                      transition: isDragging
                        ? "none"
                        : dragId
                          ? "transform 180ms cubic-bezier(0.2, 0.8, 0.2, 1), color 150ms"
                          : "flex-basis 180ms cubic-bezier(0.2,0.8,0.2,1), max-width 180ms cubic-bezier(0.2,0.8,0.2,1), color 150ms",
                    };

                return (
                  <Fragment key={t.user_id}>
                    <button
                      data-tab
                      data-active-tab={isActive ? "" : undefined}
                      ref={(el) => {
                        if (el) tabRefs.current.set(t.user_id, el);
                        else tabRefs.current.delete(t.user_id);
                      }}
                      onPointerDown={(e) => onTabPointerDown(e, t.user_id)}
                      style={baseStyle}
                      className={`group relative inline-flex shrink-0 select-none items-center gap-1.5 text-sm ${
                        isActive ? "" : "rounded-t-[10px]"
                      }`}
                      title={t.name}
                    >
                      {(isActive || isDragging) && (
                        <>
                          <span
                            aria-hidden
                            style={{
                              position: "absolute",
                              top: 0,
                              left: 15,
                              right: 15,
                              bottom: -1,
                              background: "#FFFFFF",
                              pointerEvents: "none",
                              zIndex: 0,
                            }}
                          />
                          <svg
                            aria-hidden
                            width="32"
                            height="39"
                            viewBox="0 0 32 39"
                            style={{
                              position: "absolute",
                              top: 0,
                              left: -16,
                              pointerEvents: "none",
                              zIndex: 0,
                              overflow: "visible",
                              display: "block",
                            }}
                          >
                            <path
                              d="M 0 39 L 0 38 A 16 16 0 0 0 16 22 L 16 8 A 8 8 0 0 1 24 0 L 32 0 L 32 39 Z"
                              fill="#FFFFFF"
                              shapeRendering="geometricPrecision"
                            />
                          </svg>
                          <svg
                            aria-hidden
                            width="32"
                            height="39"
                            viewBox="0 0 32 39"
                            style={{
                              position: "absolute",
                              top: 0,
                              right: -16,
                              pointerEvents: "none",
                              zIndex: 0,
                              overflow: "visible",
                              display: "block",
                            }}
                          >
                            <path
                              d="M 32 39 L 32 38 A 16 16 0 0 1 16 22 L 16 8 A 8 8 0 0 0 8 0 L 0 0 L 0 39 Z"
                              fill="#FFFFFF"
                              shapeRendering="geometricPrecision"
                            />
                          </svg>
                        </>
                      )}
                      {t.avatar_url ? (
                        <img
                          data-folder-icon
                          src={t.avatar_url}
                          alt=""
                          className="relative z-[1] h-3.5 w-3.5 shrink-0 rounded-full object-cover"
                        />
                      ) : (
                        <UserIcon
                          data-folder-icon
                          className="relative z-[1] h-3.5 w-3.5 shrink-0"
                          style={{ color: isActive ? "#111111" : "#ffffff", opacity: 0.85 }}
                        />
                      )}
                      <span
                        className="relative z-[1] min-w-0 flex-1 overflow-hidden whitespace-nowrap text-left"
                        style={{
                          WebkitMaskImage:
                            "linear-gradient(to right, #000 0, #000 calc(100% - 20px), transparent 100%)",
                          maskImage:
                            "linear-gradient(to right, #000 0, #000 calc(100% - 20px), transparent 100%)",
                        }}
                      >
                        {t.name}
                      </span>
                      <span
                        data-tab-close
                        role="button"
                        tabIndex={0}
                        onPointerDown={(e) => e.stopPropagation()}
                        onClick={(e) => {
                          e.stopPropagation();
                          closeClientTab(t.user_id);
                        }}
                        className="absolute right-2 top-1/2 z-[2] -translate-y-1/2 shrink-0 rounded px-1 text-xs opacity-60 hover:opacity-100"
                      >
                        ✕
                      </span>
                    </button>
                    {showDivider && (
                      <span
                        data-tab-divider
                        aria-hidden
                        style={{
                          alignSelf: "center",
                          width: 1,
                          height: 17,
                          marginLeft: -2,
                          marginRight: 1,
                          marginBottom: 4,
                          background: "rgba(255,255,255,0.45)",
                          pointerEvents: "none",
                          flex: "0 0 1px",
                        }}
                      />
                    )}
                  </Fragment>
                );
              })}
              <GroupMemberHoverMenu>
                <a
                  href="/clients"
                  aria-label="New client tab"
                  title="Clients"
                  data-no-divider=""
                  onClick={(e) => {
                    e.preventDefault();
                    if (typeof window !== "undefined") {
                      window.dispatchEvent(new CustomEvent("group-members:show-list"));
                    }
                  }}
                  style={{
                    marginLeft: openTabs.length > 0 ? 2 : 0,
                    marginBottom: 1,
                    transition: "margin-left 180ms cubic-bezier(0.2,0.8,0.2,1)",
                  }}
                  className="flex h-9 w-9 shrink-0 select-none items-center justify-center rounded-md text-muted-foreground/70 hover:text-muted-foreground"
                >
                  <Plus className="h-[18px] w-[18px]" strokeWidth={2.25} />
                </a>
              </GroupMemberHoverMenu>
            </div>
          </div>
      </nav>
    </TopBarSlot>
  );

  const rightPanel = (
    <aside className="relative md:h-full overflow-hidden">
      <div
        className="relative h-full pl-2 pr-2 py-2 transition-transform duration-300 ease-out"
        style={{
          width: 256,
          transform: panelOpen ? "translateX(0)" : "translateX(100%)",
        }}
      >
        <div className="mac-panel relative h-full overflow-hidden rounded-lg border border-hairline shadow-sm">
          <div className="h-full overflow-y-auto px-3 pb-6 pt-[48px]">
            <div className="flex flex-col gap-2">
              <div className="relative">
                <Search className="pointer-events-none absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-muted-foreground" />
                <input
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search clients"
                  className="h-7 w-full rounded-md border border-hairline bg-transparent pl-7 pr-2 text-xs outline-none placeholder:text-muted-foreground focus:border-ink/30"
                />
              </div>
              <div className="flex flex-col gap-0.5">
                {loading && (
                  <div className="px-2 py-1.5 text-[11px] text-muted-foreground">
                    Loading…
                  </div>
                )}
                {!loading && filtered.length === 0 && (
                  <div className="px-2 py-1.5 text-[11px] text-muted-foreground">
                    {query ? "No matching clients." : "No clients yet."}
                  </div>
                )}
                {filtered.map((m) => {
                  const name = memberDisplayName(m);
                  const shownClientId = activeClientId ?? selectedClientId;
                  const isSelected = shownClientId === m.user_id;
                  return (
                    <div
                      key={`${m.group_id}-${m.user_id}`}
                      className={`group relative flex items-center gap-1.5 rounded-md pl-2 pr-1 py-1 text-xs text-ink ${
                        isSelected ? "bg-black/[0.06]" : "hover:bg-black/[0.06]"
                      }`}
                      style={{ transition: "none" }}
                    >
                      <button
                        type="button"
                        onClick={() => {
                          // If this client already has an open top-bar tab,
                          // activate that tab so its active-tab pill matches.
                          // Otherwise show them inline as the selected client.
                          const hasTab = openTabs.some((t) => t.user_id === m.user_id);
                          if (hasTab) {
                            setActiveClientId(m.user_id);
                            setSelectedClientId(null);
                          } else {
                            setSelectedClientId(m.user_id);
                            setActiveClientId(null);
                          }
                        }}
                        className="flex min-w-0 flex-1 items-center gap-1.5 text-left"
                        title={name}
                      >
                        {m.avatar_url ? (
                          <img
                            src={m.avatar_url}
                            alt=""
                            className="h-5 w-5 shrink-0 rounded-full object-cover"
                          />
                        ) : (
                          <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-secondary text-[9px] uppercase text-muted-foreground">
                            {name.slice(0, 1)}
                          </span>
                        )}
                        <span className="min-w-0 flex-1 truncate">{name}</span>
                      </button>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          pinClientFromRow(m);
                        }}
                        title="Pin to top tab-bar"
                        aria-label="Pin to top tab-bar"
                        className="grid h-5 w-5 shrink-0 place-items-center rounded text-muted-foreground opacity-0 hover:bg-black/[0.08] hover:text-ink group-hover:opacity-100"
                      >
                        <ArrowUp className="h-3 w-3" strokeWidth={2.25} />
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
          <div className="mac-panel-fade pointer-events-none absolute inset-x-0 bottom-0 h-10 rounded-b-lg" />
        </div>
      </div>
    </aside>
  );

  return (
    <div className="h-full overflow-hidden bg-white">
      {tabStrip}
      <div
        className="relative grid h-full overflow-hidden transition-[grid-template-columns] duration-300 ease-out"
        style={{ gridTemplateColumns: panelOpen ? "1fr 256px" : "1fr 0px" }}
      >
        <div className="relative min-w-0 md:h-full md:overflow-y-auto">
          {activeTab ? (
            <MemberWorkspace
              key={activeTab.user_id}
              userId={activeTab.user_id}
              name={activeTab.name}
              rightPanelOpen={panelOpen}
            />
          ) : selectedClient ? (
            <MemberWorkspace
              key={selectedClient.user_id}
              userId={selectedClient.user_id}
              name={memberDisplayName(selectedClient)}
              rightPanelOpen={panelOpen}
            />
          ) : (
            <div className="px-6 py-12 text-sm text-muted-foreground">
              Select a client on the right to view them. Click the arrow to pin
              them to the top tab-bar.
            </div>
          )}
        </div>

        {rightPanel}

        <button
          type="button"
          onClick={() => setPanelOpen(!panelOpen)}
          aria-label={panelOpen ? "Hide panel" : "Show panel"}
          title={panelOpen ? "Hide panel" : "Show panel"}
          className="absolute right-3 top-[12px] z-40 grid h-7 w-7 place-items-center rounded-md bg-white/0 text-muted-foreground hover:bg-secondary/60 hover:text-ink"
        >
          <PanelRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

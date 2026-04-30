/**
 * Calendar — UI shell that mirrors the Library page (/media) exactly.
 *
 * Structure (identical to /media):
 *   - Sticky horizontal top tab bar:
 *       * Left: "Calendar" main tab (220px wide, same style as Library tab)
 *       * Middle: open calendar tabs (drag/close — same component pattern as note tabs)
 *       * Right: actionsMount portal where the inner page renders
 *         Search / New folder / New calendar pills.
 *   - Below: grid [220px _ 1fr]
 *       * Left: CalendarSideNav — Previous + collapsible "Calendars" section
 *         with folders (DnD + pin/rename/delete menu).
 *       * Right: page body (Previous list rows or open calendar view).
 *
 * Backend wiring, the calendar grid itself, and Outlook/Gmail/iCloud sync are
 * intentionally NOT implemented here — they arrive with the next round of
 * instructions. Folders + calendars are persisted to localStorage as a
 * placeholder so the shell behaves naturally.
 */

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useNavigate, useSearch } from "@tanstack/react-router";
import {
  CalendarDays,
  Plus,
  Search as SearchIcon,
  X,
} from "lucide-react";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { CalendarSideNav, type CalendarSideNavValue } from "./CalendarSideNav";
import { YearCalendarView } from "./YearCalendarView";

/* ------------------------------------------------------------------ */
/* Local persistence (placeholder until backend is wired)              */
/* ------------------------------------------------------------------ */

export type Cal = {
  id: string;
  name: string;
  pinned: boolean;
  folder: string | null;
  isTeamGlobal?: boolean;
};
export type CalFolder = { id: string; name: string; pinned: boolean; sort_order: number };

export const calsKey = (scope: string) => `calendar:cals:${scope}`;
export const foldersKey = (scope: string) => `calendar:folders:${scope}`;

function readJSON<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}
function writeJSON<T>(key: string, value: T) {
  if (typeof window === "undefined") return;
  localStorage.setItem(key, JSON.stringify(value));
  window.dispatchEvent(new CustomEvent("calendar:refresh"));
}

/* ------------------------------------------------------------------ */
/* Page                                                                */
/* ------------------------------------------------------------------ */

interface OpenCalTab {
  id: string;
  name: string;
  folder: string | null;
}

const MAX_CAL_TABS = 10;

export function CalendarPage() {
  const navigate = useNavigate();
  const search = useSearch({ from: "/calendar" });
  const { user, mode, activeEntityId } = useAuth();
  const isTeamMode = mode === "team" || mode === "organizer" || !!activeEntityId;

  /* ----- team scope (for the auto team-global calendar) ----- */
  const [teamId, setTeamId] = useState<string | null>(null);
  const [teamName, setTeamName] = useState("");
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!user || !isTeamMode) {
        setTeamId(null);
        setTeamName("");
        return;
      }
      let q = supabase.from("teams").select("id,name").limit(1);
      q = activeEntityId ? q.eq("id", activeEntityId) : q.eq("owner_id", user.id);
      const { data } = await q.maybeSingle();
      if (cancelled) return;
      setTeamId(data?.id ?? null);
      setTeamName(data?.name ?? "Team");
    })();
    return () => {
      cancelled = true;
    };
  }, [user, isTeamMode, activeEntityId]);

  const scope = useMemo(() => {
    if (!user) return "anon";
    return isTeamMode ? `team:${teamId ?? "none"}` : `user:${user.id}`;
  }, [user, isTeamMode, teamId]);

  /* ----- persisted folders + calendars ----- */
  const [folders, setFolders] = useState<CalFolder[]>([]);
  const [cals, setCals] = useState<Cal[]>([]);

  const reload = useCallback(() => {
    setFolders(readJSON<CalFolder[]>(foldersKey(scope), []));
    setCals(readJSON<Cal[]>(calsKey(scope), []));
  }, [scope]);

  useEffect(() => {
    reload();
    const fn = () => reload();
    window.addEventListener("calendar:refresh", fn);
    return () => window.removeEventListener("calendar:refresh", fn);
  }, [reload]);

  // Synthesized team-global calendar (always present in team mode)
  const teamGlobal: Cal | null =
    isTeamMode && teamId
      ? {
          id: `team-global:${teamId}`,
          name: `${teamName || "Team"} calendar`,
          pinned: true,
          folder: null,
          isTeamGlobal: true,
        }
      : null;
  const allCals: Cal[] = teamGlobal ? [teamGlobal, ...cals] : cals;

  /* ----- open tabs (replica of /media) ----- */
  const [openTabs, setOpenTabs] = useState<OpenCalTab[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);

  // Persist open tabs per profile scope
  const profileScopeKey = `${mode}:${activeEntityId ?? "self"}`;
  const storageKey = `calendar:openTabs:${profileScopeKey}`;
  const hydratedRef = useRef<string | null>(null);
  useEffect(() => {
    if (hydratedRef.current === profileScopeKey) return;
    hydratedRef.current = profileScopeKey;
    if (typeof window === "undefined") return;
    try {
      const raw = window.localStorage.getItem(storageKey);
      const activeRaw = window.localStorage.getItem(`${storageKey}:active`);
      if (raw) {
        const parsed = JSON.parse(raw) as OpenCalTab[];
        if (Array.isArray(parsed)) {
          setOpenTabs(parsed);
          setActiveId(activeRaw && parsed.some((t) => t.id === activeRaw) ? activeRaw : null);
          return;
        }
      }
      setOpenTabs([]);
      setActiveId(null);
    } catch {
      setOpenTabs([]);
      setActiveId(null);
    }
  }, [profileScopeKey, storageKey]);
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (hydratedRef.current !== profileScopeKey) return;
    try {
      window.localStorage.setItem(storageKey, JSON.stringify(openTabs));
      if (activeId) window.localStorage.setItem(`${storageKey}:active`, activeId);
      else window.localStorage.removeItem(`${storageKey}:active`);
    } catch {
      /* ignore */
    }
  }, [openTabs, activeId, storageKey, profileScopeKey]);

  const openCalendar = useCallback(
    (c: Cal) => {
      setOpenTabs((prev) => {
        if (prev.some((t) => t.id === c.id)) return prev;
        if (prev.length >= MAX_CAL_TABS) {
          toast.error(`You can have at most ${MAX_CAL_TABS} calendar tabs open at once.`);
          return prev;
        }
        return [...prev, { id: c.id, name: c.name, folder: c.folder }];
      });
      setActiveId(c.id);
    },
    [],
  );
  const closeTab = (id: string) => {
    setOpenTabs((prev) => prev.filter((t) => t.id !== id));
    if (activeId === id) setActiveId(null);
  };

  // Auto-open via ?open=<id>
  useEffect(() => {
    if (search.open) {
      const c = allCals.find((x) => x.id === search.open);
      if (c) openCalendar(c);
      navigate({ to: "/calendar", search: {}, replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search.open, allCals.length]);

  /* ----- side nav state mirrors /media ----- */
  const showingPrevious = search.view === "previous" || (!search.folder && !activeId);
  const sideValue: CalendarSideNavValue = {
    category: showingPrevious ? "previous" : "calendars",
    folder: showingPrevious ? "" : (search.folder ?? ""),
  };
  const onSideChange = (v: CalendarSideNavValue) => {
    setActiveId(null);
    if (v.category === "previous") {
      navigate({ to: "/calendar", search: { view: "previous" }, replace: true });
      return;
    }
    navigate({
      to: "/calendar",
      search: { folder: v.folder || undefined },
      replace: true,
    });
  };

  /* ----- chrome-style tab DnD (replica of /media) ----- */
  const [actionsMount, setActionsMount] = useState<HTMLDivElement | null>(null);
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
    setActiveId(id);
    const strip = tabStripRef.current;
    if (!strip) return;
    const arr = openTabs;
    const startIndex = arr.findIndex((t) => t.id === id);
    if (startIndex < 0) return;
    const buttons = arr
      .map((t) => tabRefs.current.get(t.id))
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

  /* ----- dialogs ----- */
  const [newFolderOpen, setNewFolderOpen] = useState(false);
  const [newCalOpen, setNewCalOpen] = useState(false);

  const persistFolders = (next: CalFolder[]) => {
    writeJSON(foldersKey(scope), next);
    setFolders(next);
  };
  const persistCals = (next: Cal[]) => {
    writeJSON(calsKey(scope), next);
    setCals(next);
  };

  const showingCalendar = activeId !== null;
  const activeCal = showingCalendar ? allCals.find((c) => c.id === activeId) ?? null : null;

  /* ----- filter for the Previous list ----- */
  const folderFilter = sideValue.folder;
  const previousList = useMemo<Cal[]>(() => {
    if (folderFilter === "__unsorted__") return allCals.filter((c) => !c.folder);
    if (folderFilter && folderFilter !== "") {
      const folderName = folders.find((f) => f.id === folderFilter)?.name;
      return allCals.filter((c) => c.folder === folderName);
    }
    return allCals;
  }, [allCals, folderFilter, folders]);

  return (
    <div className="px-4 md:px-6">
      {/* Top-level horizontal tab bar — replica of /media */}
      <div className="sticky top-14 z-20 -mx-4 flex items-end justify-between gap-0 border-b border-hairline bg-background pl-4 pr-4 md:-mx-6 md:pl-6 md:pr-6">
        <button
          onClick={() => setActiveId(null)}
          className={`-mb-px inline-flex shrink-0 select-none items-center gap-1.5 border-b-2 py-2.5 pl-0 pr-4 text-sm font-medium ${
            showingCalendar
              ? "border-transparent text-muted-foreground hover:text-ink"
              : "border-primary text-ink"
          }`}
          style={{ width: 220, justifyContent: "flex-start" }}
          title="Calendar"
        >
          <CalendarDays className="h-3.5 w-3.5 opacity-70" strokeWidth={2.25} />
          <span>Calendar</span>
        </button>
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
                  const isActive = activeId === t.id;
                  const colorActive = "border-muted-foreground text-ink";
                  const colorIdle = "border-transparent text-muted-foreground hover:text-ink";
                  const isDragging = dragId === t.id;
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
                      key={t.id}
                      ref={(el) => {
                        if (el) tabRefs.current.set(t.id, el);
                        else tabRefs.current.delete(t.id);
                      }}
                      onPointerDown={(e) => onTabPointerDown(e, t.id)}
                      onClick={() => setActiveId(t.id)}
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
                      <CalendarDays className="h-3 w-3 shrink-0 opacity-70" />
                      <span className="inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-muted-foreground/60" />
                      <span className="min-w-0 flex-1 truncate text-left">
                        {t.folder ? `${t.folder} · ${t.name}` : t.name}
                      </span>
                      <span
                        data-tab-close
                        role="button"
                        tabIndex={0}
                        onPointerDown={(e) => e.stopPropagation()}
                        onClick={(e) => {
                          e.stopPropagation();
                          closeTab(t.id);
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
        <div ref={setActionsMount} className="flex shrink-0 items-center gap-2 pb-1.5 pl-2" />
      </div>

      <div className="grid gap-6 pt-4 md:grid-cols-[220px_1fr]">
        <aside className="md:sticky md:top-28 md:self-start">
          <CalendarSideNav
            value={sideValue}
            onChange={onSideChange}
            folders={folders}
            onFoldersChange={persistFolders}
          />
        </aside>

        <div className="min-w-0">
          <CalendarBody
            actionsMount={actionsMount}
            showingCalendar={showingCalendar}
            activeCal={activeCal}
            previousList={previousList}
            onOpenCalendar={openCalendar}
            onNewFolder={() => setNewFolderOpen(true)}
            onNewCalendar={() => setNewCalOpen(true)}
          />
        </div>
      </div>

      {newFolderOpen && (
        <NewItemDialog
          title="New folder"
          placeholder="Folder name"
          onClose={() => setNewFolderOpen(false)}
          onSubmit={(name) => {
            const trimmed = name.trim();
            if (!trimmed) return;
            if (folders.some((f) => f.name.toLowerCase() === trimmed.toLowerCase())) {
              toast.error("A folder with this name already exists");
              return;
            }
            persistFolders([
              ...folders,
              {
                id: crypto.randomUUID(),
                name: trimmed,
                pinned: false,
                sort_order: folders.length,
              },
            ]);
            setNewFolderOpen(false);
            toast.success("Folder created");
          }}
        />
      )}
      {newCalOpen && (
        <NewCalendarDialog
          folders={folders}
          onClose={() => setNewCalOpen(false)}
          onCreateFolder={(name) => {
            const trimmed = name.trim();
            if (!trimmed) return null;
            if (folders.some((f) => f.name.toLowerCase() === trimmed.toLowerCase())) {
              toast.error("A folder with this name already exists");
              return null;
            }
            const f: CalFolder = {
              id: crypto.randomUUID(),
              name: trimmed,
              pinned: false,
              sort_order: folders.length,
            };
            persistFolders([...folders, f]);
            return f;
          }}
          onSubmit={(name, folder) => {
            const cal: Cal = {
              id: crypto.randomUUID(),
              name: name.trim() || "Untitled calendar",
              pinned: false,
              folder: folder ?? null,
            };
            persistCals([...cals, cal]);
            setNewCalOpen(false);
            openCalendar(cal);
          }}
        />
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Body — renders Previous list (rows) or the open calendar.           */
/* The action pills (Search / New folder / New calendar) live here     */
/* and are portaled into actionsMount, exactly like NotesPage.         */
/* ------------------------------------------------------------------ */

function CalendarBody({
  actionsMount,
  showingCalendar,
  activeCal,
  previousList,
  onOpenCalendar,
  onNewFolder,
  onNewCalendar,
}: {
  actionsMount: HTMLDivElement | null;
  showingCalendar: boolean;
  activeCal: Cal | null;
  previousList: Cal[];
  onOpenCalendar: (c: Cal) => void;
  onNewFolder: () => void;
  onNewCalendar: () => void;
}) {
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const closeSearch = () => {
    setSearchOpen(false);
    setSearchQuery("");
  };

  const actions = (
    <>
      <div
        className={`flex items-center gap-1 overflow-hidden rounded-full border border-transparent transition-all duration-300 ease-out ${
          searchOpen
            ? "w-64 border-hairline bg-card pl-3 pr-1"
            : "w-9 hover:border-hairline hover:bg-card"
        }`}
      >
        <button
          type="button"
          onClick={() => {
            if (!searchOpen) setSearchOpen(true);
            else searchInputRef.current?.focus();
          }}
          aria-label="Search calendars"
          className="grid h-9 w-9 shrink-0 place-items-center text-muted-foreground transition hover:text-ink"
        >
          <SearchIcon className="h-4 w-4" />
        </button>
        <input
          ref={searchInputRef}
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Escape") closeSearch();
          }}
          placeholder="Search in calendars"
          className={`min-w-0 flex-1 border-b border-hairline bg-transparent py-1 text-xs text-ink outline-none transition placeholder:text-muted-foreground/70 focus:border-ink/40 ${
            searchOpen ? "opacity-100" : "pointer-events-none w-0 opacity-0"
          }`}
        />
        {searchOpen && (
          <button
            type="button"
            onClick={closeSearch}
            aria-label="Clear search"
            className={`grid h-7 w-7 shrink-0 place-items-center rounded-full text-muted-foreground transition hover:bg-secondary hover:text-ink ${
              searchQuery ? "opacity-100" : "opacity-60"
            }`}
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
      <button
        onClick={onNewFolder}
        className="flex items-center gap-1.5 rounded-full border border-hairline bg-card px-4 py-2 text-xs text-ink hover:bg-secondary"
      >
        <Plus className="h-3.5 w-3.5" /> New folder
      </button>
      <button
        onClick={onNewCalendar}
        className="flex items-center gap-1.5 rounded-full bg-primary px-4 py-2 text-xs text-primary-foreground hover:opacity-90"
      >
        <Plus className="h-3.5 w-3.5" /> New calendar
      </button>
    </>
  );

  const filtered = searchQuery.trim()
    ? previousList.filter((c) =>
        c.name.toLowerCase().includes(searchQuery.trim().toLowerCase()),
      )
    : previousList;

  return (
    <div>
      {actionsMount && createPortal(actions, actionsMount)}

      {showingCalendar && activeCal ? (
        <CalendarPlaceholder cal={activeCal} />
      ) : (
        <PreviousList list={filtered} onOpen={onOpenCalendar} />
      )}
    </div>
  );
}

function PreviousList({ list, onOpen }: { list: Cal[]; onOpen: (c: Cal) => void }) {
  if (list.length === 0) {
    return (
      <div className="mt-6 rounded-lg border border-dashed border-hairline p-12 text-center text-sm text-muted-foreground">
        No calendars yet. Click <span className="font-medium text-ink">New calendar</span> to
        create one.
      </div>
    );
  }
  return (
    <div className="mt-4 flex flex-col divide-y divide-hairline rounded-lg border border-hairline">
      {list.map((c) => (
        <button
          key={c.id}
          onClick={() => onOpen(c)}
          className="flex items-center gap-3 px-4 py-3 text-left transition hover:bg-secondary/40"
        >
          <CalendarDays className="h-4 w-4 text-muted-foreground" strokeWidth={2.25} />
          <span className="flex-1 text-sm text-ink">
            {c.folder ? `${c.folder} · ${c.name}` : c.name}
          </span>
          {c.isTeamGlobal && (
            <span className="rounded-full bg-secondary px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
              Team
            </span>
          )}
        </button>
      ))}
    </div>
  );
}

function CalendarPlaceholder({ cal }: { cal: Cal }) {
  return (
    <YearCalendarView
      calId={cal.id}
      defaultTitle={cal.name}
      seat={isTeamMode ? "admin" : "individual"}
    />
  );
}

/* ------------------------------------------------------------------ */
/* Dialogs                                                             */
/* ------------------------------------------------------------------ */

function NewItemDialog({
  title,
  placeholder,
  onClose,
  onSubmit,
}: {
  title: string;
  placeholder: string;
  onClose: () => void;
  onSubmit: (name: string) => void;
}) {
  const [val, setVal] = useState("");
  return (
    <Modal onClose={onClose} title={title}>
      <input
        autoFocus
        value={val}
        onChange={(e) => setVal(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") onSubmit(val);
          if (e.key === "Escape") onClose();
        }}
        placeholder={placeholder}
        className="w-full rounded-md border border-hairline bg-background px-3 py-2 text-sm outline-none focus:border-ink"
      />
      <div className="mt-4 flex justify-end gap-2">
        <button
          onClick={onClose}
          className="rounded-md border border-hairline px-3 py-1.5 text-xs text-ink hover:bg-secondary"
        >
          Cancel
        </button>
        <button
          onClick={() => onSubmit(val)}
          className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:opacity-90"
        >
          Create
        </button>
      </div>
    </Modal>
  );
}

function NewCalendarDialog({
  folders,
  onClose,
  onSubmit,
  onCreateFolder,
}: {
  folders: CalFolder[];
  onClose: () => void;
  onSubmit: (name: string, folder: string | null) => void;
  onCreateFolder: (name: string) => CalFolder | null;
}) {
  const [name, setName] = useState("");
  const [folder, setFolder] = useState<string>("");
  const [creatingFolder, setCreatingFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  return (
    <Modal onClose={onClose} title="New calendar">
      <div className="flex flex-col gap-3">
        <div>
          <label className="mb-1 block text-xs text-muted-foreground">Name</label>
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Calendar name"
            className="w-full rounded-md border border-hairline bg-background px-3 py-2 text-sm outline-none focus:border-ink"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs text-muted-foreground">Folder (optional)</label>
          {creatingFolder ? (
            <div className="flex items-center gap-2">
              <input
                autoFocus
                value={newFolderName}
                onChange={(e) => setNewFolderName(e.target.value)}
                placeholder="New folder name"
                className="flex-1 rounded-md border border-hairline bg-background px-3 py-2 text-sm outline-none focus:border-ink"
              />
              <button
                onClick={() => {
                  const f = onCreateFolder(newFolderName);
                  if (f) {
                    setFolder(f.name);
                    setCreatingFolder(false);
                    setNewFolderName("");
                  }
                }}
                className="rounded-md bg-primary px-3 py-2 text-xs text-primary-foreground"
              >
                Add
              </button>
              <button
                onClick={() => {
                  setCreatingFolder(false);
                  setNewFolderName("");
                }}
                className="text-muted-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <select
                value={folder}
                onChange={(e) => setFolder(e.target.value)}
                className="flex-1 rounded-md border border-hairline bg-background px-3 py-2 text-sm outline-none focus:border-ink"
              >
                <option value="">No folder</option>
                {folders.map((f) => (
                  <option key={f.id} value={f.name}>
                    {f.name}
                  </option>
                ))}
              </select>
              <button
                onClick={() => setCreatingFolder(true)}
                className="rounded-md border border-hairline p-2 text-muted-foreground hover:bg-secondary"
                aria-label="Create folder"
              >
                <Plus className="h-4 w-4" />
              </button>
            </div>
          )}
        </div>
      </div>
      <div className="mt-4 flex justify-end gap-2">
        <button
          onClick={onClose}
          className="rounded-md border border-hairline px-3 py-1.5 text-xs text-ink hover:bg-secondary"
        >
          Cancel
        </button>
        <button
          onClick={() => onSubmit(name, folder || null)}
          className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:opacity-90"
        >
          Create
        </button>
      </div>
    </Modal>
  );
}

function Modal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded-lg border border-hairline bg-card p-5 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-base font-semibold text-ink">{title}</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-ink">
            <X className="h-4 w-4" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

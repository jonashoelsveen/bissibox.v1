import { createFileRoute, Link, useNavigate, useSearch } from "@tanstack/react-router";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { motion, useMotionValue, useSpring, useTransform, type MotionValue } from "framer-motion";
import { createPortal } from "react-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import * as tus from "tus-js-client";
import { FilesPage } from "@/components/library/FilesPage";
import { NotesPage } from "@/components/library/NotesPage";
import { NoteEditor } from "@/components/library/NoteEditor";
import { LibrarySideNav, type LibrarySideNavValue } from "@/components/library/LibrarySideNav";
import { PreviousPage, type PreviousNewKind } from "@/components/library/PreviousPage";
import { LibraryPlusMenu } from "@/components/library/LibraryPlusMenu";
import { CreateContainerDialog } from "@/components/library/CreateContainerDialog";
import { NewNoteOverlay } from "@/components/library/NewNoteOverlay";
import { TopBarSlot } from "@/components/TopBarSlot";
import { MeetingsListPage } from "@/components/library/MeetingsListPage";
import { getUnsaved, useLibrarySetting } from "@/lib/library-settings";
import { TeamBoardPage } from "@/routes/team.board";
import { MapPage } from "@/components/map/MapPage";
import { toast } from "sonner";
import {
  ChevronDown,
  ChevronRight,
  Plus,
  Upload,
  CheckSquare,
  Square,
  X,
  Trash2,
  Eye,
  Search,
  Instagram,
  Facebook,
  Share2,
  Link2,
  Activity,
  Ghost,
  ArrowUp,
  MoreVertical,
  User as UserIcon,
  Camera,
  Users as UsersIcon,
  Building2,
  GripVertical,
  Pin,
  PinOff,
  FolderClosed,
  Image as ImageIcon,
  StickyNote,
  Library,
  Briefcase,
  Play,
  Pause,
  Download,
  Pencil,
  Heart,
  ArrowLeft,
} from "lucide-react";
import { Slider } from "@/components/ui/slider";

type LibraryTab = "notes" | "files" | "media" | "meetings" | "map";

export interface OpenNoteTab {
  id: string;
  title: string;
  folder: string | null;
  kind: "new" | "earlier";
  type?: "note" | "meeting" | "media";
  mediaIds?: string[];
}

export const Route = createFileRoute("/media")({
  component: LibraryPage,
  validateSearch: (s: Record<string, unknown>): { tab?: LibraryTab; folder?: string; new?: string; open?: string; view?: "previous"; edit?: string } => ({
    tab:
      s.tab === "files" || s.tab === "media" || s.tab === "notes" || s.tab === "meetings" || s.tab === "map"
        ? (s.tab as LibraryTab)
        : undefined,
    folder: typeof s.folder === "string" ? (s.folder as string) : undefined,
    new: typeof s.new === "string" ? (s.new as string) : undefined,
    open: typeof s.open === "string" ? (s.open as string) : undefined,
    view: s.view === "previous" ? "previous" : undefined,
    edit: typeof s.edit === "string" ? (s.edit as string) : undefined,
  }),
  head: () => ({ meta: [{ title: "Library · Raceline" }] }),
});

const MAX_NOTE_TABS = 10;

function LibraryPage() {
  const search = useSearch({ from: "/media" });
  const navigate = useNavigate();
  const { mode, activeEntityId } = useAuth();
  const baseTab: LibraryTab = search.tab ?? "files";

  const [openNoteTabs, setOpenNoteTabs] = useState<OpenNoteTab[]>([]);
  const [activeNoteId, setActiveNoteId] = useState<string | null>(null);
  const [actionsMount, setActionsMount] = useState<HTMLDivElement | null>(null);
  const [newNoteOpen, setNewNoteOpen] = useState(false);
  const [newMeetingSignal, setNewMeetingSignal] = useState(0);
  const [createContainerKind, setCreateContainerKind] = useState<PreviousNewKind | null>(null);
  const isTeamMode = mode === "team" || mode === "organizer" || !!activeEntityId;

  const handleCreateContainerFromPrevious = (kind: PreviousNewKind) => {
    // Open the parent-level create dialog WITHOUT navigating away from the
    // current tab. The new folder/album appears in the side nav immediately
    // via the shared `library:refresh` event.
    setCreateContainerKind(kind);
  };

  const handleCreateFromPrevious = (kind: PreviousNewKind) => {
    if (kind === "meeting") {
      setActiveNoteId(null);
      // Switch to meetings tab and trigger the inline new-meeting dialog.
      navigate({ to: "/media", search: { tab: "meetings" }, replace: true });
      setNewMeetingSignal((n) => n + 1);
      return;
    }
    if (kind === "note") {
      setNewNoteOpen(true);
      return;
    }
    if (kind === "files") {
      setActiveNoteId(null);
      navigate({ to: "/media", search: { tab: "files", new: "1" }, replace: true });
      return;
    }
    if (kind === "media") {
      setActiveNoteId(null);
      navigate({ to: "/media", search: { tab: "media", new: "1" }, replace: true });
      return;
    }
  };

  // Persist open library tabs per profile so they survive logout / page reloads.
  const profileScopeKey = `${mode}:${activeEntityId ?? "self"}`;
  const storageKey = `library:openNoteTabs:${profileScopeKey}`;
  const lastScopeRef = useRef<string>(profileScopeKey);
  const hydratedRef = useRef<string | null>(null);

  // Hydrate from localStorage on first mount + when profile scope changes.
  useEffect(() => {
    if (hydratedRef.current === profileScopeKey) return;
    hydratedRef.current = profileScopeKey;
    if (typeof window === "undefined") return;
    try {
      const raw = window.localStorage.getItem(storageKey);
      const activeRaw = window.localStorage.getItem(`${storageKey}:active`);
      if (raw) {
        const parsed = JSON.parse(raw) as OpenNoteTab[];
        if (Array.isArray(parsed)) {
          setOpenNoteTabs(parsed);
          if (activeRaw && parsed.some((t) => t.id === activeRaw)) {
            setActiveNoteId(activeRaw);
          } else {
            setActiveNoteId(null);
          }
          return;
        }
      }
      setOpenNoteTabs([]);
      setActiveNoteId(null);
    } catch {
      setOpenNoteTabs([]);
      setActiveNoteId(null);
    }
  }, [profileScopeKey, storageKey]);

  // Reset (clear in-memory) when profile changes — hydration above repopulates.
  useEffect(() => {
    if (lastScopeRef.current !== profileScopeKey) {
      lastScopeRef.current = profileScopeKey;
      hydratedRef.current = null;
    }
  }, [profileScopeKey]);

  // Persist whenever tabs / active change.
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (hydratedRef.current !== profileScopeKey) return;
    try {
      window.localStorage.setItem(storageKey, JSON.stringify(openNoteTabs));
      if (activeNoteId) window.localStorage.setItem(`${storageKey}:active`, activeNoteId);
      else window.localStorage.removeItem(`${storageKey}:active`);
    } catch {
      /* ignore quota */
    }
  }, [openNoteTabs, activeNoteId, storageKey, profileScopeKey]);

  // Chrome-like tab DnD (pointer-based, X-axis only)
  const tabStripRef = useRef<HTMLDivElement | null>(null);
  const tabRefs = useRef<Map<string, HTMLButtonElement>>(new Map());
  const [dragNoteId, setDragNoteId] = useState<string | null>(null);
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
  // FLIP settle: animate ONLY the dropped tab into its new DOM home.
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
  }, [openNoteTabs, updateEdgeFade]);

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

  const setTab = (next: LibraryTab) => {
    setActiveNoteId(null);
    navigate({ to: "/media", search: { tab: next }, replace: true });
  };

  const openNote = useCallback(
    async (id: string, kind: "new" | "earlier" = "earlier") => {
      const existing = openNoteTabs.find((t) => t.id === id);
      if (existing) {
        setActiveNoteId(id);
        return;
      }
      if (openNoteTabs.length >= MAX_NOTE_TABS) {
        toast.error(`You can have at most ${MAX_NOTE_TABS} note tabs open at once.`);
        return;
      }
      const { data } = await supabase
        .from("notes").select("id,title,folder").eq("id", id).maybeSingle();
      if (!data) { toast.error("Note not found"); return; }
      setOpenNoteTabs((prev) => [
        ...prev,
        { id: data.id, title: data.title, folder: data.folder, kind },
      ]);
      setActiveNoteId(id);
    },
    [openNoteTabs],
  );

  const [unsavedPrompt, setUnsavedPrompt] = useState<{
    id: string;
    title: string;
    isNew: boolean;
  } | null>(null);

  const finalizeClose = (id: string) => {
    setOpenNoteTabs((prev) => {
      const idx = prev.findIndex((t) => t.id === id);
      const next = prev.filter((t) => t.id !== id);
      if (activeNoteId === id) {
        if (next.length === 0) {
          setActiveNoteId(null);
        } else {
          const leftIdx = Math.max(0, (idx === -1 ? 0 : idx) - 1);
          setActiveNoteId(next[leftIdx].id);
        }
      }
      return next;
    });
  };

  const closeNoteTab = (id: string) => {
    const tab = openNoteTabs.find((t) => t.id === id);
    const handle = getUnsaved(id);
    if (handle && handle.isDirty()) {
      setUnsavedPrompt({
        id,
        title: handle.title(),
        isNew: tab?.kind === "new",
      });
      return;
    }
    finalizeClose(id);
  };

  const openMeetingTab = useCallback(
    (m: { id: string; title: string; folder: string | null }, kind: "new" | "earlier" = "earlier") => {
      setOpenNoteTabs((prev) => {
        if (prev.some((t) => t.id === m.id)) return prev;
        if (prev.length >= MAX_NOTE_TABS) {
          toast.error(`You can have at most ${MAX_NOTE_TABS} tabs open at once.`);
          return prev;
        }
        return [...prev, { id: m.id, title: m.title, folder: m.folder, kind, type: "meeting" }];
      });
      setActiveNoteId(m.id);
    },
    [],
  );

  const openMediaTab = useCallback(
    (tabId: string, title: string, mediaIds: string[]) => {
      setOpenNoteTabs((prev) => {
        const existing = prev.find((t) => t.id === tabId);
        if (existing) return prev;
        if (prev.length >= MAX_NOTE_TABS) {
          toast.error(`You can have at most ${MAX_NOTE_TABS} tabs open at once.`);
          return prev;
        }
        return [...prev, { id: tabId, title, folder: null, kind: "earlier", type: "media", mediaIds }];
      });
      setActiveNoteId(tabId);
    },
    [],
  );

  const updateNoteTab = (patch: { id: string; title?: string; folder?: string | null }) => {
    setOpenNoteTabs((prev) =>
      prev.map((t) =>
        t.id === patch.id
          ? { ...t, title: patch.title ?? t.title, folder: patch.folder !== undefined ? patch.folder : t.folder }
          : t,
      ),
    );
  };

  // Auto-open via ?open=<id> (from /notes/$noteId redirect)
  useEffect(() => {
    if (search.open) {
      void openNote(search.open, "earlier");
      navigate({ to: "/media", search: { tab: search.tab ?? "notes" }, replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search.open]);

  // Global "open as new tab" event — fired by the global + create overlay
  // after a new note / meeting / media item is created so it appears as an
  // open tab in the top tab bar (mirrors the previous per-page behaviour).
  useEffect(() => {
    const onOpenTab = (e: Event) => {
      const d = (e as CustomEvent).detail as
        | { type: "note"; id: string; title: string; folder: string | null }
        | { type: "meeting"; id: string; title: string; folder: string | null }
        | { type: "media"; id: string; title: string }
        | { type: "file"; id: string; title: string };
      if (!d) return;
      if (d.type === "note") {
        void openNote(d.id, "new");
      } else if (d.type === "meeting") {
        openMeetingTab({ id: d.id, title: d.title, folder: d.folder }, "new");
      } else if (d.type === "media") {
        openMediaTab(`media:${d.id}`, d.title, [d.id]);
      }
      // files: no per-file editor tab — skipped intentionally.
    };
    window.addEventListener("library:open-tab", onOpenTab);
    return () => window.removeEventListener("library:open-tab", onOpenTab);
  }, [openNote, openMeetingTab, openMediaTab]);

  const showingNote = activeNoteId !== null;
  const activeTabEntry = activeNoteId ? openNoteTabs.find((t) => t.id === activeNoteId) ?? null : null;
  const showingMeeting = !!activeTabEntry && activeTabEntry.type === "meeting";
  const showingMedia = !!activeTabEntry && activeTabEntry.type === "media";

  // Pointer-based, X-axis-locked tab drag (Chrome-style).
  const onTabPointerDown = (e: React.PointerEvent<HTMLButtonElement>, id: string) => {
    if (e.button !== 0) return;
    const target = e.target as HTMLElement;
    if (target.closest("[data-tab-close]")) return;
    setActiveNoteId(id); // immediate focus

    const strip = tabStripRef.current;
    if (!strip) return;
    const tabsArr = openNoteTabs;
    const startIndex = tabsArr.findIndex((t) => t.id === id);
    if (startIndex < 0) return;
    const buttons = tabsArr
      .map((t) => tabRefs.current.get(t.id))
      .filter((b): b is HTMLButtonElement => !!b);
    if (buttons.length !== tabsArr.length) return;
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
      if (dragNoteId !== st.id) setDragNoteId(st.id);
      setDragDx(dx);
      const stripEl = tabStripRef.current;
      if (!stripEl) return;
      const pointerXInStrip =
        ev.clientX - stripEl.getBoundingClientRect().left + stripEl.scrollLeft;
      let newIdx = 0;
      for (let i = 0; i < st.offsets.length; i++) {
        const mid = st.offsets[i] + st.width / 2;
        if (pointerXInStrip < mid) { newIdx = i; break; }
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
        // Capture the dragged tab's CURRENT visual left (with drag transform)
        // so we can FLIP-animate it to its new DOM home after reorder.
        const el = tabRefs.current.get(st.id);
        if (el) {
          flipRef.current = { id: st.id, fromLeft: el.getBoundingClientRect().left };
        }
        setOpenNoteTabs((prev) => {
          const next = prev.slice();
          const [moved] = next.splice(st.startIndex, 1);
          next.splice(st.currentIndex, 0, moved);
          return next;
        });
      }
      setDragNoteId(null);
      setDragDx(0);
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
  };

  const externalNotesView: { type: "all" } | { type: "folder"; name: string | null } | undefined =
    baseTab === "notes" && search.folder !== undefined
      ? search.folder === "__unsorted__"
        ? { type: "folder", name: null }
        : search.folder === ""
          ? { type: "all" }
          : { type: "folder", name: search.folder }
      : undefined;
  const externalFilesView: { type: "all" } | { type: "folder"; id: string | null } | undefined =
    baseTab === "files" && search.folder !== undefined
      ? search.folder === "__unsorted__"
        ? { type: "folder", id: null }
        : search.folder === ""
          ? { type: "all" }
          : { type: "folder", id: search.folder }
      : undefined;
  const externalMediaView: { type: "all" } | { type: "album"; id: string | null } | undefined =
    baseTab === "media" && search.folder !== undefined
      ? search.folder === "__unsorted__"
        ? { type: "album", id: null }
        : search.folder === ""
          ? { type: "all" }
          : { type: "album", id: search.folder }
      : undefined;

  const showingPrevious = search.view === "previous";
  const sideValue: LibrarySideNavValue = {
    category: showingPrevious ? "previous" : baseTab,
    folder: showingPrevious ? "" : (search.folder ?? ""),
  };
  const onSideChange = (v: LibrarySideNavValue) => {
    setActiveNoteId(null);
    if (v.category === "previous") {
      navigate({ to: "/media", search: { tab: baseTab, view: "previous" }, replace: true });
      return;
    }
    navigate({
      to: "/media",
      search: { tab: v.category, folder: v.folder || undefined },
      replace: true,
    });
  };

  const externalMeetingsView: { type: "all" } | { type: "folder"; name: string | null } | undefined =
    baseTab === "meetings" && search.folder !== undefined
      ? search.folder === "__unsorted__"
        ? { type: "folder", name: null }
        : search.folder === ""
          ? { type: "all" }
          : { type: "folder", name: search.folder }
      : undefined;

  return (
    <div className="h-full overflow-hidden px-4 md:px-6">
      <TopBarSlot>
        <nav className="flex min-w-0 flex-1 items-end overflow-hidden">
          {openNoteTabs.length > 0 && (
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
                {openNoteTabs.map((t, idx) => {
                  const isActive = activeNoteId === t.id;
                  const isNew = t.kind === "new";
                  const colorActive = isNew
                    ? "border-emerald-500 text-emerald-700 dark:text-emerald-400"
                    : "border-muted-foreground text-ink";
                  const colorIdle = isNew
                    ? "border-transparent text-emerald-600/80 hover:text-emerald-700 dark:text-emerald-400/80"
                    : "border-transparent text-muted-foreground hover:text-ink";
                  const dotColor = isNew ? "bg-emerald-500" : "bg-muted-foreground/60";
                  const isDragging = dragNoteId === t.id;

                  let translateX = 0;
                  if (dragNoteId && !isDragging) {
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
                      onClick={() => setActiveNoteId(t.id)}
                      style={{
                        flex: "1 1 200px",
                        minWidth: 140,
                        maxWidth: 240,
                        touchAction: "pan-y",
                        ...dragStyle,
                        transition: isDragging
                          ? "none"
                          : dragNoteId
                            ? "transform 180ms cubic-bezier(0.2, 0.8, 0.2, 1), color 150ms, border-color 150ms"
                            : "color 150ms, border-color 150ms",
                      }}
                      className={`group -mb-px inline-flex shrink-0 select-none items-center gap-1.5 border-b-2 px-3 py-2.5 text-sm ${
                        isActive ? colorActive : colorIdle
                      }`}
                      title={t.title}
                    >
                      {t.type === "meeting" ? (
                        <Briefcase className="h-3 w-3 shrink-0 opacity-70" />
                      ) : t.type === "media" ? (
                        <ImageIcon className="h-3 w-3 shrink-0 opacity-70" />
                      ) : (
                        <StickyNote className="h-3 w-3 shrink-0 opacity-70" />
                      )}
                      <span className={`inline-block h-1.5 w-1.5 shrink-0 rounded-full ${dotColor}`} />
                      <span className="min-w-0 flex-1 truncate text-left">
                        {t.folder ? `${t.folder} · ${t.title}` : t.title}
                      </span>
                      <span
                        data-tab-close
                        role="button"
                        tabIndex={0}
                        onPointerDown={(e) => e.stopPropagation()}
                        onClick={(e) => {
                          e.stopPropagation();
                          closeNoteTab(t.id);
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
        {/* Per-page Search/Plus mount removed — global top tab bar provides them. */}
      </TopBarSlot>

      <div className="grid h-full gap-6 overflow-hidden md:grid-cols-[220px_1fr]">
        <aside className="md:h-full md:overflow-y-auto md:border-r md:border-border/60 md:pr-4 md:pt-4">
          <LibrarySideNav value={sideValue} onChange={onSideChange} />
        </aside>

        <div className="min-w-0 bg-white md:h-full md:overflow-y-auto">

          {showingNote && activeNoteId && showingMeeting ? (
            <TeamBoardPage
              key={activeNoteId}
              embedded
              hideOwnTabBar
              forceMeetingId={activeNoteId}
              onMeetingOpened={(m) =>
                openMeetingTab({ id: m.id, title: m.title, folder: m.folder }, m.kind)
              }
              onMeetingDeleted={(id) => finalizeClose(id)}
            />
          ) : showingNote && activeNoteId && showingMedia && activeTabEntry ? (
            <MediaTabView
              key={activeNoteId}
              mediaIds={activeTabEntry.mediaIds ?? []}
              onTitleChange={(title) => updateNoteTab({ id: activeNoteId, title })}
            />
          ) : showingNote && activeNoteId ? (
            <NoteEditor
              key={activeNoteId}
              noteId={activeNoteId}
              actionsMount={actionsMount}
              onChanged={updateNoteTab}
              onDeleted={(id) => finalizeClose(id)}
            />
          ) : showingPrevious ? (
            <PreviousPage
              onOpenNote={(id) => void openNote(id, "earlier")}
              onOpenTab={(t) =>
                navigate({ to: "/media", search: { tab: t }, replace: true })
              }
              onCreate={handleCreateFromPrevious}
              showMeetingOption={isTeamMode}
              actionsMount={actionsMount}
            />
          ) : baseTab === "meetings" ? (
            <MeetingsListPage
              actionsMount={actionsMount}
              externalView={externalMeetingsView ?? { type: "all" }}
              newMeetingSignal={newMeetingSignal}
              newFolderSignal={0}
              onOpenMeeting={(m) => openMeetingTab(m, "earlier")}
              onMeetingCreated={(m) => openMeetingTab(m, "new")}
              onCreate={handleCreateFromPrevious}
              onCreateContainer={handleCreateContainerFromPrevious}
              showMeetingOption={isTeamMode}
            />
          ) : baseTab === "notes" ? (
            <NotesPage
              actionsMount={actionsMount}
              onOpenNote={(id, kind) => void openNote(id, kind)}
              hideSideNav
              externalView={externalNotesView}
              onCreate={handleCreateFromPrevious}
              onCreateContainer={handleCreateContainerFromPrevious}
              newFolderSignal={0}
              showMeetingOption={isTeamMode}
            />
          ) : baseTab === "files" ? (
            <FilesPage
              actionsMount={actionsMount}
              hideSideNav
              externalView={externalFilesView}
              onCreate={handleCreateFromPrevious}
              onCreateContainer={handleCreateContainerFromPrevious}
              newFolderSignal={0}
              showMeetingOption={isTeamMode}
            />
          ) : baseTab === "map" ? (
            <MapPage embedded />
          ) : (
            <MediaPage
              actionsMount={actionsMount}
              hideSideNav
              externalView={externalMediaView}
              onOpenMediaTab={openMediaTab}
              onCreate={handleCreateFromPrevious}
              onCreateContainer={handleCreateContainerFromPrevious}
              newAlbumSignal={0}
              showMeetingOption={isTeamMode}
            />
          )}
        </div>
      </div>
      {newNoteOpen && <NewNoteOverlay onClose={() => setNewNoteOpen(false)} />}
      {createContainerKind && (
        <CreateContainerDialog
          kind={createContainerKind}
          onClose={() => setCreateContainerKind(null)}
        />
      )}
      {unsavedPrompt && (
        <UnsavedChangesDialog
          title={unsavedPrompt.title}
          isNew={unsavedPrompt.isNew}
          onSave={async () => {
            const h = getUnsaved(unsavedPrompt.id);
            if (h) await h.save();
            const id = unsavedPrompt.id;
            setUnsavedPrompt(null);
            finalizeClose(id);
          }}
          onDiscard={async () => {
            const h = getUnsaved(unsavedPrompt.id);
            if (h) {
              if (unsavedPrompt.isNew) {
                // delete the brand-new record
                await supabase.from(
                  openNoteTabs.find((t) => t.id === unsavedPrompt.id)?.type === "meeting"
                    ? "team_board_meetings"
                    : "notes",
                ).delete().eq("id", unsavedPrompt.id);
              } else {
                await h.discard();
              }
            }
            const id = unsavedPrompt.id;
            setUnsavedPrompt(null);
            finalizeClose(id);
          }}
          onCancel={() => setUnsavedPrompt(null)}
        />
      )}
    </div>
  );
}

function LibraryTabBtn({
  active,
  onClick,
  icon,
  children,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`-mb-px inline-flex items-center gap-1.5 border-b-2 px-4 py-2.5 text-sm transition ${
        active
          ? "border-primary text-ink"
          : "border-transparent text-muted-foreground hover:text-ink"
      }`}
    >
      {icon}
      {children}
    </button>
  );
}

interface Album {
  id: string;
  name: string;
  pinned: boolean;
  sort_order: number;
}

interface MediaItem {
  id: string;
  user_id: string;
  team_id: string | null;
  storage_path: string;
  media_type: "photo" | "video";
  album_id: string | null;
  event_id: string | null;
  organizer: string | null;
  photographer: string | null;
  subject: string | null;
  visible_world: boolean;
  visible_media: boolean;
  visible_friends: boolean;
  allowed_media_houses: string[];
  uploaded_in_mode: string;
  created_at: string;
}

const MEDIA_MAX_BYTES = 5 * 1024 * 1024 * 1024; // 5 GB

interface AttendedEvent {
  id: string;
  title: string;
  organizer: string;
  starts_at: string;
}

const MEDIA_HOUSES = ["VG", "NRK", "TV2", "Dagbladet", "Aftenposten"];

const THUMB_WIDTH = 400;
const THUMB_QUALITY = 75;
const LIGHTBOX_WIDTH = 1600;
const LIGHTBOX_QUALITY = 85;

async function signedThumbUrl(path: string, isPhoto: boolean): Promise<string | null> {
  if (!isPhoto) {
    const { data } = await supabase.storage.from("media").createSignedUrl(path, 3600);
    return data?.signedUrl ?? null;
  }
  const { data } = await supabase.storage.from("media").createSignedUrl(path, 3600, {
    transform: { width: THUMB_WIDTH, height: THUMB_WIDTH, resize: "cover", quality: THUMB_QUALITY },
  });
  return data?.signedUrl ?? null;
}

async function signedLightboxUrl(path: string, isPhoto: boolean): Promise<string | null> {
  if (!isPhoto) {
    const { data } = await supabase.storage.from("media").createSignedUrl(path, 3600);
    return data?.signedUrl ?? null;
  }
  const { data } = await supabase.storage.from("media").createSignedUrl(path, 3600, {
    transform: { width: LIGHTBOX_WIDTH, resize: "contain", quality: LIGHTBOX_QUALITY },
  });
  return data?.signedUrl ?? null;
}

function MediaPage({
  actionsMount,
  hideSideNav,
  externalView,
  hideNewActions,
  onOpenMedia,
  onOpenMediaTab,
  onCreate,
  onCreateContainer,
  newAlbumSignal,
  showMeetingOption,
}: {
  actionsMount?: HTMLDivElement | null;
  hideSideNav?: boolean;
  externalView?: { type: "all" } | { type: "album"; id: string | null };
  hideNewActions?: boolean;
  onOpenMedia?: (id: string) => void;
  onOpenMediaTab?: (tabId: string, title: string, mediaIds: string[]) => void;
  onCreate?: (kind: PreviousNewKind) => void;
  onCreateContainer?: (kind: PreviousNewKind) => void;
  newAlbumSignal?: number;
  showMeetingOption?: boolean;
} = {}) {
  const { user, session, mode, activeEntityId, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const accessToken = session?.access_token ?? null;
  const isTeamMode = (mode === "team" || mode === "organizer") || !!activeEntityId;
  const [albums, setAlbums] = useState<Album[]>([]);
  const [items, setItems] = useState<MediaItem[]>([]);
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [lightboxUrls, setLightboxUrls] = useState<Record<string, string>>({});
  const [internalView, setInternalView] = useState<{ type: "all" } | { type: "album"; id: string | null }>({
    type: "all",
  });
  const view = externalView ?? internalView;
  const setView = setInternalView;
  const [albumsOpen, setAlbumsOpen] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const lastAlbumSigRef = useRef<number | undefined>(newAlbumSignal);
  useEffect(() => {
    if (newAlbumSignal === undefined) return;
    if (lastAlbumSigRef.current === newAlbumSignal) return;
    lastAlbumSigRef.current = newAlbumSignal;
    setCreateOpen(true);
  }, [newAlbumSignal]);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [lastClickedId, setLastClickedId] = useState<string | null>(null);
  const [albumBg] = useLibrarySetting<"light" | "dark">("media:album-bg", "light");
  const isDarkAlbum = albumBg === "dark";
  const albumBgClass = isDarkAlbum ? "bg-zinc-950 text-zinc-100" : "bg-white text-foreground";
  const albumBarClass = isDarkAlbum
    ? "bg-zinc-950 text-zinc-100"
    : "bg-white text-foreground";
  const [openItems, setOpenItems] = useState<MediaItem[] | null>(null);
  const [attended, setAttended] = useState<AttendedEvent[]>([]);
  const [userName, setUserName] = useState<string>("");
  const [revealed, setRevealed] = useState<Set<string>>(new Set());
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const [itemAlbums, setItemAlbums] = useState<Record<string, string[]>>({});
  const [teamId, setTeamId] = useState<string | null>(null);
  const [albumMenuFor, setAlbumMenuFor] = useState<string | null>(null);
  const [albumDragId, setAlbumDragId] = useState<string | null>(null);
  const [albumDragHandle, setAlbumDragHandle] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<Album | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const persistAlbumOrder = useCallback(async (next: Album[]) => {
    // Write sort_order based on current array index (pinned first already handled by sort)
    await Promise.all(
      next.map((a, idx) =>
        supabase.from("media_albums").update({ sort_order: idx }).eq("id", a.id),
      ),
    );
  }, []);

  const togglePin = async (album: Album) => {
    setAlbumMenuFor(null);
    const { error } = await supabase
      .from("media_albums")
      .update({ pinned: !album.pinned })
      .eq("id", album.id);
    if (error) toast.error(error.message);
    else { void load(); window.dispatchEvent(new Event("library:refresh")); }
  };

  const deleteAlbum = async (album: Album) => {
    setConfirmDelete(null);
    const { error } = await supabase.from("media_albums").delete().eq("id", album.id);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(`Deleted "${album.name}"`);
    if (view.type === "album" && view.id === album.id) setView({ type: "all" });
    void load();
    window.dispatchEvent(new Event("library:refresh"));
  };

  const setAsCover = async (
    mediaId: string,
    target: "athlete" | "photographer" | "team" | "company",
  ) => {
    if (!user) return;
    if (target === "athlete") {
      const { error } = await supabase
        .from("profiles")
        .update({ athlete_cover_media_id: mediaId })
        .eq("id", user.id);
      if (error) toast.error(error.message);
      else toast.success("Set as athlete profile image");
    } else if (target === "photographer") {
      const { error } = await supabase
        .from("profiles")
        .update({ photographer_cover_media_id: mediaId })
        .eq("id", user.id);
      if (error) toast.error(error.message);
      else toast.success("Set as photographer profile image");
    } else if (target === "team") {
      const { data: team } = await supabase
        .from("teams")
        .select("id")
        .eq("owner_id", user.id)
        .maybeSingle();
      if (!team) {
        toast.error("No team found");
        return;
      }
      const { error } = await supabase
        .from("teams")
        .update({ cover_media_id: mediaId })
        .eq("id", team.id);
      if (error) toast.error(error.message);
      else toast.success("Set as team profile image");
    }
    setMenuFor(null);
  };

  useEffect(() => {
    if (!authLoading && !user) navigate({ to: "/auth" });
  }, [authLoading, user, navigate]);

  // Auto-open the upload dialog when ?new=1 is in URL (from + dropdown in Previous tab)
  const mediaSearch = useSearch({ from: "/media" });
  useEffect(() => {
    if (mediaSearch.new === "1" && mediaSearch.tab === "media") {
      setUploadOpen(true);
      navigate({ to: "/media", search: { tab: "media" }, replace: true });
    }
  }, [mediaSearch.new, mediaSearch.tab, navigate]);

  const load = useCallback(async () => {
    if (!user) return;
    const [{ data: r }, { data: p }] = await Promise.all([
      supabase
        .from("registrations")
        .select("event_id, events(id,title,organizer,starts_at)")
        .eq("user_id", user.id),
      supabase.from("profiles").select("first_name,last_name,email").eq("id", user.id).maybeSingle(),
    ]);
    const name =
      [p?.first_name, p?.last_name].filter(Boolean).join(" ").trim() ||
      p?.email ||
      user.email ||
      "";
    setUserName(name);

    if (isTeamMode) {
      // Prefer the user's currently active entity selection. Fall back to the
      // first owned team only when nothing is selected (legacy single-team users).
      let team: { id: string; name: string } | null = null;
      if (activeEntityId) {
        const { data } = await supabase
          .from("teams")
          .select("id,name")
          .eq("id", activeEntityId)
          .maybeSingle();
        team = data ?? null;
      }
      if (!team) {
        const { data } = await supabase
          .from("teams")
          .select("id,name")
          .eq("owner_id", user.id)
          .order("created_at", { ascending: true })
          .limit(1)
          .maybeSingle();
        team = data ?? null;
      }
      if (!team) {
        setTeamId(null);
        setAlbums([]);
        setItems([]);
        setAttended([]);
        return;
      }
      setTeamId(team.id);
      // Team-scoped albums only
      const { data: a } = await supabase
        .from("media_albums")
        .select("id,name,pinned,sort_order")
        .eq("team_id", team.id)
        .order("pinned", { ascending: false })
        .order("sort_order", { ascending: true })
        .order("created_at", { ascending: false });
      setAlbums((a ?? []) as Album[]);

      const { data: orgEvents } = await supabase
        .from("events")
        .select("id,title,organizer,starts_at")
        .eq("organizer", team.name);
      // Team library = items tagged with this team_id. Fully isolated from personal.
      const { data: m } = await supabase
        .from("media_items")
        .select("*")
        .eq("team_id", team.id)
        .order("created_at", { ascending: false });
      setItems((m as MediaItem[]) ?? []);
      setAttended((orgEvents as AttendedEvent[]) ?? []);
    } else {
      setTeamId(null);
      // Personal albums only (no team_id)
      const { data: a } = await supabase
        .from("media_albums")
        .select("id,name,pinned,sort_order")
        .is("team_id", null)
        .eq("user_id", user.id)
        .order("pinned", { ascending: false })
        .order("sort_order", { ascending: true })
        .order("created_at", { ascending: false });
      setAlbums((a ?? []) as Album[]);

      // Individual library = items the user owns that are NOT linked to a team,
      // plus items where they are the subject (shot by an organizer/photographer).
      const subjectName = name.toLowerCase();
      const { data: m } = await supabase
        .from("media_items")
        .select("*")
        .order("created_at", { ascending: false });
      const all = (m as MediaItem[]) ?? [];
      const filteredItems = all.filter(
        (it) =>
          (it.user_id === user.id && !it.team_id) ||
          (subjectName &&
            it.user_id !== user.id &&
            (it.subject ?? "").toLowerCase().includes(subjectName)),
      );
      setItems(filteredItems);
      const ev: AttendedEvent[] = [];
      const seen = new Set<string>();
      type Reg = { events: AttendedEvent | null };
      for (const row of (r as unknown as Reg[]) ?? []) {
        const e = row.events;
        if (e && !seen.has(e.id)) {
          seen.add(e.id);
          ev.push(e);
        }
      }
      setAttended(ev);
    }

    // Load many-to-many album links for the visible items
    const itemIds = (isTeamMode ? [] : []).concat(); // placeholder, refilled below
    // We re-derive after setItems; query separately using user.id-owned items + linked items
    const { data: links } = await supabase
      .from("media_item_albums")
      .select("media_item_id,album_id");
    const map: Record<string, string[]> = {};
    for (const row of (links as { media_item_id: string; album_id: string }[] | null) ?? []) {
      (map[row.media_item_id] ??= []).push(row.album_id);
    }
    setItemAlbums(map);
    void itemIds;
  }, [user, isTeamMode, activeEntityId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    let cancel = false;
    (async () => {
      const next: Record<string, string> = {};
      for (const it of items) {
        if (urls[it.id]) {
          next[it.id] = urls[it.id];
          continue;
        }
        const u = await signedThumbUrl(it.storage_path, it.media_type === "photo");
        if (u) next[it.id] = u;
      }
      if (!cancel) setUrls(next);
    })();
    return () => {
      cancel = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items]);

  const filtered = useMemo(() => {
    let list = items;
    if (view.type === "album") {
      list = view.id === null
        ? list.filter((i) => (itemAlbums[i.id]?.length ?? 0) === 0 && !i.album_id)
        : list.filter(
            (i) => itemAlbums[i.id]?.includes(view.id as string) || i.album_id === view.id,
          );
    }
    const q = searchQuery.trim().toLowerCase();
    if (q) {
      list = list.filter((i) =>
        ((i.storage_path as string).split("/").pop() || "").toLowerCase().includes(q),
      );
    }
    return list;
  }, [items, view, itemAlbums, searchQuery]);

  // Lazy-load higher-quality URLs for items opened in the lightbox, plus neighbor prefetch.
  useEffect(() => {
    if (!openItems || openItems.length === 0) return;
    let cancel = false;
    (async () => {
      const indices = new Set<number>();
      for (const it of openItems) {
        const i0 = filtered.findIndex((f) => f.id === it.id);
        if (i0 < 0) continue;
        for (let d = -2; d <= 2; d++) {
          const i = i0 + d;
          if (i >= 0 && i < filtered.length) indices.add(i);
        }
      }
      const targets = Array.from(indices).map((i) => filtered[i]);
      const next: Record<string, string> = { ...lightboxUrls };
      let changed = false;
      for (const it of targets) {
        if (next[it.id]) continue;
        const u = await signedLightboxUrl(it.storage_path, it.media_type === "photo");
        if (u) {
          next[it.id] = u;
          changed = true;
        }
      }
      if (!cancel && changed) setLightboxUrls(next);
    })();
    return () => {
      cancel = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openItems]);

  useEffect(() => {
    if (searchOpen) {
      const t = setTimeout(() => searchInputRef.current?.focus(), 60);
      return () => clearTimeout(t);
    }
  }, [searchOpen]);

  const closeSearch = () => {
    setSearchQuery("");
    setSearchOpen(false);
  };

  const toggleSel = (id: string) => {
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  };

  const exitSelect = () => {
    setSelectMode(false);
    setSelected(new Set());
  };

  const tabTitleFor = (list: MediaItem[]) => {
    if (list.length === 0) return "Media";
    const first = list[0];
    const evTitle = attended.find((e) => e.id === first.event_id)?.title;
    if (list.length === 1) return evTitle || "Media";
    return evTitle ? `${evTitle} (${list.length})` : `Media (${list.length})`;
  };

  const openSelected = () => {
    if (selected.size === 0) return;
    const list = items.filter((i) => selected.has(i.id));
    if (onOpenMediaTab) {
      onOpenMediaTab(`media:${list.map((i) => i.id).sort().join(",")}`, tabTitleFor(list), list.map((i) => i.id));
      exitSelect();
    } else {
      setOpenItems(list);
    }
  };

  const handleDelete = async () => {
    if (selected.size === 0) return;
    if (!confirm(`Delete ${selected.size} item(s)? This cannot be undone.`)) return;
    const ids = Array.from(selected);
    const paths = items.filter((i) => ids.includes(i.id)).map((i) => i.storage_path);
    await supabase.storage.from("media").remove(paths);
    await supabase.from("media_items").delete().in("id", ids);
    toast.success("Deleted");
    exitSelect();
    void load();
  };

  if (authLoading || !user) return null;

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
          aria-label="Search media"
          className="grid h-9 w-9 shrink-0 place-items-center text-muted-foreground transition hover:text-ink"
        >
          <Search className="h-4 w-4" />
        </button>
        <input
          ref={searchInputRef}
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Escape") closeSearch();
          }}
          placeholder="Search media"
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
      {onCreate && (
        <LibraryPlusMenu
          onCreate={onCreate}
          onCreateContainer={onCreateContainer}
          showMeetingOption={showMeetingOption}
        />
      )}
    </>
  );

  const inAlbum = view.type === "album";
  const pageBgClass = inAlbum ? albumBgClass : "bg-white text-foreground";
  const barTranslucent = (inAlbum ? isDarkAlbum : false)
    ? "bg-zinc-950/80 text-zinc-100"
    : "bg-white/80 text-foreground";

  return (
    <div className={`flex min-h-full flex-col ${pageBgClass}`}>
      {/* Per-page Search/Plus removed — using the global top tab bar's actions instead. */}
      {void actions}

      {/* Always-on frozen top bar — translucent + blurred so it matches the canvas at rest, frosts content on scroll. */}
      <div className={`sticky top-0 z-20 flex h-11 shrink-0 items-center justify-end gap-1 px-4 backdrop-blur-xl ${barTranslucent}`}>
        <GalleryBarBtn
          disabled={selected.size === 0}
          ariaLabel="Favorite"
          onClick={() => toast.success("Favorited")}
        >
          <Heart className="h-4 w-4" />
        </GalleryBarBtn>
        <GalleryBarBtn
          disabled={selected.size === 0}
          ariaLabel="Delete"
          onClick={() => void handleDelete()}
        >
          <Trash2 className="h-4 w-4" />
        </GalleryBarBtn>
        <GalleryBarBtn
          disabled={selected.size === 0}
          ariaLabel="More"
          onClick={() => toast("More actions coming soon")}
        >
          <MoreVertical className="h-4 w-4" />
        </GalleryBarBtn>
      </div>

      <div className={`grid flex-1 gap-8 overflow-y-auto ${hideSideNav ? "md:grid-cols-1" : "md:grid-cols-[200px_1fr]"}`}>
        {!hideSideNav && (
        <nav className="-ml-2 flex flex-col gap-0.5">
          <NavBtn active={view.type === "all"} onClick={() => setView({ type: "all" })}>
            All
          </NavBtn>
          <button
            onClick={() => setAlbumsOpen((o) => !o)}
            className="flex items-center justify-between rounded-md px-3 py-2 text-left text-sm text-muted-foreground transition hover:text-ink"
          >
            <span>Albums</span>
            {albumsOpen ? (
              <ChevronDown className="h-3.5 w-3.5" />
            ) : (
              <ChevronRight className="h-3.5 w-3.5" />
            )}
          </button>
          {albumsOpen && (
            <div className="ml-3 flex flex-col gap-0.5 border-l border-hairline pl-2">
              <NavBtn
                small
                active={view.type === "album" && view.id === null}
                onClick={() => setView({ type: "album", id: null })}
              >
                Unsorted
              </NavBtn>
              {albums.map((a) => {
                const active = view.type === "album" && view.id === a.id;
                const isDragging = albumDragId === a.id;
                return (
                  <div
                    key={a.id}
                    draggable={albumDragHandle === a.id}
                    onDragStart={(e) => {
                      if (albumDragHandle !== a.id) {
                        e.preventDefault();
                        return;
                      }
                      setAlbumDragId(a.id);
                      e.dataTransfer.effectAllowed = "move";
                      e.dataTransfer.setData("text/plain", a.id);
                    }}
                    onDragEnter={(e) => {
                      e.preventDefault();
                      if (albumDragId && albumDragId !== a.id) {
                        setAlbums((arr) => {
                          const from = arr.findIndex((x) => x.id === albumDragId);
                          const to = arr.findIndex((x) => x.id === a.id);
                          if (from < 0 || to < 0 || from === to) return arr;
                          // Only reorder within same pinned group
                          if (arr[from].pinned !== arr[to].pinned) return arr;
                          const next = [...arr];
                          const [moved] = next.splice(from, 1);
                          next.splice(to, 0, moved);
                          return next;
                        });
                      }
                    }}
                    onDragOver={(e) => {
                      e.preventDefault();
                      e.dataTransfer.dropEffect = "move";
                    }}
                    onDragEnd={() => {
                      const final = albums;
                      setAlbumDragId(null);
                      setAlbumDragHandle(null);
                      void persistAlbumOrder(final);
                    }}
                    onDrop={(e) => {
                      e.preventDefault();
                    }}
                    className={`group relative flex items-center gap-1 rounded-md transition ${
                      active ? "bg-secondary" : "hover:bg-secondary/60"
                    } ${isDragging ? "opacity-40" : ""}`}
                  >
                    <span
                      className="grid h-7 w-4 shrink-0 cursor-grab place-items-center text-muted-foreground/50 opacity-0 transition group-hover:opacity-100 hover:text-ink active:cursor-grabbing"
                      onMouseDown={() => setAlbumDragHandle(a.id)}
                      onMouseUp={() => setAlbumDragHandle(null)}
                      onMouseLeave={() => {
                        if (!albumDragId) setAlbumDragHandle(null);
                      }}
                      title="Drag to reorder"
                      aria-label="Drag to reorder"
                    >
                      <GripVertical className="h-3 w-3" />
                    </span>
                    <button
                      onClick={() => setView({ type: "album", id: a.id })}
                      className={`flex min-w-0 flex-1 items-center gap-1.5 rounded-md py-1.5 pr-1 text-left text-xs transition ${
                        active ? "font-medium text-ink" : "text-muted-foreground hover:text-ink"
                      }`}
                    >
                      {a.pinned && (
                        <Pin className="h-2.5 w-2.5 shrink-0 fill-current text-ink/70" />
                      )}
                      <span className="truncate">{a.name}</span>
                    </button>
                    <div className="relative shrink-0">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setAlbumMenuFor(albumMenuFor === a.id ? null : a.id);
                        }}
                        className="grid h-7 w-7 place-items-center rounded-md text-muted-foreground/60 opacity-0 transition hover:bg-card hover:text-ink group-hover:opacity-100 data-[open=true]:opacity-100"
                        data-open={albumMenuFor === a.id}
                        aria-label="Album actions"
                      >
                        <MoreVertical className="h-3.5 w-3.5" />
                      </button>
                      {albumMenuFor === a.id && (
                        <>
                          <div
                            className="fixed inset-0 z-40"
                            onClick={() => setAlbumMenuFor(null)}
                          />
                          <div className="absolute right-0 top-8 z-50 w-40 overflow-hidden rounded-md border border-hairline bg-card shadow-lg">
                            <button
                              onClick={() => togglePin(a)}
                              className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs text-ink hover:bg-secondary"
                            >
                              {a.pinned ? (
                                <>
                                  <PinOff className="h-3.5 w-3.5" /> Unpin
                                </>
                              ) : (
                                <>
                                  <Pin className="h-3.5 w-3.5" /> Pin to top
                                </>
                              )}
                            </button>
                            {a.name !== "Profile" && (
                              <button
                                onClick={() => {
                                  setAlbumMenuFor(null);
                                  setConfirmDelete(a);
                                }}
                                className="flex w-full items-center gap-2 border-t border-hairline px-3 py-2 text-left text-xs text-destructive hover:bg-destructive/10"
                              >
                                <Trash2 className="h-3.5 w-3.5" /> Delete
                              </button>
                            )}
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                );
              })}
              {albums.length === 0 && (
                <span className="px-3 py-1.5 text-xs text-muted-foreground">No albums yet</span>
              )}
            </div>
          )}
        </nav>
        )}

        <section className="px-4 pb-8 pt-4">

          {filtered.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-hairline bg-card/40 py-20 text-center text-sm text-muted-foreground">
              No content yet. Upload your first photo or video.
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-1 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
              {filtered.map((it) => {
                const isSel = selected.has(it.id);
                const isRevealed = revealed.has(it.id);
                const eventTitle = attended.find((e) => e.id === it.event_id)?.title;
                const openItem = () => {
                  if (onOpenMediaTab) {
                    onOpenMediaTab(`media:${it.id}`, tabTitleFor([it]), [it.id]);
                  } else if (onOpenMedia) onOpenMedia(it.id);
                  else setOpenItems([it]);
                };
                return (
                  <div
                    key={it.id}
                    onClick={(e) => {
                      if (selectMode) { toggleSel(it.id); return; }
                      if (e.shiftKey && lastClickedId) {
                        const ids = filtered.map((f) => f.id);
                        const a = ids.indexOf(lastClickedId);
                        const b = ids.indexOf(it.id);
                        if (a >= 0 && b >= 0) {
                          const [lo, hi] = a < b ? [a, b] : [b, a];
                          setSelected((s) => {
                            const n = new Set(s);
                            for (let i = lo; i <= hi; i++) n.add(ids[i]);
                            return n;
                          });
                        }
                      } else if (e.metaKey || e.ctrlKey) {
                        toggleSel(it.id);
                        setLastClickedId(it.id);
                      } else {
                        setSelected(new Set([it.id]));
                        setLastClickedId(it.id);
                      }
                    }}
                    onDoubleClick={(e) => { e.preventDefault(); openItem(); }}
                    className={`group relative aspect-square cursor-default overflow-hidden rounded-sm bg-secondary ${
                      isSel ? "ring-[1.5px] ring-inset ring-foreground" : ""
                    }`}
                  >
                    {it.media_type === "photo" ? (
                      urls[it.id] && (
                        <img
                          src={urls[it.id]}
                          alt=""
                          loading="lazy"
                          decoding="async"
                          className="h-full w-full object-cover transition group-hover:scale-[1.02]"
                        />
                      )
                    ) : (
                      <video
                        src={urls[it.id]}
                        className="h-full w-full object-cover"
                        muted
                        playsInline
                        preload="metadata"
                        onMouseEnter={(e) => {
                          const v = e.currentTarget;
                          try {
                            v.currentTime = 0;
                            void v.play();
                          } catch {}
                        }}
                        onMouseLeave={(e) => {
                          const v = e.currentTarget;
                          v.pause();
                          v.currentTime = 0;
                        }}
                      />
                    )}
                    {selectMode && (
                      <div className="absolute left-2 top-2 rounded-full bg-background/80 p-0.5">
                        {isSel ? (
                          <CheckSquare className="h-4 w-4 text-primary" />
                        ) : (
                          <Square className="h-4 w-4 text-muted-foreground" />
                        )}
                      </div>
                    )}
                    <div
                      className={`pointer-events-none absolute inset-0 bg-black/55 transition-opacity duration-300 ${
                        isRevealed ? "opacity-100" : "opacity-0"
                      }`}
                    />
                    <div
                      className={`absolute inset-x-0 top-0 space-y-1 p-3 text-[11px] leading-tight text-white transition-all duration-300 ${
                        isRevealed ? "pointer-events-auto translate-y-0 opacity-100" : "pointer-events-none -translate-y-1 opacity-0"
                      }`}
                    >
                      <InfoLine label="Subject" value={it.subject} />
                      <InfoLine
                        label="Event"
                        value={eventTitle ?? null}
                        to={it.event_id ? "/events/$eventId" : undefined}
                        params={it.event_id ? { eventId: it.event_id } : undefined}
                      />
                      <InfoLine
                        label="Photograph"
                        value={
                          it.organizer
                            ? `${it.photographer ?? "—"} (${it.organizer})`
                            : it.photographer
                        }
                        to={it.user_id ? "/u/$userId" : undefined}
                        params={it.user_id ? { userId: it.user_id } : undefined}
                      />
                    </div>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setRevealed((s) => {
                          const n = new Set(s);
                          if (n.has(it.id)) n.delete(it.id);
                          else n.add(it.id);
                          return n;
                        });
                      }}
                      className="absolute bottom-2 left-2 z-10 cursor-pointer rounded-full bg-black/50 p-1.5 text-white transition hover:bg-black/70"
                      aria-label="Show details"
                    >
                      <ArrowUp className="h-3.5 w-3.5" />
                    </button>

                    {it.user_id === user.id && (
                      <div className="absolute right-2 top-2 z-10">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setMenuFor((c) => (c === it.id ? null : it.id));
                          }}
                          className="rounded-full bg-black/50 p-1.5 text-white transition hover:bg-black/70"
                          aria-label="More"
                        >
                          <MoreVertical className="h-3.5 w-3.5" />
                        </button>
                        {menuFor === it.id && (
                          <div
                            onClick={(e) => e.stopPropagation()}
                            className="absolute right-0 top-9 z-20 w-56 overflow-hidden rounded-lg border border-hairline bg-card text-xs shadow-xl"
                          >
                            <p className="mono px-3 pt-2 pb-1 text-[9px] uppercase tracking-widest text-muted-foreground">
                              Use as profile image
                            </p>
                            <button
                              onClick={() => void setAsCover(it.id, "athlete")}
                              className="flex w-full items-center gap-2 px-3 py-2 text-left text-ink hover:bg-secondary"
                            >
                              <UserIcon className="h-3.5 w-3.5" /> Athlete
                            </button>
                            <button
                              onClick={() => void setAsCover(it.id, "photographer")}
                              className="flex w-full items-center gap-2 px-3 py-2 text-left text-ink hover:bg-secondary"
                            >
                              <Camera className="h-3.5 w-3.5" /> Photographer
                            </button>
                            <button
                              onClick={() => void setAsCover(it.id, "team")}
                              className="flex w-full items-center gap-2 px-3 py-2 text-left text-ink hover:bg-secondary"
                            >
                              <UsersIcon className="h-3.5 w-3.5" /> Team
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </div>

      {createOpen && (
        <CreateAlbumDialog
          onClose={() => setCreateOpen(false)}
          onCreated={() => {
            setCreateOpen(false);
            void load();
          }}
          userId={user.id}
          teamId={isTeamMode ? teamId : null}
        />
      )}
      {uploadOpen && (
        <UploadDialog
          albums={albums}
          attended={attended}
          userId={user.id}
          userName={userName}
          mode={mode}
          teamId={isTeamMode ? teamId : null}
          onClose={() => setUploadOpen(false)}
          onUploaded={() => {
            setUploadOpen(false);
            void load();
          }}
        />
      )}
      {confirmDelete && (
        <ConfirmDialog
          title="Delete album?"
          message={
            <>
              <span className="font-medium text-ink">"{confirmDelete.name}"</span> will be permanently
              removed. The photos and videos inside will not be deleted — they will simply move to{" "}
              <span className="font-medium text-ink">Unsorted</span>.
            </>
          }
          confirmLabel="Delete album"
          destructive
          onCancel={() => setConfirmDelete(null)}
          onConfirm={() => void deleteAlbum(confirmDelete)}
        />
      )}
      {openItems && (
        <Lightbox
          items={openItems}
          urls={lightboxUrls}
          thumbUrls={urls}
          albums={albums}
          attended={attended}
          userName={userName}
          itemAlbums={itemAlbums}
          onClose={() => {
            setOpenItems(null);
            exitSelect();
          }}
          onChanged={() => void load()}
          isTeamMode={isTeamMode}
        />
      )}
    </div>
  );
}

function NavBtn({
  active,
  onClick,
  children,
  small,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
  small?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className={`rounded-md px-3 ${small ? "py-1.5 text-xs" : "py-2 text-sm"} text-left transition ${
        active ? "bg-secondary font-medium text-ink" : "text-muted-foreground hover:text-ink"
      }`}
    >
      {children}
    </button>
  );
}

function GalleryBarBtn({
  disabled,
  ariaLabel,
  onClick,
  children,
}: {
  disabled?: boolean;
  ariaLabel: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={ariaLabel}
      disabled={disabled}
      onClick={(e) => { e.stopPropagation(); onClick(); }}
      className={`grid h-9 w-9 place-items-center rounded-full transition ${
        disabled
          ? "pointer-events-none text-muted-foreground/40"
          : "text-current hover:bg-foreground/10"
      }`}
    >
      {children}
    </button>
  );
}

function InfoLine({
  label,
  value,
  to,
  params,
}: {
  label: string;
  value: string | null | undefined;
  to?: "/events/$eventId" | "/u/$userId";
  params?: { eventId: string } | { userId: string };
}) {
  const text = value && value.trim() ? value : "—";
  const linkable = !!to && !!params && text !== "—";
  return (
    <div onClick={(e) => e.stopPropagation()}>
      <span className="mono text-[9px] uppercase tracking-widest text-white/60">{label}: </span>
      {linkable ? (
        <Link to={to} params={params as never} className="text-white underline-offset-2 hover:underline">
          {text}
        </Link>
      ) : (
        <span className="text-white/90">{text}</span>
      )}
    </div>
  );
}

function CreateAlbumDialog({
  onClose,
  onCreated,
  userId,
  teamId,
}: {
  onClose: () => void;
  onCreated: () => void;
  userId: string;
  teamId: string | null;
}) {
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);

  const create = async () => {
    if (!name.trim() || busy) return;
    setBusy(true);
    // Place new album at the bottom by computing next sort_order in scope
    const scopeQ = supabase.from("media_albums").select("sort_order").order("sort_order", { ascending: false }).limit(1);
    const { data: maxRows } = teamId
      ? await scopeQ.eq("team_id", teamId)
      : await scopeQ.is("team_id", null).eq("user_id", userId);
    const nextOrder = ((maxRows?.[0]?.sort_order as number | undefined) ?? -1) + 1;
    const { error } = await supabase
      .from("media_albums")
      .insert({
        user_id: userId,
        team_id: teamId,
        name: name.trim(),
        sort_order: nextOrder,
      });
    setBusy(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Album created");
    window.dispatchEvent(new Event("library:refresh"));
    onCreated();
  };

  return (
    <Modal title="New album" onClose={onClose}>
      <Field label="Name" value={name} onChange={setName} autoFocus onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void create(); } }} />
      <div className="mt-6 flex justify-end gap-2">
        <button
          onClick={onClose}
          className="rounded-full border border-hairline bg-card px-4 py-2 text-xs text-muted-foreground hover:text-ink"
        >
          Cancel
        </button>
        <button
          onClick={create}
          disabled={busy || !name.trim()}
          className="rounded-full bg-primary px-5 py-2 text-xs text-primary-foreground hover:opacity-90 disabled:opacity-50"
        >
          {busy ? "Creating…" : "Create"}
        </button>
      </div>
    </Modal>
  );
}

function UploadDialog({
  albums,
  attended,
  userId,
  userName,
  mode,
  teamId,
  onClose,
  onUploaded,
}: {
  albums: Album[];
  attended: AttendedEvent[];
  userId: string;
  userName: string;
  mode: "participant" | "organizer" | "team";
  teamId: string | null;
  onClose: () => void;
  onUploaded: (insertedIds: string[]) => void;
}) {
  const { session } = useAuth();
  const inputRef = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [albumIds, setAlbumIds] = useState<string[]>([]);
  const [fileProgress, setFileProgress] = useState<Record<number, number>>({});
  const [eventId, setEventId] = useState<string | null>(null);
  const [eventName, setEventName] = useState("");
  const [organizer, setOrganizer] = useState("");
  const [subject, setSubject] = useState("");
  const [busy, setBusy] = useState(false);

  // Photographer is locked to user (team logic later)
  const photographer = userName || "You";

  const doneCount = Object.values(fileProgress).filter((p) => p >= 100).length;

  const uploadOne = (
    file: File,
    path: string,
    accessToken: string,
    idx: number,
    parallelChunks: number,
  ) =>
    new Promise<void>((resolve, reject) => {
      const upload = new tus.Upload(file, {
        endpoint: `${import.meta.env.VITE_SUPABASE_URL}/storage/v1/upload/resumable`,
        headers: {
          authorization: `Bearer ${accessToken}`,
          "x-upsert": "true",
        },
        uploadDataDuringCreation: true,
        removeFingerprintOnSuccess: true,
        chunkSize: 6 * 1024 * 1024,
        parallelUploads: parallelChunks,
        metadata: {
          bucketName: "media",
          objectName: path,
          contentType: file.type || "application/octet-stream",
          cacheControl: "3600",
        },
        onError: (err) => reject(err),
        onProgress: (bytesUploaded, bytesTotal) => {
          const pct = Math.round((bytesUploaded / bytesTotal) * 100);
          setFileProgress((p) => ({ ...p, [idx]: pct }));
        },
        onSuccess: () => {
          setFileProgress((p) => ({ ...p, [idx]: 100 }));
          resolve();
        },
      });
      upload.start();
    });

  const upload = async () => {
    if (files.length === 0) return;
    const accessToken = session?.access_token;
    if (!accessToken) {
      toast.error("Not signed in");
      return;
    }
    for (const f of files) {
      if (f.size > MEDIA_MAX_BYTES) {
        toast.error(`File "${f.name}" is too large. Maximum is 5 GB.`);
        return;
      }
    }
    setBusy(true);
    setFileProgress({});
    try {
      const insertedIds: string[] = [];
      const failures: { name: string; error: Error }[] = [];
      const parallelChunks = 1;

      let next = 0;
      const runOne = async (): Promise<void> => {
        while (true) {
          const i = next++;
          if (i >= files.length) return;
          const file = files[i];
          try {
            const ext = file.name.split(".").pop();
            const path = `${userId}/${crypto.randomUUID()}.${ext}`;
            await uploadOne(file, path, accessToken, i, parallelChunks);
            const isVideo = file.type.startsWith("video");
            const { data: inserted, error: insErr } = await supabase
              .from("media_items")
              .insert({
                user_id: userId,
                team_id: teamId,
                storage_path: path,
                media_type: isVideo ? "video" : "photo",
                mime_type: file.type,
                file_size: file.size,
                album_id: albumIds[0] ?? null,
                event_id: eventId,
                organizer: organizer || null,
                photographer,
                subject: subject || null,
                uploaded_in_mode: mode,
              })
              .select("id")
              .single();
            if (insErr) throw insErr;
            if (inserted) insertedIds.push(inserted.id);
          } catch (e) {
            failures.push({ name: file.name, error: e as Error });
          }
        }
      };
      const FILE_CONCURRENCY = 3;
      await Promise.all(
        Array.from({ length: Math.min(FILE_CONCURRENCY, files.length) }, runOne),
      );

      if (failures.length === files.length) {
        toast.error(failures[0].error.message);
      } else {
        if (insertedIds.length > 0 && albumIds.length > 0) {
          await syncMediaAlbums(insertedIds, albumIds, "replace");
        }
        if (failures.length > 0) {
          toast.error(
            `${failures.length} of ${files.length} failed: ${failures[0].error.message}`,
          );
        }
        const successCount = files.length - failures.length;
        toast.success(successCount > 1 ? `Uploaded ${successCount} files` : "Uploaded");
        onUploaded(insertedIds);
      }
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
      setFileProgress({});
    }
  };

  return (
    <Modal title="Upload content" onClose={onClose}>
      <div>
        <button
          onClick={() => inputRef.current?.click()}
          className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-hairline bg-background px-4 py-8 text-sm text-muted-foreground hover:text-ink"
        >
          <Upload className="h-4 w-4" />
          {files.length === 0
            ? "Choose photos or videos"
            : files.length === 1
              ? files[0].name
              : `${files.length} files selected`}
        </button>
        <input
          ref={inputRef}
          type="file"
          accept="image/*,video/*"
          multiple
          className="hidden"
          onChange={(e) => setFiles(e.target.files ? Array.from(e.target.files) : [])}
        />
      </div>
      {busy && files.length > 0 && (
        <div className="mt-3 space-y-2 rounded-xl border border-hairline bg-background/60 p-3">
          {files.map((f, i) => {
            const pct = fileProgress[i] ?? 0;
            return (
              <div key={i}>
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-xs text-ink" title={f.name}>{f.name}</span>
                  <span className="shrink-0 mono text-[10px] tabular-nums text-muted-foreground">{pct}%</span>
                </div>
                <div className="mt-1 h-0.5 w-full overflow-hidden rounded-full bg-secondary">
                  <div
                    className={`h-full transition-all duration-150 ${pct >= 100 ? "bg-primary" : "bg-ink"}`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}
      <div className="mt-4">
        <Label>Albums</Label>
        <div className="mt-1">
          <AlbumMultiSelect
            albums={albums}
            value={albumIds}
            onChange={setAlbumIds}
            placeholder="No album"
          />
        </div>
        <p className="mt-1 text-[11px] text-muted-foreground">
          Add this content to one or more albums.
        </p>
      </div>

      <p className="mt-6 mono text-[10px] uppercase tracking-widest text-muted-foreground">
        About
      </p>
      <div className="mt-2 space-y-3">
        <EventPicker
          attended={attended}
          eventId={eventId}
          eventName={eventName}
          onChange={(id, name, org) => {
            setEventId(id);
            setEventName(name);
            if (org) setOrganizer(org);
          }}
        />
        <Field label="Organizer" value={organizer} onChange={setOrganizer} />
        <div>
          <Label>Photographer</Label>
          <div className="mt-1 flex items-center justify-between rounded-xl border border-hairline bg-secondary/40 px-4 py-2.5 text-sm text-ink">
            <span>{photographer}</span>
            <span className="mono text-[10px] uppercase tracking-widest text-muted-foreground">
              Locked
            </span>
          </div>
          <p className="mt-1 text-[11px] text-muted-foreground">
            You're not part of a team yet. Teams will let you assign photographers later.
          </p>
        </div>
        <SubjectPicker
          eventId={eventId}
          subject={subject}
          onChange={setSubject}
        />
      </div>

      <div className="mt-6 flex justify-end gap-2">
        <button
          onClick={onClose}
          className="rounded-full border border-hairline bg-card px-4 py-2 text-xs text-muted-foreground hover:text-ink"
        >
          Cancel
        </button>
        <button
          onClick={upload}
          disabled={busy || files.length === 0}
          className="rounded-full bg-primary px-5 py-2 text-xs text-primary-foreground hover:opacity-90 disabled:opacity-50"
        >
          {busy
            ? `Uploading ${doneCount}/${files.length}…`
            : files.length > 1
              ? `Upload ${files.length} files`
              : "Upload"}
        </button>
      </div>
    </Modal>
  );
}

function EventPicker({
  attended,
  eventId,
  eventName,
  onChange,
}: {
  attended: AttendedEvent[];
  eventId: string | null;
  eventName: string;
  onChange: (id: string | null, name: string, organizer: string | null) => void;
}) {
  const [q, setQ] = useState(eventName);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    setQ(eventName);
  }, [eventName]);

  const matches = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return attended.slice(0, 8);
    return attended
      .filter((e) => e.title.toLowerCase().includes(needle))
      .slice(0, 8);
  }, [attended, q]);

  const ownDefined = !eventId && q.trim().length > 0;

  return (
    <div>
      <Label>Event</Label>
      <div className="relative mt-1">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
        <input
          value={q}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          onChange={(e) => {
            setQ(e.target.value);
            onChange(null, e.target.value, null);
            setOpen(true);
          }}
          placeholder="Search attended events or type your own…"
          className="w-full rounded-xl border border-hairline bg-background pl-9 pr-3 py-2.5 text-sm text-ink outline-none focus:border-primary"
        />
        {open && (matches.length > 0 || ownDefined) && (
          <div className="absolute left-0 right-0 top-full z-20 mt-1 max-h-56 overflow-y-auto rounded-xl border border-hairline bg-popover p-1 shadow-lg">
            {matches.map((e) => (
              <button
                key={e.id}
                onMouseDown={(ev) => {
                  ev.preventDefault();
                  onChange(e.id, e.title, e.organizer);
                  setQ(e.title);
                  setOpen(false);
                }}
                className="block w-full rounded-md px-3 py-2 text-left text-sm text-ink hover:bg-secondary"
              >
                <div>{e.title}</div>
                <div className="text-[11px] text-muted-foreground">{e.organizer}</div>
              </button>
            ))}
            {ownDefined && (
              <div className="border-t border-hairline px-3 py-2 text-[11px] text-muted-foreground">
                Use "{q}" as own-defined event
              </div>
            )}
          </div>
        )}
      </div>
      {ownDefined && (
        <p className="mt-1 text-[11px] text-muted-foreground">
          Own-defined event — subject must be entered manually.
        </p>
      )}
    </div>
  );
}

function SubjectPicker({
  eventId,
  subject,
  onChange,
}: {
  eventId: string | null;
  subject: string;
  onChange: (v: string) => void;
}) {
  const [participants, setParticipants] = useState<string[]>([]);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!eventId) {
      setParticipants([]);
      return;
    }
    (async () => {
      const { data } = await supabase
        .from("registrations")
        .select("user_id, profiles:user_id(first_name,last_name)")
        .eq("event_id", eventId);
      type Row = { profiles: { first_name: string | null; last_name: string | null } | null };
      const names = ((data as unknown as Row[]) ?? [])
        .map((r) =>
          [r.profiles?.first_name, r.profiles?.last_name].filter(Boolean).join(" ").trim(),
        )
        .filter((n) => n.length > 0);
      setParticipants(Array.from(new Set(names)));
    })();
  }, [eventId]);

  const matches = useMemo(() => {
    const needle = subject.trim().toLowerCase();
    if (!needle) return participants.slice(0, 8);
    return participants.filter((n) => n.toLowerCase().includes(needle)).slice(0, 8);
  }, [participants, subject]);

  return (
    <div>
      <Label>Subject</Label>
      <div className="relative mt-1">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
        <input
          value={subject}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          onChange={(e) => {
            onChange(e.target.value);
            setOpen(true);
          }}
          placeholder={
            eventId ? "Pick from participants…" : "Type subject (own-defined event)…"
          }
          className="w-full rounded-xl border border-hairline bg-background pl-9 pr-3 py-2.5 text-sm text-ink outline-none focus:border-primary"
        />
        {open && eventId && matches.length > 0 && (
          <div className="absolute left-0 right-0 top-full z-20 mt-1 max-h-56 overflow-y-auto rounded-xl border border-hairline bg-popover p-1 shadow-lg">
            {matches.map((n) => (
              <button
                key={n}
                onMouseDown={(ev) => {
                  ev.preventDefault();
                  onChange(n);
                  setOpen(false);
                }}
                className="block w-full rounded-md px-3 py-2 text-left text-sm text-ink hover:bg-secondary"
              >
                {n}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function Lightbox({
  items,
  urls,
  thumbUrls,
  albums,
  attended,
  userName,
  itemAlbums,
  onClose,
  onChanged,
  isTeamMode,
}: {
  items: MediaItem[];
  urls: Record<string, string>;
  thumbUrls: Record<string, string>;
  albums: Album[];
  attended: AttendedEvent[];
  userName: string;
  itemAlbums: Record<string, string[]>;
  onClose: () => void;
  onChanged: () => void;
  isTeamMode?: boolean;
}) {
  const [tab, setTab] = useState<"about" | "access" | "draw" | "export">("about");
  const [idx, setIdx] = useState(0);
  const isMulti = items.length > 1;
  const current = items[idx];
  const url = current ? urls[current.id] : undefined;
  const isVideo = current?.media_type === "video";
  const drawing = useDrawingState();
  useEffect(() => { drawing.clear(); drawing.setEnabled(false); /* reset on item change */ /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [current?.id]);
  const tabs: ReadonlyArray<"about" | "access" | "draw" | "export"> = isVideo
    ? ["about", "access", "draw", "export"]
    : ["about", "access", "export"];
  useEffect(() => { if (!isVideo && tab === "draw") setTab("about"); }, [isVideo, tab]);

  const [editPanelOpen, setEditPanelOpen] = useState(false);
  const [albumBg] = useLibrarySetting<"light" | "dark">("media:album-bg", "light");
  const isDarkAlbum = albumBg === "dark";
  const albumBgClass = isDarkAlbum ? "bg-zinc-950 text-zinc-100" : "bg-white text-foreground";
  const albumBarClass = isDarkAlbum
    ? "bg-zinc-950 text-zinc-100"
    : "bg-white text-foreground";

  return (
    <div className="fixed inset-0 z-50 flex animate-in fade-in" onClick={onClose}>
      <div className={`absolute inset-0 ${isDarkAlbum ? "bg-black/95" : "bg-black/85"}`} />
      <div
        className={`relative z-10 flex h-full w-full flex-col ${albumBgClass}`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Row 1 — frozen top bar */}
        <div className={`flex h-11 flex-none items-center justify-between gap-2 px-4 ${albumBarClass}`}>
          <button
            type="button"
            onClick={onClose}
            aria-label="Back"
            className="grid h-9 w-9 place-items-center rounded-full text-current hover:bg-foreground/10"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => setEditPanelOpen((v) => !v)}
            aria-label="Edit"
            className={`grid h-9 w-9 place-items-center rounded-full transition ${
              editPanelOpen ? "bg-foreground/15" : "hover:bg-foreground/10"
            }`}
          >
            <Pencil className="h-4 w-4" />
          </button>
        </div>

        {/* Row 2 — media + sliding edit panel */}
        <div className="flex min-h-0 flex-1">
          <div className="flex min-h-0 min-w-0 flex-1 items-center justify-center p-4 transition-[flex-basis] duration-300 ease-out">
            {current?.media_type === "photo" ? (
              <PhotoLqip
                thumbSrc={current ? thumbUrls[current.id] : undefined}
                fullSrc={url}
              />
            ) : (
              <VideoPlayer src={url} drawing={drawing} theme={albumBg} />
            )}
          </div>
          <aside
            className={`flex min-h-0 flex-none flex-col overflow-hidden border-l border-hairline bg-background transition-[width] duration-300 ease-out ${
              editPanelOpen ? "w-96" : "w-0"
            }`}
          >
            <div className="flex w-96 flex-1 flex-col">
              <div className="flex items-center justify-between border-b border-hairline px-5 py-3">
                <div className="flex gap-1">
                  {tabs.map((t) => (
                    <button
                      key={t}
                      onClick={() => setTab(t)}
                      className={`rounded-full px-3 py-1.5 text-xs capitalize transition ${
                        tab === t ? "bg-secondary text-ink" : "text-muted-foreground hover:text-ink"
                      }`}
                    >
                      {t}
                    </button>
                  ))}
                </div>
                <button
                  onClick={() => setEditPanelOpen(false)}
                  className="rounded-full p-1.5 text-muted-foreground hover:bg-secondary"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <div className="flex-1 overflow-y-auto p-5">
                {tab === "about" && (
                  <AboutPanel
                    items={items}
                    albums={albums}
                    attended={attended}
                    userName={userName}
                    itemAlbums={itemAlbums}
                    onSaved={onChanged}
                  />
                )}
                {tab === "access" && (
                  <AccessPanel items={items} onSaved={onChanged} isTeamMode={isTeamMode} />
                )}
                {tab === "draw" && isVideo && <DrawPanel state={drawing} />}
                {tab === "export" && <SharePanel url={url} disabled={isMulti} items={items} urls={urls} />}
              </div>
            </div>
          </aside>
        </div>

        {/* Row 3 — dock strip */}
        {isMulti && (
          <div className="flex-none">
            <DockStrip items={items} urls={urls} activeIdx={idx} onSelect={setIdx} />
          </div>
        )}
      </div>
    </div>
  );
}

function AboutPanel({
  items,
  albums,
  attended,
  userName,
  itemAlbums,
  onSaved,
}: {
  items: MediaItem[];
  albums: Album[];
  attended: AttendedEvent[];
  userName: string;
  itemAlbums: Record<string, string[]>;
  onSaved: () => void;
}) {
  const isMulti = items.length > 1;
  const single = items[0];

  // Single-edit state
  const [eventId, setEventId] = useState<string | null>(single.event_id);
  const [eventName, setEventName] = useState<string>(
    attended.find((e) => e.id === single.event_id)?.title ?? "",
  );
  const [organizer, setOrganizer] = useState(single.organizer ?? "");
  const [subject, setSubject] = useState(single.subject ?? "");
  const initialAlbums = useMemo(() => {
    const fromMap = itemAlbums[single.id] ?? [];
    if (fromMap.length > 0) return fromMap;
    return single.album_id ? [single.album_id] : [];
  }, [itemAlbums, single]);
  const [albumIds, setAlbumIds] = useState<string[]>(initialAlbums);

  // Multi-edit state — show albums shared by ALL selected
  const sharedAlbums = useMemo(() => {
    if (items.length === 0) return [] as string[];
    const sets = items.map((i) => new Set(itemAlbums[i.id] ?? (i.album_id ? [i.album_id] : [])));
    return [...sets[0]].filter((id) => sets.every((s) => s.has(id)));
  }, [items, itemAlbums]);
  const [moveAlbumIds, setMoveAlbumIds] = useState<string[]>(sharedAlbums);

  const [busy, setBusy] = useState(false);
  const photographer = userName || "You";

  const saveSingle = async () => {
    setBusy(true);
    const { error } = await supabase
      .from("media_items")
      .update({
        event_id: eventId,
        organizer: organizer || null,
        subject: subject || null,
        album_id: albumIds[0] ?? null,
        photographer,
      })
      .eq("id", single.id);
    if (!error) {
      await syncMediaAlbums([single.id], albumIds, "replace");
    }
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("Saved");
    onSaved();
  };

  const saveMove = async () => {
    setBusy(true);
    const ids = items.map((i) => i.id);
    const { error } = await supabase
      .from("media_items")
      .update({ album_id: moveAlbumIds[0] ?? null })
      .in("id", ids);
    if (!error) {
      await syncMediaAlbums(ids, moveAlbumIds, "replace");
    }
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success(`Updated ${items.length} items`);
    onSaved();
  };

  if (isMulti) {
    return (
      <div className="space-y-4">
        <p className="rounded-lg border border-hairline bg-secondary/40 px-3 py-2 text-[11px] text-muted-foreground">
          {items.length} items selected. Choose one or more albums to assign them all to.
        </p>
        <div>
          <Label>Move to albums</Label>
          <div className="mt-1">
            <AlbumMultiSelect
              albums={albums}
              value={moveAlbumIds}
              onChange={setMoveAlbumIds}
              placeholder="No album (Unsorted)"
            />
          </div>
          <p className="mt-1 text-[11px] text-muted-foreground">
            Selected albums will replace each item's existing album set.
          </p>
        </div>
        <button
          onClick={saveMove}
          disabled={busy}
          className="w-full rounded-full bg-primary px-5 py-2.5 text-sm text-primary-foreground hover:opacity-90 disabled:opacity-50"
        >
          {busy ? "Saving…" : "Save"}
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <EventPicker
        attended={attended}
        eventId={eventId}
        eventName={eventName}
        onChange={(id, name, org) => {
          setEventId(id);
          setEventName(name);
          if (org && !organizer) setOrganizer(org);
        }}
      />
      <Field label="Organizer" value={organizer} onChange={setOrganizer} />
      <div>
        <Label>Photographer</Label>
        <div className="mt-1 flex items-center justify-between rounded-xl border border-hairline bg-secondary/40 px-4 py-2.5 text-sm text-ink">
          <span>{photographer}</span>
          <span className="mono text-[10px] uppercase tracking-widest text-muted-foreground">
            Locked
          </span>
        </div>
      </div>
      <SubjectPicker eventId={eventId} subject={subject} onChange={setSubject} />
      <div>
        <Label>Albums</Label>
        <div className="mt-1">
          <AlbumMultiSelect
            albums={albums}
            value={albumIds}
            onChange={setAlbumIds}
            placeholder="No album"
          />
        </div>
        <p className="mt-1 text-[11px] text-muted-foreground">
          This content can live in more than one album.
        </p>
      </div>
      <button
        onClick={saveSingle}
        disabled={busy}
        className="w-full rounded-full bg-primary px-5 py-2.5 text-sm text-primary-foreground hover:opacity-90 disabled:opacity-50"
      >
        {busy ? "Saving…" : "Save"}
      </button>
    </div>
  );
}

function AccessPanel({
  items,
  onSaved,
  isTeamMode,
}: {
  items: MediaItem[];
  onSaved: () => void;
  isTeamMode?: boolean;
}) {
  const { user } = useAuth();
  const isMulti = items.length > 1;
  const first = items[0];
  const [world, setWorld] = useState(first.visible_world);
  const [media, setMedia] = useState(first.visible_media);
  const [friends, setFriends] = useState(first.visible_friends);
  const [houses, setHouses] = useState<string[]>(first.allowed_media_houses);
  const [supporters, setSupporters] = useState<string[]>(first.visible_world ? ["__all__"] : []);
  const [teams, setTeams] = useState<string[]>(first.visible_friends ? ["__all__"] : []);
  const [userTeams, setUserTeams] = useState<{ id: string; name: string }[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!user || isTeamMode) return;
    void (async () => {
      const { data } = await supabase
        .from("team_members")
        .select("team_id, teams!team_members_team_id_fkey(id, name)")
        .eq("user_id", user.id)
        .eq("accepted", true);
      const list = ((data as any[]) ?? [])
        .map((r) => r.teams)
        .filter(Boolean)
        .map((t: any) => ({ id: t.id, name: t.name }));
      setUserTeams(list);
    })();
  }, [user, isTeamMode]);

  const save = async () => {
    setBusy(true);
    const ids = items.map((i) => i.id);
    const { error } = await supabase
      .from("media_items")
      .update({
        visible_world: world || supporters.length > 0,
        visible_media: media,
        visible_friends: isTeamMode ? friends : friends || teams.length > 0,
        allowed_media_houses: houses,
      })
      .in("id", ids);
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success(isMulti ? `Updated access for ${items.length} items` : "Saved");
    onSaved();
  };

  const selectClass =
    "w-full rounded-lg border border-hairline bg-background px-3 py-2 text-sm text-ink outline-none focus:border-primary";

  return (
    <div className="space-y-4">
      {isMulti && (
        <p className="rounded-lg border border-hairline bg-secondary/40 px-3 py-2 text-[11px] text-muted-foreground">
          Update access for all {items.length} selected items.
        </p>
      )}

      <div>
        <label className="mb-1.5 block text-xs font-medium text-ink">Supporters</label>
        <select
          multiple
          value={supporters}
          onChange={(e) => {
            const vals = Array.from(e.target.selectedOptions).map((o) => o.value);
            setSupporters(vals);
            setWorld(vals.includes("__all__") || vals.length > 0);
          }}
          className={selectClass}
          size={3}
        >
          <option value="__all__">All supporters</option>
        </select>
      </div>

      <div>
        <label className="mb-1.5 block text-xs font-medium text-ink">Media</label>
        <select
          multiple
          value={media ? ["__all__", ...houses] : houses}
          onChange={(e) => {
            const vals = Array.from(e.target.selectedOptions).map((o) => o.value);
            const all = vals.includes("__all__");
            setMedia(all);
            setHouses(vals.filter((v) => v !== "__all__"));
          }}
          className={selectClass}
          size={Math.min(6, MEDIA_HOUSES.length + 1)}
        >
          <option value="__all__">All media houses</option>
          {MEDIA_HOUSES.map((h) => (
            <option key={h} value={h}>
              {h}
            </option>
          ))}
        </select>
      </div>

      {!isTeamMode && (
        <div>
          <label className="mb-1.5 block text-xs font-medium text-ink">Teams</label>
          <select
            multiple
            value={teams}
            onChange={(e) => {
              const vals = Array.from(e.target.selectedOptions).map((o) => o.value);
              setTeams(vals);
              setFriends(vals.length > 0);
            }}
            className={selectClass}
            size={Math.min(6, userTeams.length + 1) || 3}
          >
            {userTeams.length === 0 ? (
              <option disabled value="">
                You are not a member of any team
              </option>
            ) : (
              userTeams.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))
            )}
          </select>
        </div>
      )}

      <button
        onClick={save}
        disabled={busy}
        className="mt-2 w-full rounded-full bg-primary px-5 py-2.5 text-sm text-primary-foreground hover:opacity-90 disabled:opacity-50"
      >
        {busy ? "Saving…" : "Save"}
      </button>
    </div>
  );
}

function AccessGroup({
  title,
  checked,
  onChange,
  searchPlaceholder,
  items,
  selected,
  onToggleItem,
  emptyHint,
}: {
  title: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  searchPlaceholder: string;
  items: string[];
  selected?: string[];
  onToggleItem?: (name: string) => void;
  emptyHint?: string;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return items;
    return items.filter((i) => i.toLowerCase().includes(needle));
  }, [items, q]);

  return (
    <div className="rounded-xl border border-hairline bg-card">
      <div className="flex items-center justify-between gap-2 px-3 py-2.5">
        <button
          onClick={() => setOpen((o) => !o)}
          className="flex flex-1 items-center gap-2 text-left text-sm text-ink"
        >
          {open ? (
            <ChevronDown className="h-3.5 w-3.5" />
          ) : (
            <ChevronRight className="h-3.5 w-3.5" />
          )}
          {title}
        </button>
        <label
          className="flex items-center gap-2 text-[11px] text-muted-foreground"
          onClick={(e) => e.stopPropagation()}
        >
          <span>Select all</span>
          <input
            type="checkbox"
            checked={checked}
            onChange={(e) => onChange(e.target.checked)}
            className="h-4 w-4 accent-primary"
          />
        </label>
      </div>
      {open && (
        <div className="border-t border-hairline p-3">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={searchPlaceholder}
              className="w-full rounded-lg border border-hairline bg-background pl-9 pr-3 py-2 text-xs text-ink outline-none focus:border-primary"
            />
          </div>
          <div className="mt-2 max-h-40 overflow-y-auto">
            {filtered.length === 0 ? (
              <p className="px-1 py-2 text-[11px] text-muted-foreground">
                {emptyHint ?? "No matches."}
              </p>
            ) : (
              <ul className="space-y-0.5">
                {filtered.map((name) => {
                  const on = selected?.includes(name) ?? false;
                  return (
                    <li key={name}>
                      <button
                        onClick={() => onToggleItem?.(name)}
                        className={`flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left text-xs transition ${
                          on
                            ? "bg-primary/10 text-ink"
                            : "text-muted-foreground hover:bg-secondary hover:text-ink"
                        }`}
                      >
                        <span>{name}</span>
                        {on ? (
                          <CheckSquare className="h-3.5 w-3.5 text-primary" />
                        ) : (
                          <Square className="h-3.5 w-3.5" />
                        )}
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// 8 platform pen colors (shared with GroupColorPicker palette)
const DRAW_COLORS = [
  "#E63337", "#F09B0A", "#FFCD33", "#26B270",
  "#17A4E0", "#1960C4", "#A22CC8", "#D22551",
];

export type DrawPoint = { x: number; y: number };
export type DrawEvent =
  | { type: "point"; x: number; y: number; color: string }
  | { type: "end" };

export interface DrawingState {
  enabled: boolean;
  setEnabled: (v: boolean) => void;
  color: string;
  setColor: (c: string) => void;
  events: DrawEvent[];
  addPoint: (p: DrawPoint) => void;
  endStroke: () => void;
  undo: () => void;
  redo: () => void;
  clear: () => void;
  canUndo: boolean;
  canRedo: boolean;
}

function useDrawingState(): DrawingState {
  const [enabled, setEnabled] = useState(false);
  const [color, setColor] = useState(DRAW_COLORS[0]);
  const [events, setEvents] = useState<DrawEvent[]>([]);
  const [redoStack, setRedoStack] = useState<DrawEvent[]>([]);

  const push = (e: DrawEvent) => {
    setEvents((arr) => [...arr, e]);
    setRedoStack([]);
  };
  const addPoint = (p: DrawPoint) => push({ type: "point", x: p.x, y: p.y, color });
  const endStroke = () => {
    setEvents((arr) => (arr.length === 0 || arr[arr.length - 1].type === "end" ? arr : [...arr, { type: "end" }]));
    setRedoStack([]);
  };
  const undo = () => {
    setEvents((arr) => {
      if (arr.length === 0) return arr;
      const last = arr[arr.length - 1];
      setRedoStack((r) => [...r, last]);
      return arr.slice(0, -1);
    });
  };
  const redo = () => {
    setRedoStack((r) => {
      if (r.length === 0) return r;
      const last = r[r.length - 1];
      setEvents((arr) => [...arr, last]);
      return r.slice(0, -1);
    });
  };
  const clear = () => {
    setEvents([]);
    setRedoStack([]);
  };

  return {
    enabled, setEnabled, color, setColor,
    events, addPoint, endStroke,
    undo, redo, clear,
    canUndo: events.length > 0,
    canRedo: redoStack.length > 0,
  };
}

function PenColorDropdown({ color, onChange }: { color: string; onChange: (c: string) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);
  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex h-8 items-center gap-1.5 rounded-md border border-hairline bg-background px-2 hover:border-primary"
        aria-label="Pen color"
      >
        <span className="block h-[3px] w-6 rounded-full" style={{ background: color }} />
        <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
      </button>
      {open && (
        <div className="absolute right-0 top-9 z-30 rounded-md border border-hairline bg-card p-1.5 shadow-lg">
          <div className="flex flex-col gap-1">
            {DRAW_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => { onChange(c); setOpen(false); }}
                className="h-6 w-10 rounded-sm border border-black/10 transition hover:scale-105"
                style={{ background: c }}
                aria-label={c}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function DrawPanel({ state }: { state: DrawingState }) {
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        {/* Round tick toggle */}
        <button
          type="button"
          onClick={() => state.setEnabled(!state.enabled)}
          aria-pressed={state.enabled}
          aria-label={state.enabled ? "Disable drawing" : "Enable drawing"}
          className="h-4 w-4 shrink-0 rounded-full border transition-opacity"
          style={{
            background: state.enabled ? state.color : "transparent",
            borderColor: state.color,
            opacity: state.enabled ? 1 : 0.6,
          }}
        />

        {/* Pen color dropdown */}
        <PenColorDropdown color={state.color} onChange={state.setColor} />

        {/* Undo / redo (no padding) */}
        <button
          type="button"
          onClick={state.undo}
          disabled={!state.canUndo}
          aria-label="Undo"
          className="text-muted-foreground transition hover:text-ink disabled:opacity-30"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 7v6h6"/><path d="M21 17a9 9 0 0 0-15-6.7L3 13"/></svg>
        </button>
        <button
          type="button"
          onClick={state.redo}
          disabled={!state.canRedo}
          aria-label="Redo"
          className="text-muted-foreground transition hover:text-ink disabled:opacity-30"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 7v6h-6"/><path d="M3 17a9 9 0 0 1 15-6.7L21 13"/></svg>
        </button>

        {/* Clear all */}
        <button
          type="button"
          onClick={state.clear}
          className="ml-auto rounded-md border border-hairline bg-background px-2.5 py-1 text-xs text-ink transition hover:border-primary"
        >
          Clear all
        </button>
      </div>
      <p className="text-[11px] text-muted-foreground">
        Click around the video to draw lines. Double-click to end a line.
      </p>
    </div>
  );
}

function SharePanel({
  url,
  disabled,
  items,
  urls,
}: {
  url?: string;
  disabled?: boolean;
  items?: MediaItem[];
  urls?: Record<string, string>;
}) {
  const targets = [
    { name: "Instagram", href: "https://www.instagram.com/", Icon: Instagram },
    { name: "Facebook", href: "https://www.facebook.com/", Icon: Facebook },
    { name: "Snapchat", href: "https://www.snapchat.com/", Icon: Ghost },
    { name: "Strava", href: "https://www.strava.com/upload/select", Icon: Activity },
  ];

  const nativeShare = async () => {
    if (!url) return;
    if (navigator.share) {
      try {
        await navigator.share({ url });
      } catch {
        /* cancelled */
      }
    } else {
      await navigator.clipboard.writeText(url);
      toast.success("Link copied");
    }
  };

  const downloadAll = async () => {
    const list = items && items.length > 0 ? items : [];
    const single = !list.length && url ? [{ id: "single", url, ext: "" }] : null;
    const targets = single
      ? single
      : list.map((it) => {
          const u = urls?.[it.id];
          const ext = it.media_type === "video" ? "mp4" : "jpg";
          const base = (it.storage_path?.split("/").pop() || it.id).split("?")[0];
          const name = base.includes(".") ? base : `${base}.${ext}`;
          return { id: it.id, url: u, ext: name };
        });
    for (const t of targets) {
      if (!t.url) continue;
      try {
        const res = await fetch(t.url);
        const blob = await res.blob();
        const objUrl = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = objUrl;
        a.download = typeof t.ext === "string" && t.ext ? t.ext : `media-${t.id}`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(objUrl);
      } catch (e) {
        toast.error("Download failed");
      }
    }
  };

  return (
    <div className="space-y-2">
      <button
        onClick={downloadAll}
        className="flex w-full items-center gap-3 rounded-xl border border-hairline bg-card px-4 py-3 text-sm text-ink hover:bg-secondary"
      >
        <Download className="h-4 w-4" />
        Download
      </button>
      {disabled ? (
        <p className="rounded-lg border border-hairline bg-secondary/40 px-3 py-3 text-[11px] text-muted-foreground">
          Sharing to social platforms is available for one item at a time. Select a single item to share.
        </p>
      ) : (
        <>
          <button
            onClick={nativeShare}
            className="flex w-full items-center gap-3 rounded-xl border border-hairline bg-card px-4 py-3 text-sm text-ink hover:bg-secondary"
          >
            <Share2 className="h-4 w-4" />
            Share via device
          </button>
          <button
            onClick={async () => {
              if (!url) return;
              await navigator.clipboard.writeText(url);
              toast.success("Link copied");
            }}
            className="flex w-full items-center gap-3 rounded-xl border border-hairline bg-card px-4 py-3 text-sm text-ink hover:bg-secondary"
          >
            <Link2 className="h-4 w-4" />
            Copy link
          </button>
          {targets.map(({ name, href, Icon }) => (
            <a
              key={name}
              href={href}
              target="_blank"
              rel="noreferrer"
              className="flex w-full items-center gap-3 rounded-xl border border-hairline bg-card px-4 py-3 text-sm text-ink hover:bg-secondary"
            >
              <Icon className="h-4 w-4" />
              {name}
            </a>
          ))}
        </>
      )}
    </div>
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
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 animate-in fade-in"
      onClick={onClose}
    >
      <div className="absolute inset-0 bg-black/60" />
      <div
        className="relative z-10 w-full max-w-md rounded-2xl border border-hairline bg-card p-6 shadow-2xl animate-in zoom-in-95 slide-in-from-bottom-2 duration-200 max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-sm font-medium text-ink">{title}</h2>
          <button
            onClick={onClose}
            className="rounded-full p-1.5 text-muted-foreground hover:bg-secondary"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  autoFocus,
  onKeyDown,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  autoFocus?: boolean;
  onKeyDown?: (e: React.KeyboardEvent<HTMLInputElement>) => void;
}) {
  return (
    <label className="block">
      <Label>{label}</Label>
      <input
        autoFocus={autoFocus}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={onKeyDown}
        className="mt-1 w-full rounded-xl border border-hairline bg-background px-4 py-2.5 text-sm text-ink outline-none focus:border-primary"
      />
    </label>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <span className="mono text-[10px] uppercase tracking-widest text-muted-foreground">
      {children}
    </span>
  );
}

export function AlbumMultiSelect({
  albums,
  value,
  onChange,
  placeholder = "Select albums…",
}: {
  albums: Album[];
  value: string[];
  onChange: (next: string[]) => void;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const filtered = useMemo(() => {
    const n = q.trim().toLowerCase();
    if (!n) return albums;
    return albums.filter((a) => a.name.toLowerCase().includes(n));
  }, [albums, q]);

  const toggle = (id: string) => {
    onChange(value.includes(id) ? value.filter((v) => v !== id) : [...value, id]);
  };

  const summary =
    value.length === 0
      ? placeholder
      : value.length === 1
        ? (albums.find((a) => a.id === value[0])?.name ?? "1 album")
        : `${value.length} albums`;

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        className="flex w-full items-center justify-between rounded-xl border border-hairline bg-background px-4 py-2.5 text-left text-sm text-ink outline-none focus:border-primary"
      >
        <span className={value.length === 0 ? "text-muted-foreground" : ""}>{summary}</span>
        <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
      </button>
      {open && (
        <div className="absolute left-0 right-0 top-full z-30 mt-1 rounded-xl border border-hairline bg-popover p-2 shadow-lg">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onMouseDown={(e) => e.stopPropagation()}
              placeholder="Search albums…"
              className="w-full rounded-lg border border-hairline bg-background pl-9 pr-3 py-2 text-xs text-ink outline-none focus:border-primary"
            />
          </div>
          <ul className="mt-2 max-h-56 overflow-y-auto">
            {filtered.length === 0 ? (
              <li className="px-2 py-2 text-[11px] text-muted-foreground">No albums.</li>
            ) : (
              filtered.map((a) => {
                const on = value.includes(a.id);
                return (
                  <li key={a.id}>
                    <button
                      type="button"
                      onMouseDown={(e) => {
                        e.preventDefault();
                        toggle(a.id);
                      }}
                      className={`flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left text-xs transition ${
                        on ? "bg-primary/10 text-ink" : "text-muted-foreground hover:bg-secondary hover:text-ink"
                      }`}
                    >
                      <span>{a.name}</span>
                      {on ? (
                        <CheckSquare className="h-3.5 w-3.5 text-primary" />
                      ) : (
                        <Square className="h-3.5 w-3.5" />
                      )}
                    </button>
                  </li>
                );
              })
            )}
          </ul>
        </div>
      )}
    </div>
  );
}

async function syncMediaAlbums(mediaItemIds: string[], albumIds: string[], mode: "replace" | "add") {
  if (mediaItemIds.length === 0) return;
  if (mode === "replace") {
    await supabase.from("media_item_albums").delete().in("media_item_id", mediaItemIds);
  }
  if (albumIds.length === 0) return;
  const rows = mediaItemIds.flatMap((mid) =>
    albumIds.map((aid) => ({ media_item_id: mid, album_id: aid })),
  );
  await supabase.from("media_item_albums").upsert(rows, {
    onConflict: "media_item_id,album_id",
    ignoreDuplicates: true,
  });
}

function ConfirmDialog({
  title,
  message,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  destructive = false,
  onCancel,
  onConfirm,
}: {
  title: string;
  message: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div className="fixed inset-0 z-[100] grid place-items-center bg-black/40 p-4 backdrop-blur-sm">
      <div className="w-full max-w-sm overflow-hidden rounded-2xl border border-hairline bg-card shadow-2xl">
        <div className="px-6 pt-6">
          <h3 className="text-base font-medium text-ink">{title}</h3>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{message}</p>
        </div>
        <div className="mt-6 flex justify-end gap-2 border-t border-hairline bg-background/40 px-4 py-3">
          <button
            onClick={onCancel}
            className="rounded-full border border-hairline bg-card px-4 py-2 text-xs text-muted-foreground hover:text-ink"
          >
            {cancelLabel}
          </button>
          <button
            onClick={onConfirm}
            className={`rounded-full px-5 py-2 text-xs hover:opacity-90 ${
              destructive
                ? "bg-destructive text-destructive-foreground"
                : "bg-primary text-primary-foreground"
            }`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

function formatVideoTime(s: number) {
  if (!isFinite(s) || s < 0) s = 0;
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  const cs = Math.floor((s - Math.floor(s)) * 100);
  return `${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}.${String(cs).padStart(2, "0")}`;
}

function VideoPlayer({ src, drawing, theme = "dark" }: { src?: string; drawing?: DrawingState; theme?: "light" | "dark" }) {
  const isLight = theme === "light";
  const playBtnClass = isLight ? "text-zinc-800 hover:text-black" : "text-zinc-100 hover:text-white";
  const tickMajorClass = isLight ? "h-7 bg-zinc-400" : "h-7 bg-zinc-500/70";
  const tickMinorClass = isLight ? "h-4 bg-zinc-300" : "h-4 bg-zinc-600/50";
  const needleClass = isLight
    ? "pointer-events-none absolute top-0 bottom-0 w-px bg-black shadow-[0_0_6px_rgba(0,0,0,0.4)]"
    : "pointer-events-none absolute top-0 bottom-0 w-px bg-white shadow-[0_0_8px_rgba(255,255,255,0.8)]";
  const timeClass = isLight ? "text-zinc-600" : "text-zinc-400";
  const videoRef = useRef<HTMLVideoElement>(null);
  const stripRef = useRef<HTMLDivElement>(null);
  const needleRef = useRef<HTMLDivElement>(null);
  const [playing, setPlaying] = useState(false);
  const [current, setCurrent] = useState(0);
  const [duration, setDuration] = useState(0);
  const [ready, setReady] = useState(false);
  const [stripWidth, setStripWidth] = useState(0);
  const wasPlayingRef = useRef(false);
  const scrubbingRef = useRef(false);
  const pendingTimeRef = useRef<number | null>(null);
  const seekingRef = useRef(false);

  const flushSeek = useCallback(() => {
    const v = videoRef.current;
    if (!v || pendingTimeRef.current == null) return;
    const target = pendingTimeRef.current;
    pendingTimeRef.current = null;
    seekingRef.current = true;
    const fs = (v as unknown as { fastSeek?: (t: number) => void }).fastSeek;
    // fastSeek snaps to the nearest keyframe without forward decoding (iOS Photos-style scrub)
    if (scrubbingRef.current && typeof fs === "function") {
      try { fs.call(v, target); } catch { v.currentTime = target; }
    } else {
      try { v.currentTime = target; } catch {}
    }
  }, []);

  useEffect(() => {
    setReady(false);
    setCurrent(0);
    setDuration(0);
    pendingTimeRef.current = null;
    seekingRef.current = false;
    if (needleRef.current) needleRef.current.style.left = "";
  }, [src]);

  useEffect(() => {
    if (!playing || duration <= 0) return;
    const v = videoRef.current;
    const n = needleRef.current;
    if (!v || !n) return;

    let rafId: number | null = null;
    let rvfcId: number | null = null;
    const useRvfc =
      typeof (v as unknown as { requestVideoFrameCallback?: unknown }).requestVideoFrameCallback ===
      "function";

    const tick = () => {
      const d = v.duration;
      if (isFinite(d) && d > 0) {
        const pct = Math.min(100, Math.max(0, (v.currentTime / d) * 100));
        n.style.left = pct + "%";
      }
      schedule();
    };

    const schedule = () => {
      if (useRvfc) {
        rvfcId = (v as unknown as {
          requestVideoFrameCallback: (cb: () => void) => number;
        }).requestVideoFrameCallback(tick);
      } else {
        rafId = requestAnimationFrame(tick);
      }
    };

    schedule();

    return () => {
      if (rafId != null) cancelAnimationFrame(rafId);
      if (
        rvfcId != null &&
        typeof (v as unknown as { cancelVideoFrameCallback?: (id: number) => void })
          .cancelVideoFrameCallback === "function"
      ) {
        (v as unknown as { cancelVideoFrameCallback: (id: number) => void }).cancelVideoFrameCallback(
          rvfcId,
        );
      }
    };
  }, [playing, duration]);

  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    const onTime = () => {
      if (!scrubbingRef.current) setCurrent(v.currentTime);
    };
    const onMeta = () => {
      const d = v.duration;
      if (isFinite(d) && d > 0) {
        setDuration(d);
        setReady(true);
      }
    };
    const onPlay = () => {
      // togglePlay already set this synchronously; this is a backup for
      // play events from non-button sources. Only update if state is stale.
      setPlaying((p) => (p ? p : true));
    };
    const onPause = () => {
      // togglePlay already set this synchronously; this is a backup for
      // pause events from non-button sources. Only update if state is stale.
      setPlaying((p) => (p ? false : p));
      // Don't write to `current` here — togglePlay already wrote the
      // pre-pause position, and reading v.currentTime here would capture
      // a moved-forward position.
    };
    const onSeeked = () => {
      seekingRef.current = false;
      if (pendingTimeRef.current != null) flushSeek();
    };
    v.addEventListener("timeupdate", onTime);
    v.addEventListener("loadedmetadata", onMeta);
    v.addEventListener("durationchange", onMeta);
    v.addEventListener("play", onPlay);
    v.addEventListener("pause", onPause);
    v.addEventListener("seeked", onSeeked);
    if (v.readyState >= 1) onMeta();
    return () => {
      v.removeEventListener("timeupdate", onTime);
      v.removeEventListener("loadedmetadata", onMeta);
      v.removeEventListener("durationchange", onMeta);
      v.removeEventListener("play", onPlay);
      v.removeEventListener("pause", onPause);
      v.removeEventListener("seeked", onSeeked);
    };
  }, [src, flushSeek]);

  // Track strip width responsively
  useEffect(() => {
    const el = stripRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      for (const e of entries) setStripWidth(e.contentRect.width);
    });
    ro.observe(el);
    setStripWidth(el.clientWidth);
    return () => ro.disconnect();
  }, [ready]);

  const togglePlay = () => {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) {
      // Lock playback position to displayed needle, ALWAYS (no threshold —
      // even sub-frame drift causes a visible snap when rAF takes over).
      if (isFinite(current)) {
        try { v.currentTime = current; } catch {}
      }
      // Update React state IMMEDIATELY — don't wait for the browser's `play`
      // event (which lags ~30-80ms behind the click). This makes the button
      // feel instant and prevents the rAF effect from starting against stale state.
      setPlaying(true);
      v.play().catch(() => {});
    } else {
      // Snap React's current to the exact pause-moment v.currentTime
      // BEFORE the video has any chance to advance another frame.
      if (!scrubbingRef.current) {
        setCurrent(v.currentTime);
      }
      setPlaying(false);
      v.pause();
    }
  };

  const seekFromClientX = (clientX: number) => {
    const el = stripRef.current;
    const v = videoRef.current;
    if (!el || !v || !ready || !duration) return;
    const rect = el.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    const t = ratio * duration;
    setCurrent(t);
    pendingTimeRef.current = t;
    if (!seekingRef.current) flushSeek();
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!ready) return;
    const v = videoRef.current;
    if (!v) return;
    scrubbingRef.current = true;
    wasPlayingRef.current = !v.paused;
    if (!v.paused) v.pause();
    (e.currentTarget as HTMLDivElement).setPointerCapture(e.pointerId);
    if (needleRef.current) needleRef.current.style.left = "";
    seekFromClientX(e.clientX);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!scrubbingRef.current) return;
    seekFromClientX(e.clientX);
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!scrubbingRef.current) return;
    scrubbingRef.current = false;
    try {
      (e.currentTarget as HTMLDivElement).releasePointerCapture(e.pointerId);
    } catch {}
    const v = videoRef.current;
    const hasFastSeek = !!v && typeof (v as unknown as { fastSeek?: unknown }).fastSeek === "function";
    if (v && (pendingTimeRef.current != null || hasFastSeek)) {
      try { v.currentTime = current; } catch {}
    }
    pendingTimeRef.current = null;
    seekingRef.current = false;
    if (v && wasPlayingRef.current) v.play().catch(() => {});
  };

  // Tick generation: ~6px per tick, capped for perf
  const tickCount = Math.max(40, Math.min(240, Math.floor(stripWidth / 6) || 80));
  const progress = ready && duration > 0 ? Math.min(1, current / duration) : 0;

  return (
    <div className="flex h-full w-full flex-col gap-3">
      <div
        className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden bg-black"
        onClick={drawing?.enabled ? undefined : togglePlay}
      >
        <video
          ref={videoRef}
          src={src}
          className="max-h-full max-w-full"
          playsInline
          preload="metadata"
        />
        {drawing && <DrawingOverlay state={drawing} />}
      </div>
      <div className="w-full shrink-0">
        {/* Centered minimalist play/pause */}
        <div className="mb-2 flex items-center justify-center">
          <button
            onClick={togglePlay}
            className={`flex h-8 w-8 items-center justify-center rounded-full transition ${playBtnClass}`}
            aria-label={playing ? "Pause" : "Play"}
          >
            {playing ? (
              <Pause className="h-5 w-5" />
            ) : (
              <Play className="h-5 w-5 translate-x-[1px]" />
            )}
          </button>
        </div>

        {/* Film-strip scrubber */}
        <div
          ref={stripRef}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
          className="relative h-12 w-full touch-none select-none"
          role="slider"
          aria-valuemin={0}
          aria-valuemax={duration || 0}
          aria-valuenow={current}
        >
          {/* Ticks */}
          <div className="pointer-events-none absolute inset-0 flex items-center justify-between">
            {Array.from({ length: tickCount }).map((_, i) => {
              const isMajor = i % 5 === 0;
              return (
                <span
                  key={i}
                  className={`block w-px ${isMajor ? tickMajorClass : tickMinorClass}`}
                />
              );
            })}
          </div>

          {/* Current position needle */}
          {ready && (
            <div
              ref={needleRef}
              className={needleClass}
              style={{ left: `${progress * 100}%` }}
            />
          )}
        </div>

        <div className={`mt-2 flex justify-center font-mono text-[11px] tabular-nums ${timeClass}`}>
          {formatVideoTime(current)} / {formatVideoTime(ready ? duration : 0)}
        </div>
      </div>
    </div>
  );
}

// Mac-Dock style fish-eye magnification strip for the Lightbox bottom flow.
function DockStrip({
  items,
  urls,
  activeIdx,
  onSelect,
}: {
  items: MediaItem[];
  urls: Record<string, string>;
  activeIdx: number;
  onSelect: (i: number) => void;
}) {
  const mouseX = useMotionValue<number>(Number.POSITIVE_INFINITY);
  return (
    <motion.div
      onMouseMove={(e) => mouseX.set(e.clientX)}
      onMouseLeave={() => mouseX.set(Number.POSITIVE_INFINITY)}
      className="mt-4 flex h-24 items-end justify-center gap-2 px-6 pb-2"
    >
      {items.map((it, i) => (
        <DockItem
          key={it.id}
          mouseX={mouseX}
          active={i === activeIdx}
          onClick={() => onSelect(i)}
        >
          {it.media_type === "photo" && urls[it.id] ? (
            <img src={urls[it.id]} alt="" className="h-full w-full object-cover" />
          ) : it.media_type === "video" && urls[it.id] ? (
            <video src={urls[it.id]} muted className="h-full w-full object-cover" />
          ) : (
            <div className="h-full w-full bg-secondary" />
          )}
        </DockItem>
      ))}
    </motion.div>
  );
}

function DockItem({
  mouseX,
  active,
  onClick,
  children,
}: {
  mouseX: MotionValue<number>;
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLButtonElement>(null);
  const baseSize = 56;
  const maxSize = 104;

  const distance = useTransform(mouseX, (val) => {
    const rect = ref.current?.getBoundingClientRect() ?? { x: 0, width: baseSize };
    return val - rect.x - rect.width / 2;
  });

  const sizeRaw = useTransform(distance, [-140, 0, 140], [baseSize, maxSize, baseSize]);
  const size = useSpring(sizeRaw, { mass: 0.1, stiffness: 220, damping: 16 });

  return (
    <motion.button
      ref={ref}
      onClick={onClick}
      style={{ width: size, height: size }}
      className={`relative shrink-0 overflow-hidden rounded-lg bg-secondary transition-[box-shadow,outline] ${
        active ? "outline outline-2 outline-primary" : "opacity-80 hover:opacity-100"
      }`}
    >
      {children}
    </motion.button>
  );
}

function DrawingOverlay({ state }: { state: DrawingState }) {
  const ref = useRef<SVGSVGElement>(null);
  const [hover, setHover] = useState<{ x: number; y: number } | null>(null);

  const getPoint = (e: React.MouseEvent) => {
    const el = ref.current;
    if (!el) return { x: 0, y: 0 };
    const r = el.getBoundingClientRect();
    return {
      x: ((e.clientX - r.left) / r.width) * 100,
      y: ((e.clientY - r.top) / r.height) * 100,
    };
  };

  type Stroke = { color: string; points: DrawPoint[] };
  const strokes: Stroke[] = [];
  let cur: Stroke | null = null;
  for (const ev of state.events) {
    if (ev.type === "end") {
      if (cur && cur.points.length >= 2) strokes.push(cur);
      cur = null;
    } else {
      if (!cur || cur.color !== ev.color) {
        if (cur && cur.points.length >= 2) strokes.push(cur);
        cur = { color: ev.color, points: [{ x: ev.x, y: ev.y }] };
      } else {
        cur.points.push({ x: ev.x, y: ev.y });
      }
    }
  }
  const openStroke = cur;
  if (openStroke && openStroke.points.length >= 1) strokes.push(openStroke);

  const toPath = (pts: DrawPoint[]) =>
    pts.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" ");

  const handleClick = (e: React.MouseEvent) => {
    if (!state.enabled) return;
    e.stopPropagation();
    state.addPoint(getPoint(e));
  };
  const handleDouble = (e: React.MouseEvent) => {
    if (!state.enabled) return;
    e.stopPropagation();
    state.endStroke();
  };

  const STROKE_W = 0.6;

  return (
    <svg
      ref={ref}
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
      className="absolute inset-0 h-full w-full"
      style={{ pointerEvents: state.enabled ? "auto" : "none", cursor: state.enabled ? "crosshair" : "default" }}
      onClick={handleClick}
      onDoubleClick={handleDouble}
      onMouseMove={(e) => state.enabled && openStroke && setHover(getPoint(e))}
      onMouseLeave={() => setHover(null)}
    >
      {strokes.map((s, i) => (
        <path
          key={i}
          d={toPath(s.points)}
          stroke={s.color}
          fill="none"
          strokeLinecap="round"
          strokeLinejoin="round"
          style={{ strokeWidth: STROKE_W } as React.CSSProperties}
        />
      ))}
      {openStroke && hover && openStroke.points.length > 0 && (
        <line
          x1={openStroke.points[openStroke.points.length - 1].x}
          y1={openStroke.points[openStroke.points.length - 1].y}
          x2={hover.x}
          y2={hover.y}
          stroke={openStroke.color}
          strokeLinecap="round"
          style={{ strokeWidth: STROKE_W, opacity: 0.7 } as React.CSSProperties}
        />
      )}
    </svg>
  );
}


function UnsavedChangesDialog({
  title,
  isNew,
  onSave,
  onDiscard,
  onCancel,
}: {
  title: string;
  isNew: boolean;
  onSave: () => void | Promise<void>;
  onDiscard: () => void | Promise<void>;
  onCancel: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const run = (fn: () => void | Promise<void>) => async () => {
    setBusy(true);
    try { await fn(); } finally { setBusy(false); }
  };
  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center p-4 animate-in fade-in"
      onClick={onCancel}
    >
      <div className="absolute inset-0 bg-black/60" />
      <div
        className="relative z-10 w-full max-w-md rounded-2xl border border-hairline bg-card p-6 shadow-2xl animate-in zoom-in-95 slide-in-from-bottom-2 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-lg text-ink">Unsaved changes</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Do you want to save “{title}”?
        </p>
        <div className="mt-6 flex flex-wrap justify-end gap-2">
          <button
            onClick={onCancel}
            disabled={busy}
            className="rounded-full border border-hairline bg-card px-4 py-2 text-xs text-muted-foreground hover:text-ink disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={run(onDiscard)}
            disabled={busy}
            className="rounded-full border border-hairline bg-card px-4 py-2 text-xs text-destructive hover:bg-destructive/10 disabled:opacity-50"
          >
            {isNew ? "Delete" : "Reject changes"}
          </button>
          <button
            onClick={run(onSave)}
            disabled={busy}
            className="rounded-full bg-primary px-5 py-2 text-xs text-primary-foreground hover:opacity-90 disabled:opacity-50"
          >
            {busy ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}

function MediaTabView({
  mediaIds,
  onTitleChange,
}: {
  mediaIds: string[];
  onTitleChange: (title: string) => void;
}) {
  const { user, mode, activeEntityId, loading: authLoading } = useAuth();
  const isTeamMode = mode === "team" || mode === "organizer" || !!activeEntityId;
  const [items, setItems] = useState<MediaItem[]>([]);
  const [albums, setAlbums] = useState<Album[]>([]);
  const [attended, setAttended] = useState<AttendedEvent[]>([]);
  const [itemAlbums, setItemAlbums] = useState<Record<string, string[]>>({});
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [thumbUrls, setThumbUrls] = useState<Record<string, string>>({});
  const [userName, setUserName] = useState<string>("");
  const [tab, setTab] = useState<"about" | "access" | "draw" | "export">("about");
  const [idx, setIdx] = useState(0);
  const [reloadKey, setReloadKey] = useState(0);
  const drawing = useDrawingState();
  const currentIdForReset = items[idx]?.id;
  useEffect(() => { drawing.clear(); drawing.setEnabled(false); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [currentIdForReset]);
  useEffect(() => {
    const isVid = items[idx]?.media_type === "video";
    if (!isVid && tab === "draw") setTab("about");
  }, [items, idx, tab]);

  const load = useCallback(async () => {
    if (!user || mediaIds.length === 0) return;
    const { data: mi } = await supabase
      .from("media_items")
      .select("*")
      .in("id", mediaIds);
    const list = ((mi as MediaItem[]) ?? []).sort(
      (a, b) => mediaIds.indexOf(a.id) - mediaIds.indexOf(b.id),
    );
    setItems(list);

    // Albums (scope to current mode)
    if (isTeamMode) {
      const { data: team } = await supabase
        .from("teams")
        .select("id,name")
        .eq("owner_id", user.id)
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();
      if (team) {
        const { data: a } = await supabase
          .from("media_albums")
          .select("id,name,pinned,sort_order")
          .eq("team_id", team.id)
          .order("pinned", { ascending: false })
          .order("sort_order", { ascending: true });
        setAlbums((a ?? []) as Album[]);
        const { data: ev } = await supabase
          .from("events")
          .select("id,title,organizer,starts_at")
          .eq("organizer", team.name);
        setAttended((ev as AttendedEvent[]) ?? []);
      }
    } else {
      const { data: a } = await supabase
        .from("media_albums")
        .select("id,name,pinned,sort_order")
        .is("team_id", null)
        .eq("user_id", user.id)
        .order("pinned", { ascending: false })
        .order("sort_order", { ascending: true });
      setAlbums((a ?? []) as Album[]);
      // Attended events for user
      const { data: regs } = await supabase
        .from("registrations")
        .select("event_id, events(id,title,organizer,starts_at)")
        .eq("user_id", user.id);
      const ev: AttendedEvent[] = [];
      const seen = new Set<string>();
      type Reg = { events: AttendedEvent | null };
      for (const row of (regs as unknown as Reg[]) ?? []) {
        const e = row.events;
        if (e && !seen.has(e.id)) {
          seen.add(e.id);
          ev.push(e);
        }
      }
      setAttended(ev);
    }

    // Album links
    const { data: links } = await supabase
      .from("media_item_albums")
      .select("media_item_id,album_id")
      .in("media_item_id", mediaIds);
    const map: Record<string, string[]> = {};
    for (const row of (links as { media_item_id: string; album_id: string }[] | null) ?? []) {
      (map[row.media_item_id] ??= []).push(row.album_id);
    }
    setItemAlbums(map);

    // Profile name
    const { data: p } = await supabase
      .from("profiles")
      .select("first_name,last_name,email")
      .eq("id", user.id)
      .maybeSingle();
    const nm =
      [p?.first_name, p?.last_name].filter(Boolean).join(" ").trim() ||
      p?.email ||
      user.email ||
      "";
    setUserName(nm);

    // Signed URLs (lightbox-quality + thumbnail for LQIP)
    const urlMap: Record<string, string> = {};
    const thumbMap: Record<string, string> = {};
    await Promise.all(
      list.map(async (it) => {
        const isPhoto = it.media_type === "photo";
        const [full, thumb] = await Promise.all([
          signedLightboxUrl(it.storage_path, isPhoto),
          signedThumbUrl(it.storage_path, isPhoto),
        ]);
        if (full) urlMap[it.id] = full;
        if (thumb) thumbMap[it.id] = thumb;
      }),
    );
    setUrls(urlMap);
    setThumbUrls(thumbMap);
  }, [user, mediaIds, isTeamMode]);

  useEffect(() => {
    void load();
  }, [load, reloadKey]);

  // Update tab title when items / attended changes
  useEffect(() => {
    if (items.length === 0) return;
    const first = items[0];
    const evTitle = attended.find((e) => e.id === first.event_id)?.title;
    const title = items.length === 1
      ? (evTitle || "Media")
      : (evTitle ? `${evTitle} (${items.length})` : `Media (${items.length})`);
    onTitleChange(title);
  }, [items, attended, onTitleChange]);

  if (authLoading || !user) return null;
  if (items.length === 0) {
    return <div className="py-20 text-center text-sm text-muted-foreground">Loading…</div>;
  }

  const isMulti = items.length > 1;
  const current = items[idx];
  const url = current ? urls[current.id] : undefined;
  const isVideo = current?.media_type === "video";
  const tabs: ReadonlyArray<"about" | "access" | "draw" | "export"> = isVideo
    ? ["about", "access", "draw", "export"]
    : ["about", "access", "export"];

  return <MediaTabViewBody
    items={items}
    albums={albums}
    attended={attended}
    userName={userName}
    itemAlbums={itemAlbums}
    urls={urls}
    thumbUrls={thumbUrls}
    idx={idx}
    setIdx={setIdx}
    drawing={drawing}
    tab={tab}
    setTab={setTab}
    tabs={tabs}
    isVideo={isVideo}
    isMulti={isMulti}
    isTeamMode={isTeamMode}
    current={current}
    url={url}
    onSaved={() => setReloadKey((k) => k + 1)}
  />;
}

function MediaTabViewBody(props: {
  items: MediaItem[];
  albums: Album[];
  attended: AttendedEvent[];
  userName: string;
  itemAlbums: Record<string, string[]>;
  urls: Record<string, string>;
  thumbUrls: Record<string, string>;
  idx: number;
  setIdx: (i: number) => void;
  drawing: DrawingState;
  tab: "about" | "access" | "draw" | "export";
  setTab: (t: "about" | "access" | "draw" | "export") => void;
  tabs: ReadonlyArray<"about" | "access" | "draw" | "export">;
  isVideo: boolean;
  isMulti: boolean;
  isTeamMode: boolean;
  current: MediaItem;
  url: string | undefined;
  onSaved: () => void;
}) {
  const { items, albums, attended, userName, itemAlbums, urls, thumbUrls, idx, setIdx, drawing, tab, setTab, tabs, isVideo, isMulti, isTeamMode, current, url, onSaved } = props;
  const [editPanelOpen, setEditPanelOpen] = useState(false);
  const [albumBg] = useLibrarySetting<"light" | "dark">("media:album-bg", "light");
  const isDarkAlbum = albumBg === "dark";
  const albumBgClass = isDarkAlbum ? "bg-zinc-950 text-zinc-100" : "bg-white text-foreground";
  const albumBarClass = isDarkAlbum
    ? "bg-zinc-950 text-zinc-100"
    : "bg-white text-foreground";

  return (
    <div className={`flex h-[calc(100vh-12rem)] min-h-[480px] flex-col overflow-hidden ${albumBgClass}`}>
      <div className={`flex h-11 flex-none items-center justify-end gap-2 px-4 ${albumBarClass}`}>
        <button
          type="button"
          onClick={() => setEditPanelOpen((v) => !v)}
          aria-label="Edit"
          className={`grid h-9 w-9 place-items-center rounded-full transition ${
            editPanelOpen ? "bg-foreground/15" : "hover:bg-foreground/10"
          }`}
        >
          <Pencil className="h-4 w-4" />
        </button>
      </div>
      <div className="flex min-h-0 flex-1">
        <div className="flex min-h-0 min-w-0 flex-1 items-center justify-center p-4 transition-[flex-basis] duration-300 ease-out">
          {current?.media_type === "photo" ? (
            <PhotoLqip
              thumbSrc={current ? thumbUrls[current.id] : undefined}
              fullSrc={url}
            />
          ) : (
            <VideoPlayer src={url} drawing={drawing} theme={albumBg} />
          )}
        </div>
        <aside
          className={`flex min-h-0 flex-none flex-col overflow-hidden border-l border-hairline bg-background transition-[width] duration-300 ease-out ${
            editPanelOpen ? "w-96" : "w-0"
          }`}
        >
          <div className="flex w-96 flex-1 flex-col">
            <div className="flex items-center justify-between border-b border-hairline px-5 py-3">
              <div className="flex gap-1">
                {tabs.map((t) => (
                  <button
                    key={t}
                    onClick={() => setTab(t)}
                    className={`rounded-full px-3 py-1.5 text-xs capitalize transition ${
                      tab === t ? "bg-secondary text-ink" : "text-muted-foreground hover:text-ink"
                    }`}
                  >
                    {t}
                  </button>
                ))}
              </div>
              <button
                onClick={() => setEditPanelOpen(false)}
                className="rounded-full p-1.5 text-muted-foreground hover:bg-secondary"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-5">
              {tab === "about" && (
                <AboutPanel
                  items={items}
                  albums={albums}
                  attended={attended}
                  userName={userName}
                  itemAlbums={itemAlbums}
                  onSaved={onSaved}
                />
              )}
              {tab === "access" && (
                <AccessPanel items={items} onSaved={onSaved} isTeamMode={isTeamMode} />
              )}
              {tab === "draw" && isVideo && <DrawPanel state={drawing} />}
              {tab === "export" && <SharePanel url={url} disabled={isMulti} items={items} urls={urls} />}
            </div>
          </div>
        </aside>
      </div>
      {isMulti && (
        <div className="flex-none">
          <DockStrip items={items} urls={urls} activeIdx={idx} onSelect={setIdx} />
        </div>
      )}
    </div>
  );
}

function PhotoLqip({ thumbSrc, fullSrc }: { thumbSrc?: string; fullSrc?: string }) {
  const [fullLoaded, setFullLoaded] = useState(false);

  useEffect(() => {
    setFullLoaded(false);
  }, [fullSrc]);

  if (!thumbSrc && !fullSrc) return null;

  return (
    <div className="relative flex h-full w-full items-center justify-center">
      {thumbSrc && (
        <img
          src={thumbSrc}
          alt=""
          aria-hidden
          className={`max-h-full max-w-full object-contain transition-opacity duration-300 ${
            fullLoaded ? "opacity-0" : "opacity-100"
          }`}
          style={{ filter: "blur(20px)", transform: "scale(1.04)" }}
        />
      )}
      {fullSrc && (
        <img
          src={fullSrc}
          alt=""
          onLoad={() => setFullLoaded(true)}
          decoding="async"
          className={`absolute inset-0 m-auto max-h-full max-w-full object-contain transition-opacity duration-300 ${
            fullLoaded ? "opacity-100" : "opacity-0"
          }`}
        />
      )}
    </div>
  );
}

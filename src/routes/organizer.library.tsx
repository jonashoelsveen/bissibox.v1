import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { TopBarSlot } from "@/components/TopBarSlot";
import { useAuth } from "@/lib/auth";
import { formatDate } from "@/lib/format";
import {
  CalendarRange,
  Search as SearchIcon,
  Globe,
  MoreVertical,
  Copy,
  Trash2,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { OrganizerEventEditor } from "@/components/OrganizerEventEditor";
import { EventsSideNav, type EventsSideNavValue } from "@/components/organizer/EventsSideNav";
import { EventsPlusMenu, FolderCreatorDialog } from "@/components/organizer/EventsPlusMenu";
import { CopyEventDialog } from "@/components/organizer/CopyEventDialog";

interface OrgEvent {
  id: string;
  title: string;
  organizer: string;
  starts_at: string;
  updated_at: string;
  location: string | null;
  signup_fee: number;
  currency: string;
  race_types: string[];
  featured: boolean;
  published: boolean;
  folder: string | null;
}

interface OpenEventTab {
  id: string;
  title: string;
}

export const Route = createFileRoute("/organizer/library")({
  component: EventsPage,
  validateSearch: (s: Record<string, unknown>): { folder?: string; open?: string } => ({
    folder: typeof s.folder === "string" ? (s.folder as string) : undefined,
    open: typeof s.open === "string" ? (s.open as string) : undefined,
  }),
  head: () => ({ meta: [{ title: "Your events · Raceline Organizer" }] }),
});

function EventsPage() {
  const { user, loading, activeEntityId, mode } = useAuth();
  const isTeamMode = mode === "team" || mode === "organizer" || !!activeEntityId;
  const nav = useNavigate();

  const [events, setEvents] = useState<OrgEvent[]>([]);
  const [busy, setBusy] = useState(false);
  const [folder, setFolder] = useState<string>(""); // "" = all, "__unsorted__" = no folder, else folder name
  const [openTabs, setOpenTabs] = useState<OpenEventTab[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [q, setQ] = useState("");
  const [folderDialogOpen, setFolderDialogOpen] = useState(false);
  const [folderBusy, setFolderBusy] = useState(false);
  const [copySource, setCopySource] = useState<OrgEvent | null>(null);
  const [rowMenuFor, setRowMenuFor] = useState<string | null>(null);
  const searchRef = useRef<HTMLInputElement | null>(null);

  // Chrome-like tab DnD (pointer-based, X-axis only) — mirrors /media
  const tabStripRef = useRef<HTMLDivElement | null>(null);
  const tabRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const [dragTabId, setDragTabId] = useState<string | null>(null);
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
    if (!loading && !user) nav({ to: "/auth" });
  }, [loading, user, nav]);

  const load = useCallback(async () => {
    if (!user) return;
    if (activeEntityId) {
      const { data } = await supabase
        .from("events").select("*")
        .eq("team_id", activeEntityId)
        .order("starts_at", { ascending: false });
      setEvents((data as OrgEvent[]) ?? []);
      return;
    }
    const ownedReq = supabase.from("events").select("*").eq("owner_id", user.id).is("team_id", null);
    const coReq = supabase.from("event_co_organizers").select("event_id").eq("user_id", user.id);
    const [{ data: owned }, { data: co }] = await Promise.all([ownedReq, coReq]);
    let coEvents: OrgEvent[] = [];
    const coIds = (co ?? []).map((r) => r.event_id);
    if (coIds.length) {
      const { data } = await supabase.from("events").select("*").in("id", coIds);
      coEvents = (data as OrgEvent[]) ?? [];
    }
    const merged = new Map<string, OrgEvent>();
    [...((owned as OrgEvent[]) ?? []), ...coEvents].forEach((e) => merged.set(e.id, e));
    const list = Array.from(merged.values()).sort(
      (a, b) => new Date(b.starts_at).getTime() - new Date(a.starts_at).getTime(),
    );
    setEvents(list);
  }, [user, activeEntityId]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    const onR = () => void load();
    window.addEventListener("events:refresh", onR);
    return () => window.removeEventListener("events:refresh", onR);
  }, [load]);

  // Keep tab titles in sync with event titles when they change.
  useEffect(() => {
    setOpenTabs((tabs) =>
      tabs.map((t) => {
        const ev = events.find((e) => e.id === t.id);
        return ev ? { ...t, title: ev.title } : t;
      }),
    );
  }, [events]);

  useEffect(() => {
    if (searchOpen) setTimeout(() => searchRef.current?.focus(), 30);
  }, [searchOpen]);

  useEffect(() => { updateEdgeFade(); }, [openTabs, updateEdgeFade]);

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

  const onTabPointerDown = (e: React.PointerEvent<HTMLDivElement>, id: string) => {
    if (e.button !== 0) return;
    const target = e.target as HTMLElement;
    if (target.closest("[data-tab-close]")) return;
    setActiveId(id);
    const strip = tabStripRef.current;
    if (!strip) return;
    const tabsArr = openTabs;
    const startIndex = tabsArr.findIndex((t) => t.id === id);
    if (startIndex < 0) return;
    const els = tabsArr.map((t) => tabRefs.current.get(t.id)).filter((b): b is HTMLDivElement => !!b);
    if (els.length !== tabsArr.length) return;
    const stripRect = strip.getBoundingClientRect();
    const offsets = els.map((b) => b.getBoundingClientRect().left - stripRect.left + strip.scrollLeft);
    const width = els[startIndex].getBoundingClientRect().width;
    dragStateRef.current = { id, startX: e.clientX, startIndex, currentIndex: startIndex, width, offsets, moved: false };

    const onMove = (ev: PointerEvent) => {
      const st = dragStateRef.current;
      if (!st) return;
      const dx = ev.clientX - st.startX;
      if (!st.moved && Math.abs(dx) < 4) return;
      st.moved = true;
      if (dragTabId !== st.id) setDragTabId(st.id);
      setDragDx(dx);
      const stripEl = tabStripRef.current;
      if (!stripEl) return;
      const pointerXInStrip = ev.clientX - stripEl.getBoundingClientRect().left + stripEl.scrollLeft;
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
        const el = tabRefs.current.get(st.id);
        if (el) flipRef.current = { id: st.id, fromLeft: el.getBoundingClientRect().left };
        setOpenTabs((prev) => {
          const next = prev.slice();
          const [moved] = next.splice(st.startIndex, 1);
          next.splice(st.currentIndex, 0, moved);
          return next;
        });
      }
      setDragTabId(null);
      setDragDx(0);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
  };

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    let arr = events;
    if (folder === "__unsorted__") {
      arr = arr.filter((e) => !e.folder);
    } else if (folder) {
      arr = arr.filter((e) => e.folder === folder);
    }
    if (term) {
      arr = arr.filter((e) =>
        e.title.toLowerCase().includes(term) ||
        e.organizer.toLowerCase().includes(term) ||
        (e.location ?? "").toLowerCase().includes(term),
      );
    }
    return arr;
  }, [events, folder, q]);

  const openEventTab = (e: OrgEvent) => {
    setOpenTabs((prev) => {
      if (prev.some((t) => t.id === e.id)) return prev;
      if (prev.length >= 10) {
        toast.error("You can have at most 10 event tabs open at once.");
        return prev;
      }
      return [...prev, { id: e.id, title: e.title }];
    });
    setActiveId(e.id);
  };

  const closeTab = (id: string) => {
    setOpenTabs((prev) => {
      const idx = prev.findIndex((t) => t.id === id);
      const next = prev.filter((t) => t.id !== id);
      if (activeId === id) {
        if (next.length === 0) setActiveId(null);
        else setActiveId(next[Math.max(0, (idx === -1 ? 0 : idx) - 1)].id);
      }
      return next;
    });
  };

  const togglePublish = async (id: string, next: boolean) => {
    setBusy(true);
    const { error } = await supabase.from("events").update({ published: next } as never).eq("id", id);
    setBusy(false);
    if (error) return toast.error(error.message);
    setEvents((arr) => arr.map((x) => (x.id === id ? { ...x, published: next } : x)));
    toast.success(next ? "Event published." : "Event unpublished.");
  };

  const removeEvent = async (id: string, title: string) => {
    setRowMenuFor(null);
    if (!window.confirm(`Delete event "${title}"? This cannot be undone.`)) return;
    setBusy(true);
    const { error } = await supabase.from("events").delete().eq("id", id);
    setBusy(false);
    if (error) return toast.error(error.message);
    setEvents((arr) => arr.filter((x) => x.id !== id));
    closeTab(id);
    toast.success("Event deleted.");
  };

  const createFolder = async (name: string) => {
    if (!user) return;
    setFolderBusy(true);
    let teamId: string | null = null;
    if (isTeamMode) {
      if (activeEntityId) teamId = activeEntityId;
      else {
        const { data } = await supabase.from("teams").select("id").eq("owner_id", user.id)
          .order("created_at", { ascending: true }).limit(1).maybeSingle();
        teamId = data?.id ?? null;
      }
    }
    const { error } = await supabase.from("event_folders").insert({
      user_id: user.id,
      team_id: teamId,
      name,
    } as never);
    setFolderBusy(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Folder created");
    setFolderDialogOpen(false);
    window.dispatchEvent(new Event("events:refresh"));
  };

  const sideValue: EventsSideNavValue = { folder };
  const onSideChange = (v: EventsSideNavValue) => {
    setActiveId(null);
    setFolder(v.folder);
  };

  const folderLabel =
    folder === "" ? "All events"
      : folder === "__unsorted__" ? "Unsorted"
        : folder;

  if (!user) return <div className="mx-auto max-w-4xl px-6 py-16 text-muted-foreground">Loading…</div>;

  return (
    <div className="h-full overflow-hidden px-4 md:px-6">
      {/* Open event tabs (rendered into the global top tab bar) */}
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
                  const active = activeId === t.id;
                  const isDragging = dragTabId === t.id;
                  let translateX = 0;
                  if (dragTabId && !isDragging) {
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
                    <div
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
                          : dragTabId
                            ? "transform 180ms cubic-bezier(0.2, 0.8, 0.2, 1), color 150ms, border-color 150ms"
                            : "color 150ms, border-color 150ms",
                      }}
                      className={`group -mb-px inline-flex shrink-0 cursor-default select-none items-center gap-1.5 border-b-2 px-3 py-2.5 text-sm ${
                        active
                          ? "border-primary text-ink font-medium"
                          : "border-transparent text-muted-foreground hover:text-ink"
                      }`}
                      title={t.title}
                    >
                      <span className="min-w-0 flex-1 truncate text-left">
                        {t.title || "Untitled event"}
                      </span>
                      <span
                        data-tab-close
                        role="button"
                        tabIndex={0}
                        onPointerDown={(e) => e.stopPropagation()}
                        onClick={(e) => { e.stopPropagation(); closeTab(t.id); }}
                        className="ml-1 shrink-0 rounded px-1 text-xs opacity-60 hover:opacity-100"
                      >
                        ✕
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </nav>
      </TopBarSlot>

      <div className="grid h-full gap-6 overflow-hidden pt-4 md:grid-cols-[220px_1fr]">
        <aside className="md:h-full md:overflow-y-auto md:pr-1">
          <EventsSideNav value={sideValue} onChange={onSideChange} />
        </aside>

        <div className="min-w-0 md:h-full md:overflow-y-auto">
          {activeId ? (
            <OrganizerEventEditor mode="edit" eventId={activeId} />
          ) : (
            <EventsList
              items={filtered}
              onOpen={openEventTab}
              onCopy={(e) => setCopySource(e)}
              onDelete={(e) => void removeEvent(e.id, e.title)}
              onTogglePublish={togglePublish}
              busy={busy}
              rowMenuFor={rowMenuFor}
              setRowMenuFor={setRowMenuFor}
            />
          )}
        </div>
      </div>

      {folderDialogOpen && (
        <FolderCreatorDialog
          onClose={() => setFolderDialogOpen(false)}
          onCreate={createFolder}
          busy={folderBusy}
        />
      )}
      {copySource && (
        <CopyEventDialog
          sourceId={copySource.id}
          sourceTitle={copySource.title}
          initialFolder={copySource.folder}
          onClose={() => setCopySource(null)}
        />
      )}
    </div>
  );
}

/* ---------------- Events list (MS Word-like, professional) ---------------- */

function EventsList({
  items,
  onOpen,
  onCopy,
  onDelete,
  onTogglePublish,
  busy,
  rowMenuFor,
  setRowMenuFor,
}: {
  items: OrgEvent[];
  onOpen: (e: OrgEvent) => void;
  onCopy: (e: OrgEvent) => void;
  onDelete: (e: OrgEvent) => void;
  onTogglePublish: (id: string, next: boolean) => void;
  busy: boolean;
  rowMenuFor: string | null;
  setRowMenuFor: (id: string | null) => void;
}) {
  if (items.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-hairline bg-card/60 p-10 text-center">
        <p className="text-sm text-muted-foreground">No events here yet.</p>
        <p className="mt-1 text-xs text-muted-foreground/70">
          Use the <span className="text-ink">+</span> menu in the top bar to create a new event or folder.
        </p>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-xl border border-hairline bg-card">
      {/* Header row */}
      <div className="grid grid-cols-[1fr_140px_220px] items-center gap-4 border-b border-hairline bg-secondary/30 px-5 py-2.5">
        <span className="mono text-[10px] uppercase tracking-widest text-muted-foreground">Title</span>
        <span className="mono text-[10px] uppercase tracking-widest text-muted-foreground">Date</span>
        <span className="mono text-[10px] uppercase tracking-widest text-right text-muted-foreground">Actions</span>
      </div>

      <ul className="divide-y divide-hairline">
        {items.map((e) => (
          <li
            key={e.id}
            onDoubleClick={() => onOpen(e)}
            className="group grid cursor-default grid-cols-[1fr_140px_220px] items-center gap-4 px-5 py-3 transition hover:bg-secondary/30"
          >
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="truncate text-sm text-ink">{e.title}</span>
                <span
                  className={`mono shrink-0 rounded-sm px-1.5 py-0.5 text-[9px] uppercase tracking-widest ${
                    e.published
                      ? "bg-primary/10 text-primary"
                      : "bg-secondary text-muted-foreground"
                  }`}
                >
                  {e.published ? "Published" : "Draft"}
                </span>
              </div>
              <div className="truncate text-xs text-muted-foreground">
                {e.organizer}{e.location ? ` · ${e.location}` : ""}{e.race_types.length ? ` · ${e.race_types.join(", ")}` : ""}
              </div>
            </div>
            <span className="num text-sm text-ink">{formatDate(e.starts_at)}</span>
            <div className="flex items-center justify-end gap-1">
              <button
                onClick={() => onTogglePublish(e.id, !e.published)}
                disabled={busy}
                title={e.published ? "Unpublish" : "Publish"}
                className={`inline-flex w-[120px] items-center justify-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs transition disabled:opacity-50 ${
                  e.published
                    ? "border-hairline bg-background text-muted-foreground hover:text-ink"
                    : "border-primary bg-card text-primary hover:bg-primary/5"
                }`}
              >
                <Globe className="h-3.5 w-3.5" />
                {e.published ? "Unpublish" : "Publish"}
              </button>

              <div className="relative">
                <button
                  onClick={() => setRowMenuFor(rowMenuFor === e.id ? null : e.id)}
                  aria-label="More actions"
                  className="rounded-md border border-hairline bg-background p-1.5 text-muted-foreground transition hover:text-ink"
                >
                  <MoreVertical className="h-3.5 w-3.5" />
                </button>
                {rowMenuFor === e.id && (
                  <>
                    <div className="fixed inset-0 z-10" onClick={() => setRowMenuFor(null)} />
                    <div className="absolute right-0 top-full z-20 mt-1 w-32 overflow-hidden rounded-md border border-hairline bg-popover shadow-lg">
                      <button
                        onClick={() => { setRowMenuFor(null); onCopy(e); }}
                        className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-ink hover:bg-secondary"
                      >
                        <Copy className="h-3 w-3" /> Copy
                      </button>
                      <button
                        onClick={() => onDelete(e)}
                        className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-destructive hover:bg-secondary"
                      >
                        <Trash2 className="h-3 w-3" /> Delete
                      </button>
                    </div>
                  </>
                )}
              </div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

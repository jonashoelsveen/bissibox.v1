import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
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
    <div className="px-4 md:px-6">
      {/* Top tab bar */}
      <div className="sticky top-14 z-20 -mx-4 flex items-end gap-1 border-b border-hairline bg-background pl-4 pr-4 md:-mx-6 md:pl-6 md:pr-6">
        {/* Fixed Events tab */}
        <button
          onClick={() => { setActiveId(null); setFolder(""); }}
          className={`-mb-px inline-flex shrink-0 select-none items-center gap-1.5 border-b-2 py-2.5 pl-0 pr-4 text-sm font-medium transition ${
            activeId === null
              ? "border-primary text-ink"
              : "border-transparent text-muted-foreground hover:text-ink"
          }`}
          style={{ width: 240 }}
        >
          <CalendarRange className="h-3.5 w-3.5 opacity-70" strokeWidth={2.25} />
          <span className="truncate">{folderLabel}</span>
        </button>

        {/* Open event tabs */}
        <div className="flex flex-1 items-end gap-1 overflow-x-auto overflow-y-hidden whitespace-nowrap [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {openTabs.map((t) => {
            const active = activeId === t.id;
            return (
              <div
                key={t.id}
                className={`-mb-px group inline-flex shrink-0 select-none items-center gap-1.5 border-b-2 py-2.5 pl-3 pr-1.5 text-sm transition ${
                  active ? "border-primary text-ink font-medium" : "border-transparent text-muted-foreground hover:text-ink"
                }`}
                style={{ maxWidth: 220 }}
              >
                <button onClick={() => setActiveId(t.id)} className="truncate text-left">
                  {t.title || "Untitled event"}
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); closeTab(t.id); }}
                  className="rounded p-0.5 text-muted-foreground/60 opacity-0 transition group-hover:opacity-100 hover:bg-secondary hover:text-ink"
                  aria-label="Close tab"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            );
          })}
        </div>

        {/* Right side: search + plus */}
        <div className="flex shrink-0 items-center gap-1 pb-1">
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
                else searchRef.current?.focus();
              }}
              aria-label="Search events"
              className="grid h-9 w-9 shrink-0 place-items-center text-muted-foreground transition hover:text-ink"
            >
              <SearchIcon className="h-4 w-4" />
            </button>
            <input
              ref={searchRef}
              type="text"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Escape") { setQ(""); setSearchOpen(false); }
              }}
              placeholder="Search events"
              className={`min-w-0 flex-1 border-b border-hairline bg-transparent py-1 text-xs text-ink outline-none transition placeholder:text-muted-foreground/70 focus:border-ink/40 ${
                searchOpen ? "opacity-100" : "pointer-events-none w-0 opacity-0"
              }`}
            />
            {searchOpen && (
              <button
                type="button"
                onClick={() => { setQ(""); setSearchOpen(false); }}
                aria-label="Clear search"
                className={`grid h-7 w-7 shrink-0 place-items-center rounded-full text-muted-foreground transition hover:bg-secondary hover:text-ink ${
                  q ? "opacity-100" : "opacity-60"
                }`}
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
          <EventsPlusMenu
            onNewEvent={() => nav({ to: "/organizer/new" })}
            onNewFolder={() => setFolderDialogOpen(true)}
          />
        </div>
      </div>

      <div className="grid gap-6 pt-4 md:grid-cols-[240px_1fr]">
        <aside className="md:sticky md:top-28 md:self-start">
          <EventsSideNav value={sideValue} onChange={onSideChange} />
        </aside>

        <div className="min-w-0">
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

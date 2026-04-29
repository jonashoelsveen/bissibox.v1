/**
 * Calendar — UI shell only.
 *
 * Mirrors the structure of the Library page (/media):
 *   - Top main tab "Calendar" with right-aligned actions: Search, New folder, New calendar
 *   - Left side nav: Previous (top), then folders + calendars. In team mode, the
 *     team's "global" calendar is pinned at the top of the calendar list.
 *   - Top-right view picker (Day / Week / Month / Year) — last-used view persists
 *     per-calendar in localStorage.
 *   - Settings icon opens a wide settings dialog with collapsible sections
 *     (Year timeframe, Access, Autosave, Sync) — placeholders for now.
 *
 * NO backend wiring yet for calendars, folders, sync or grid. Folders and
 * calendars are persisted locally so the shell behaves naturally while we
 * wait for backend / UI-style instructions.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearch } from "@tanstack/react-router";
import { motion, AnimatePresence } from "framer-motion";
import {
  CalendarDays,
  ChevronDown,
  ChevronRight,
  History,
  MoreHorizontal,
  Pencil,
  Pin,
  PinOff,
  Plus,
  Search,
  Settings as SettingsIcon,
  Trash2,
  X,
  FolderClosed,
  Copy,
} from "lucide-react";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

/* ------------------------------------------------------------------ */
/* Local persistence (placeholder until backend is wired)              */
/* ------------------------------------------------------------------ */

type Cal = {
  id: string;
  name: string;
  pinned: boolean;
  folder: string | null;
  isTeamGlobal?: boolean; // synthesized from team
};
type Folder = { id: string; name: string; pinned: boolean };

const calsKey = (scope: string) => `calendar:cals:${scope}`;
const foldersKey = (scope: string) => `calendar:folders:${scope}`;
const viewKey = (calId: string) => `calendar:view:${calId}`;
const settingsKey = (calId: string) => `calendar:settings:${calId}`;

type ViewMode = "day" | "week" | "month" | "year";

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
}

/* ------------------------------------------------------------------ */
/* Page                                                                */
/* ------------------------------------------------------------------ */

export function CalendarPage() {
  const navigate = useNavigate();
  const search = useSearch({ from: "/calendar" });
  const { user, mode, activeEntityId } = useAuth();
  const isTeamMode = mode === "team" || mode === "organizer" || !!activeEntityId;

  // scope for localStorage – per user / per team
  const [teamId, setTeamId] = useState<string | null>(null);
  const [teamName, setTeamName] = useState<string>("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!user) return;
      if (!isTeamMode) {
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

  /* ----- folders + calendars (local) ----- */
  const [folders, setFolders] = useState<Folder[]>([]);
  const [cals, setCals] = useState<Cal[]>([]);

  useEffect(() => {
    setFolders(readJSON<Folder[]>(foldersKey(scope), []));
    setCals(readJSON<Cal[]>(calsKey(scope), []));
  }, [scope]);

  const persistFolders = (next: Folder[]) => {
    setFolders(next);
    writeJSON(foldersKey(scope), next);
  };
  const persistCals = (next: Cal[]) => {
    setCals(next);
    writeJSON(calsKey(scope), next);
  };

  // Synthesize team-global calendar (always top, not deletable)
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

  /* ----- selection ----- */
  const [selected, setSelected] = useState<{ kind: "previous" } | { kind: "cal"; id: string }>(
    () => {
      if (search.view === "previous") return { kind: "previous" };
      if (search.calendar) return { kind: "cal", id: search.calendar };
      return { kind: "previous" };
    },
  );

  // Keep URL in sync (shareable)
  useEffect(() => {
    if (selected.kind === "previous") {
      navigate({
        to: "/calendar",
        search: { view: "previous" },
        replace: true,
      });
    } else {
      navigate({
        to: "/calendar",
        search: { calendar: selected.id },
        replace: true,
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected]);

  /* ----- open tabs (like notes/meetings horizontal tab bar) ----- */
  const [openTabs, setOpenTabs] = useState<{ id: string; name: string }[]>([]);
  const openCalendar = (c: Cal) => {
    setOpenTabs((tabs) =>
      tabs.find((t) => t.id === c.id) ? tabs : [...tabs, { id: c.id, name: c.name }],
    );
    setSelected({ kind: "cal", id: c.id });
  };
  const closeTab = (id: string) => {
    setOpenTabs((tabs) => tabs.filter((t) => t.id !== id));
    if (selected.kind === "cal" && selected.id === id) {
      setSelected({ kind: "previous" });
    }
  };

  /* ----- view per calendar ----- */
  const activeCal = selected.kind === "cal" ? allCals.find((c) => c.id === selected.id) : null;
  const [view, setView] = useState<ViewMode>("month");
  useEffect(() => {
    if (!activeCal) return;
    setView(readJSON<ViewMode>(viewKey(activeCal.id), "month"));
  }, [activeCal?.id]);
  const updateView = (v: ViewMode) => {
    setView(v);
    if (activeCal) writeJSON(viewKey(activeCal.id), v);
  };

  /* ----- top-right actions ----- */
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchValue, setSearchValue] = useState("");
  const [newFolderOpen, setNewFolderOpen] = useState(false);
  const [newCalOpen, setNewCalOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

  /* ------------------------------------------------------------ */
  /* Render                                                       */
  /* ------------------------------------------------------------ */
  return (
    <div className="min-h-screen pl-[88px]">
      <div className="mx-auto flex max-w-[1600px] gap-6 px-6 py-8">
        {/* Left side nav */}
        <aside className="w-[260px] shrink-0">
          <CalendarSideNav
            selected={selected}
            onSelect={(s) => {
              if (s.kind === "cal") {
                const c = allCals.find((x) => x.id === s.id);
                if (c) openCalendar(c);
              } else setSelected(s);
            }}
            folders={folders}
            cals={allCals}
            onPersistFolders={persistFolders}
            onPersistCals={persistCals}
          />
        </aside>

        {/* Main */}
        <main className="min-w-0 flex-1">
          {/* Top tab bar */}
          <div className="mb-4 flex items-center gap-2 border-b border-hairline pb-3">
            <div className="inline-flex items-center gap-2 rounded-md bg-secondary px-3 py-1.5 text-sm font-medium text-ink">
              <CalendarDays className="h-4 w-4" strokeWidth={2.25} />
              Calendar
            </div>

            {/* Open tabs */}
            <div className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto">
              {openTabs.map((t) => {
                const isActive = selected.kind === "cal" && selected.id === t.id;
                return (
                  <div
                    key={t.id}
                    className={`group inline-flex items-center gap-1 rounded-md px-2.5 py-1.5 text-xs transition ${
                      isActive
                        ? "bg-secondary text-ink"
                        : "text-muted-foreground hover:bg-secondary/60"
                    }`}
                  >
                    <button onClick={() => setSelected({ kind: "cal", id: t.id })}>
                      {t.name}
                    </button>
                    <button
                      onClick={() => closeTab(t.id)}
                      className="opacity-60 hover:opacity-100"
                      aria-label="Close tab"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                );
              })}
            </div>

            {/* Right actions */}
            <div className="flex items-center gap-1">
              {searchOpen ? (
                <div className="flex items-center gap-1 rounded-md border border-hairline bg-background px-2 py-1">
                  <Search className="h-3.5 w-3.5 text-muted-foreground" />
                  <input
                    autoFocus
                    value={searchValue}
                    onChange={(e) => setSearchValue(e.target.value)}
                    placeholder="Search calendars…"
                    className="w-44 bg-transparent text-xs outline-none"
                  />
                  <button
                    onClick={() => {
                      setSearchOpen(false);
                      setSearchValue("");
                    }}
                  >
                    <X className="h-3.5 w-3.5 text-muted-foreground" />
                  </button>
                </div>
              ) : (
                <IconBtn label="Search" onClick={() => setSearchOpen(true)}>
                  <Search className="h-4 w-4" strokeWidth={2.25} />
                </IconBtn>
              )}
              <IconBtn label="New folder" onClick={() => setNewFolderOpen(true)}>
                <FolderClosed className="h-4 w-4" strokeWidth={2.25} />
              </IconBtn>
              <IconBtn label="New calendar" onClick={() => setNewCalOpen(true)}>
                <Plus className="h-4 w-4" strokeWidth={2.25} />
              </IconBtn>
            </div>
          </div>

          {/* Body */}
          {selected.kind === "previous" ? (
            <PreviousList
              cals={allCals}
              onOpen={openCalendar}
              filter={searchValue}
            />
          ) : activeCal ? (
            <CalendarView
              cal={activeCal}
              view={view}
              onChangeView={updateView}
              onOpenSettings={() => setSettingsOpen(true)}
            />
          ) : (
            <div className="rounded-lg border border-hairline p-12 text-center text-sm text-muted-foreground">
              This calendar no longer exists.
            </div>
          )}
        </main>
      </div>

      {/* Dialogs */}
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
              { id: crypto.randomUUID(), name: trimmed, pinned: false },
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
            const f: Folder = { id: crypto.randomUUID(), name: trimmed, pinned: false };
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
      {settingsOpen && activeCal && (
        <CalendarSettingsDialog
          cal={activeCal}
          allCals={allCals}
          folders={folders}
          onClose={() => setSettingsOpen(false)}
          onSelectCal={(id) => setSelected({ kind: "cal", id })}
          onDuplicate={(c) => {
            const copy: Cal = {
              ...c,
              id: crypto.randomUUID(),
              name: `${c.name} (copy)`,
              isTeamGlobal: false,
              pinned: false,
            };
            persistCals([...cals, copy]);
            openCalendar(copy);
            toast.success("Calendar duplicated");
          }}
        />
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Side nav                                                            */
/* ------------------------------------------------------------------ */

type Selected = { kind: "previous" } | { kind: "cal"; id: string };

function CalendarSideNav({
  selected,
  onSelect,
  folders,
  cals,
  onPersistFolders,
  onPersistCals,
}: {
  selected: Selected;
  onSelect: (s: Selected) => void;
  folders: Folder[];
  cals: Cal[];
  onPersistFolders: (f: Folder[]) => void;
  onPersistCals: (c: Cal[]) => void;
}) {
  const [openFolders, setOpenFolders] = useState<Record<string, boolean>>({});
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const [renameId, setRenameId] = useState<string | null>(null);
  const [renameVal, setRenameVal] = useState("");

  const isPrev = selected.kind === "previous";

  const calsByFolder: Record<string, Cal[]> = {};
  const looseCals: Cal[] = [];
  for (const c of cals) {
    if (c.folder) {
      (calsByFolder[c.folder] ??= []).push(c);
    } else {
      looseCals.push(c);
    }
  }

  const togglePinCal = (c: Cal) => {
    setMenuFor(null);
    onPersistCals(cals.map((x) => (x.id === c.id ? { ...x, pinned: !x.pinned } : x)));
  };
  const deleteCal = (c: Cal) => {
    setMenuFor(null);
    onPersistCals(cals.filter((x) => x.id !== c.id));
  };
  const renameItem = (id: string, name: string) => {
    setRenameId(id);
    setRenameVal(name);
    setMenuFor(null);
  };
  const commitRename = () => {
    if (!renameId) return;
    const v = renameVal.trim();
    if (!v) {
      setRenameId(null);
      return;
    }
    if (folders.some((f) => f.id === renameId)) {
      const old = folders.find((f) => f.id === renameId)!;
      onPersistFolders(folders.map((f) => (f.id === renameId ? { ...f, name: v } : f)));
      // re-link cals
      onPersistCals(cals.map((c) => (c.folder === old.name ? { ...c, folder: v } : c)));
    } else {
      onPersistCals(cals.map((c) => (c.id === renameId ? { ...c, name: v } : c)));
    }
    setRenameId(null);
  };

  const sortCals = (arr: Cal[]) =>
    [...arr].sort((a, b) => Number(b.pinned) - Number(a.pinned) || a.name.localeCompare(b.name));

  return (
    <nav className="flex flex-col gap-1">
      {/* Previous */}
      <button
        onClick={() => onSelect({ kind: "previous" })}
        className={`group flex w-full items-center rounded-md px-3 py-2 text-left text-sm transition ${
          isPrev ? "bg-secondary font-medium text-ink" : "text-ink hover:bg-secondary/60"
        }`}
      >
        <span className="grid h-5 w-5 shrink-0 place-items-center text-muted-foreground">
          <History className="h-3.5 w-3.5" strokeWidth={2.25} />
        </span>
        <span className="ml-2 min-w-0 flex-1 truncate">Previous</span>
      </button>

      {/* Folders */}
      {folders.map((f) => {
        const list = sortCals(calsByFolder[f.name] ?? []);
        const isOpen = openFolders[f.id] ?? true;
        return (
          <div key={f.id} className="flex flex-col">
            <div className="group flex items-center rounded-md px-1 py-1 hover:bg-secondary/60">
              <button
                onClick={() => setOpenFolders((o) => ({ ...o, [f.id]: !isOpen }))}
                className="flex min-w-0 flex-1 items-center px-2 py-1 text-left text-sm text-ink"
              >
                <span className="grid h-5 w-5 shrink-0 place-items-center text-muted-foreground">
                  <FolderClosed className="h-3.5 w-3.5" strokeWidth={2.25} />
                </span>
                <span className="ml-2 min-w-0 flex-1 truncate">
                  {renameId === f.id ? (
                    <input
                      autoFocus
                      value={renameVal}
                      onChange={(e) => setRenameVal(e.target.value)}
                      onBlur={commitRename}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") commitRename();
                        if (e.key === "Escape") setRenameId(null);
                      }}
                      className="w-full rounded border border-hairline bg-background px-1 text-sm"
                    />
                  ) : (
                    f.name
                  )}
                </span>
                <ChevronRight
                  className={`h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform ${
                    isOpen ? "rotate-90" : ""
                  }`}
                />
              </button>
              <FolderMenu
                open={menuFor === f.id}
                onOpenChange={(v) => setMenuFor(v ? f.id : null)}
                onRename={() => renameItem(f.id, f.name)}
                onDelete={() => {
                  setMenuFor(null);
                  // detach cals + remove folder
                  onPersistCals(
                    cals.map((c) => (c.folder === f.name ? { ...c, folder: null } : c)),
                  );
                  onPersistFolders(folders.filter((x) => x.id !== f.id));
                }}
              />
            </div>
            <AnimatePresence initial={false}>
              {isOpen && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.18, ease: "easeOut" }}
                  style={{ overflow: "hidden" }}
                >
                  <div className="ml-5 mt-0.5 flex flex-col gap-0.5 border-l border-hairline pl-2">
                    {list.length === 0 && (
                      <div className="px-2 py-1 text-xs text-muted-foreground">
                        No calendars
                      </div>
                    )}
                    {list.map((c) => (
                      <CalRow
                        key={c.id}
                        cal={c}
                        active={selected.kind === "cal" && selected.id === c.id}
                        onSelect={() => onSelect({ kind: "cal", id: c.id })}
                        menuOpen={menuFor === c.id}
                        onMenuChange={(v) => setMenuFor(v ? c.id : null)}
                        onRename={() => renameItem(c.id, c.name)}
                        onTogglePin={() => togglePinCal(c)}
                        onDelete={() => deleteCal(c)}
                        renaming={renameId === c.id}
                        renameVal={renameVal}
                        onRenameValChange={setRenameVal}
                        onCommitRename={commitRename}
                        onCancelRename={() => setRenameId(null)}
                      />
                    ))}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        );
      })}

      {/* Loose calendars */}
      {sortCals(looseCals).map((c) => (
        <CalRow
          key={c.id}
          cal={c}
          active={selected.kind === "cal" && selected.id === c.id}
          onSelect={() => onSelect({ kind: "cal", id: c.id })}
          menuOpen={menuFor === c.id}
          onMenuChange={(v) => setMenuFor(v ? c.id : null)}
          onRename={() => renameItem(c.id, c.name)}
          onTogglePin={() => togglePinCal(c)}
          onDelete={() => deleteCal(c)}
          renaming={renameId === c.id}
          renameVal={renameVal}
          onRenameValChange={setRenameVal}
          onCommitRename={commitRename}
          onCancelRename={() => setRenameId(null)}
        />
      ))}
    </nav>
  );
}

function CalRow({
  cal,
  active,
  onSelect,
  menuOpen,
  onMenuChange,
  onRename,
  onTogglePin,
  onDelete,
  renaming,
  renameVal,
  onRenameValChange,
  onCommitRename,
  onCancelRename,
}: {
  cal: Cal;
  active: boolean;
  onSelect: () => void;
  menuOpen: boolean;
  onMenuChange: (v: boolean) => void;
  onRename: () => void;
  onTogglePin: () => void;
  onDelete: () => void;
  renaming: boolean;
  renameVal: string;
  onRenameValChange: (v: string) => void;
  onCommitRename: () => void;
  onCancelRename: () => void;
}) {
  return (
    <div
      className={`group flex items-center rounded-md px-1 py-1 transition ${
        active ? "bg-secondary" : "hover:bg-secondary/60"
      }`}
    >
      <button
        onClick={onSelect}
        className="flex min-w-0 flex-1 items-center px-2 py-1 text-left text-sm text-ink"
      >
        <span className="grid h-5 w-5 shrink-0 place-items-center text-muted-foreground">
          <CalendarDays className="h-3.5 w-3.5" strokeWidth={2.25} />
        </span>
        <span className="ml-2 min-w-0 flex-1 truncate">
          {renaming ? (
            <input
              autoFocus
              value={renameVal}
              onChange={(e) => onRenameValChange(e.target.value)}
              onBlur={onCommitRename}
              onKeyDown={(e) => {
                if (e.key === "Enter") onCommitRename();
                if (e.key === "Escape") onCancelRename();
              }}
              className="w-full rounded border border-hairline bg-background px-1 text-sm"
            />
          ) : (
            cal.name
          )}
        </span>
        {cal.pinned && <Pin className="ml-1 h-3 w-3 text-muted-foreground" />}
      </button>
      {!cal.isTeamGlobal && (
        <FolderMenu
          open={menuOpen}
          onOpenChange={onMenuChange}
          onRename={onRename}
          onDelete={onDelete}
          onTogglePin={onTogglePin}
          pinned={cal.pinned}
        />
      )}
    </div>
  );
}

function FolderMenu({
  open,
  onOpenChange,
  onRename,
  onDelete,
  onTogglePin,
  pinned,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onRename: () => void;
  onDelete: () => void;
  onTogglePin?: () => void;
  pinned?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) onOpenChange(false);
    };
    window.addEventListener("mousedown", onClick);
    return () => window.removeEventListener("mousedown", onClick);
  }, [open, onOpenChange]);
  return (
    <div ref={ref} className="relative">
      <button
        onClick={(e) => {
          e.stopPropagation();
          onOpenChange(!open);
        }}
        className="opacity-0 transition group-hover:opacity-100 hover:bg-secondary rounded p-1"
        aria-label="More"
      >
        <MoreHorizontal className="h-3.5 w-3.5 text-muted-foreground" />
      </button>
      {open && (
        <div className="absolute right-0 top-full z-50 mt-1 w-40 rounded-md border border-hairline bg-popover py-1 shadow-md">
          {onTogglePin && (
            <MenuItem onClick={onTogglePin} icon={pinned ? PinOff : Pin}>
              {pinned ? "Unpin" : "Pin"}
            </MenuItem>
          )}
          <MenuItem onClick={onRename} icon={Pencil}>
            Rename
          </MenuItem>
          <MenuItem onClick={onDelete} icon={Trash2} destructive>
            Delete
          </MenuItem>
        </div>
      )}
    </div>
  );
}

function MenuItem({
  onClick,
  icon: Icon,
  destructive,
  children,
}: {
  onClick: () => void;
  icon: React.ComponentType<{ className?: string }>;
  destructive?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs transition hover:bg-secondary ${
        destructive ? "text-destructive" : "text-ink"
      }`}
    >
      <Icon className="h-3.5 w-3.5" />
      {children}
    </button>
  );
}

/* ------------------------------------------------------------------ */
/* Previous list (rows)                                                */
/* ------------------------------------------------------------------ */

function PreviousList({
  cals,
  onOpen,
  filter,
}: {
  cals: Cal[];
  onOpen: (c: Cal) => void;
  filter: string;
}) {
  const f = filter.trim().toLowerCase();
  const list = f ? cals.filter((c) => c.name.toLowerCase().includes(f)) : cals;
  if (list.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-hairline p-12 text-center text-sm text-muted-foreground">
        No calendars yet. Click <span className="font-medium text-ink">New calendar</span> to
        create one.
      </div>
    );
  }
  return (
    <div className="flex flex-col divide-y divide-hairline rounded-lg border border-hairline">
      {list.map((c) => (
        <button
          key={c.id}
          onClick={() => onOpen(c)}
          className="flex items-center gap-3 px-4 py-3 text-left transition hover:bg-secondary/40"
        >
          <CalendarDays className="h-4 w-4 text-muted-foreground" strokeWidth={2.25} />
          <span className="flex-1 text-sm text-ink">{c.name}</span>
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

/* ------------------------------------------------------------------ */
/* Calendar view (placeholder grid)                                    */
/* ------------------------------------------------------------------ */

function CalendarView({
  cal,
  view,
  onChangeView,
  onOpenSettings,
}: {
  cal: Cal;
  view: ViewMode;
  onChangeView: (v: ViewMode) => void;
  onOpenSettings: () => void;
}) {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-ink">{cal.name}</h1>
        <div className="flex items-center gap-2">
          <ViewPicker value={view} onChange={onChangeView} />
          <IconBtn label="Calendar settings" onClick={onOpenSettings}>
            <SettingsIcon className="h-4 w-4" strokeWidth={2.25} />
          </IconBtn>
        </div>
      </div>
      <div className="rounded-lg border border-dashed border-hairline p-16 text-center text-sm text-muted-foreground">
        {view.charAt(0).toUpperCase() + view.slice(1)} view will appear here.
        <br />
        <span className="text-xs">
          UI styles and grid arrive with the next round of instructions.
        </span>
      </div>
    </div>
  );
}

function ViewPicker({ value, onChange }: { value: ViewMode; onChange: (v: ViewMode) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const fn = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener("mousedown", fn);
    return () => window.removeEventListener("mousedown", fn);
  }, [open]);
  const opts: ViewMode[] = ["day", "week", "month", "year"];
  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="inline-flex items-center gap-1.5 rounded-md border border-hairline bg-background px-3 py-1.5 text-xs font-medium text-ink hover:bg-secondary/60"
      >
        {value.charAt(0).toUpperCase() + value.slice(1)}
        <ChevronDown className="h-3.5 w-3.5" />
      </button>
      {open && (
        <div className="absolute right-0 top-full z-50 mt-1 w-32 rounded-md border border-hairline bg-popover py-1 shadow-md">
          {opts.map((o) => (
            <button
              key={o}
              onClick={() => {
                onChange(o);
                setOpen(false);
              }}
              className={`flex w-full px-3 py-1.5 text-left text-xs hover:bg-secondary ${
                o === value ? "font-medium text-ink" : "text-muted-foreground"
              }`}
            >
              {o.charAt(0).toUpperCase() + o.slice(1)}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Reusable bits                                                       */
/* ------------------------------------------------------------------ */

function IconBtn({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      title={label}
      className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition hover:bg-secondary hover:text-ink"
    >
      {children}
    </button>
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
          className="rounded-md bg-ink px-3 py-1.5 text-xs font-medium text-background hover:opacity-90"
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
  folders: Folder[];
  onClose: () => void;
  onSubmit: (name: string, folder: string | null) => void;
  onCreateFolder: (name: string) => Folder | null;
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
                className="rounded-md bg-ink px-3 py-2 text-xs text-background"
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
          className="rounded-md bg-ink px-3 py-1.5 text-xs font-medium text-background hover:opacity-90"
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
      <div className="w-full max-w-md rounded-lg border border-hairline bg-background p-5 shadow-xl">
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

/* ------------------------------------------------------------------ */
/* Settings dialog                                                     */
/* ------------------------------------------------------------------ */

type CalSettings = {
  yearStart: string;
  yearEnd: string;
  autosave: boolean;
  access: { email: string }[];
  syncOutlook: boolean;
  syncGmail: boolean;
  syncIcloud: boolean;
  sessionsPerDay: 1 | 2 | 3 | 4;
  showFullLastWeek: boolean;
  categoryColors: Record<string, string>;
};
const defaultSettings: CalSettings = {
  yearStart: "",
  yearEnd: "",
  autosave: false,
  access: [],
  syncOutlook: false,
  syncGmail: false,
  syncIcloud: false,
  sessionsPerDay: 1,
  showFullLastWeek: true,
  categoryColors: { Meetings: "#3B82F6", Event: "#10B981", Race: "#F59E0B" },
};

function CalendarSettingsDialog({
  cal,
  allCals,
  folders,
  onClose,
  onSelectCal,
  onDuplicate,
}: {
  cal: Cal;
  allCals: Cal[];
  folders: Folder[];
  onClose: () => void;
  onSelectCal: (id: string) => void;
  onDuplicate: (c: Cal) => void;
}) {
  const [s, setS] = useState<CalSettings>(() =>
    readJSON<CalSettings>(settingsKey(cal.id), defaultSettings),
  );
  useEffect(() => {
    setS(readJSON<CalSettings>(settingsKey(cal.id), defaultSettings));
  }, [cal.id]);
  const update = (patch: Partial<CalSettings>) => {
    const next = { ...s, ...patch };
    setS(next);
    writeJSON(settingsKey(cal.id), next);
  };
  const [inviteEmail, setInviteEmail] = useState("");

  const calsByFolder: Record<string, Cal[]> = {};
  const loose: Cal[] = [];
  for (const c of allCals) {
    if (c.folder) (calsByFolder[c.folder] ??= []).push(c);
    else loose.push(c);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="flex h-[85vh] w-full max-w-5xl overflow-hidden rounded-lg border border-hairline bg-background shadow-xl">
        {/* Inner left menu */}
        <aside className="w-[260px] shrink-0 border-r border-hairline p-4">
          <div className="mb-3 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Calendars
          </div>
          <div className="flex flex-col gap-0.5">
            {folders.map((f) => (
              <div key={f.id} className="flex flex-col">
                <div className="flex items-center gap-2 px-2 py-1 text-xs text-muted-foreground">
                  <FolderClosed className="h-3 w-3" />
                  {f.name}
                </div>
                <div className="ml-3 flex flex-col gap-0.5 border-l border-hairline pl-2">
                  {(calsByFolder[f.name] ?? []).map((c) => (
                    <button
                      key={c.id}
                      onClick={() => onSelectCal(c.id)}
                      className={`flex items-center gap-2 rounded px-2 py-1 text-left text-xs ${
                        c.id === cal.id ? "bg-secondary text-ink" : "text-ink hover:bg-secondary/60"
                      }`}
                    >
                      <CalendarDays className="h-3 w-3 text-muted-foreground" />
                      {c.name}
                    </button>
                  ))}
                </div>
              </div>
            ))}
            {loose.map((c) => (
              <button
                key={c.id}
                onClick={() => onSelectCal(c.id)}
                className={`flex items-center gap-2 rounded px-2 py-1 text-left text-xs ${
                  c.id === cal.id ? "bg-secondary text-ink" : "text-ink hover:bg-secondary/60"
                }`}
              >
                <CalendarDays className="h-3 w-3 text-muted-foreground" />
                {c.name}
              </button>
            ))}
          </div>
        </aside>

        {/* Main */}
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex items-center justify-between border-b border-hairline px-6 py-4">
            <div>
              <div className="text-xs uppercase tracking-wide text-muted-foreground">Settings</div>
              <h2 className="text-lg font-semibold text-ink">{cal.name}</h2>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => onDuplicate(cal)}
                className="inline-flex items-center gap-1.5 rounded-md border border-hairline px-3 py-1.5 text-xs text-ink hover:bg-secondary"
              >
                <Copy className="h-3.5 w-3.5" /> Duplicate
              </button>
              <button onClick={onClose} className="text-muted-foreground hover:text-ink">
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-6">
            <div className="flex flex-col gap-2">
              <SettingSection title="Year timeframe" summary={`${s.yearStart || "—"} → ${s.yearEnd || "—"}`}>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Start date">
                    <input
                      type="date"
                      value={s.yearStart}
                      onChange={(e) => update({ yearStart: e.target.value })}
                      className="w-full rounded-md border border-hairline bg-background px-3 py-2 text-sm"
                    />
                  </Field>
                  <Field label="End date">
                    <input
                      type="date"
                      value={s.yearEnd}
                      onChange={(e) => update({ yearEnd: e.target.value })}
                      className="w-full rounded-md border border-hairline bg-background px-3 py-2 text-sm"
                    />
                  </Field>
                </div>
              </SettingSection>

              <SettingSection
                title="Access"
                summary={`${s.access.length} invited`}
              >
                <div className="flex flex-col gap-2">
                  <div className="flex gap-2">
                    <input
                      value={inviteEmail}
                      onChange={(e) => setInviteEmail(e.target.value)}
                      placeholder="email@example.com"
                      className="flex-1 rounded-md border border-hairline bg-background px-3 py-2 text-sm"
                    />
                    <button
                      onClick={() => {
                        const v = inviteEmail.trim();
                        if (!v) return;
                        update({ access: [...s.access, { email: v }] });
                        setInviteEmail("");
                        toast.success("Invitation prepared (sending wired with backend)");
                      }}
                      className="rounded-md bg-ink px-3 py-2 text-xs font-medium text-background"
                    >
                      Invite
                    </button>
                  </div>
                  {s.access.length === 0 ? (
                    <p className="text-xs text-muted-foreground">
                      No one else has access yet. Invitees receive an email and the calendar
                      appears under their folder header on accept.
                    </p>
                  ) : (
                    <ul className="flex flex-col divide-y divide-hairline rounded-md border border-hairline">
                      {s.access.map((a, i) => (
                        <li
                          key={i}
                          className="flex items-center justify-between px-3 py-2 text-sm"
                        >
                          <span>{a.email}</span>
                          <button
                            onClick={() =>
                              update({ access: s.access.filter((_, j) => j !== i) })
                            }
                            className="text-muted-foreground hover:text-destructive"
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </SettingSection>

              <SettingSection title="Autosave" summary={s.autosave ? "On" : "Off"}>
                <label className="flex items-center justify-between">
                  <span className="text-sm">Autosave changes</span>
                  <Switch
                    checked={s.autosave}
                    onChange={(v) => update({ autosave: v })}
                  />
                </label>
              </SettingSection>

              <SettingSection
                title="Sync with other calendar"
                summary={
                  [
                    s.syncOutlook && "Outlook",
                    s.syncGmail && "Gmail",
                    s.syncIcloud && "iCloud",
                  ]
                    .filter(Boolean)
                    .join(", ") || "Not connected"
                }
              >
                <p className="mb-3 text-xs text-muted-foreground">
                  Detailed integration arrives with the next instructions. Toggles below are UI
                  placeholders.
                </p>
                <div className="flex flex-col gap-2">
                  {(["Outlook", "Gmail", "iCloud"] as const).map((p) => {
                    const k =
                      p === "Outlook"
                        ? "syncOutlook"
                        : p === "Gmail"
                          ? "syncGmail"
                          : "syncIcloud";
                    return (
                      <label key={p} className="flex items-center justify-between">
                        <span className="text-sm">{p}</span>
                        <Switch
                          checked={s[k] as boolean}
                          onChange={(v) => update({ [k]: v } as Partial<CalSettings>)}
                        />
                      </label>
                    );
                  })}
                </div>
              </SettingSection>

              <SettingSection title="Sessions per day" summary={String(s.sessionsPerDay)}>
                <div className="flex gap-2">
                  {([1, 2, 3, 4] as const).map((n) => (
                    <button
                      key={n}
                      onClick={() => update({ sessionsPerDay: n })}
                      className={`h-9 w-9 rounded-md border text-sm ${
                        s.sessionsPerDay === n
                          ? "border-ink bg-ink text-background"
                          : "border-hairline text-ink hover:bg-secondary"
                      }`}
                    >
                      {n}
                    </button>
                  ))}
                </div>
              </SettingSection>

              <SettingSection
                title="Category color"
                summary={Object.keys(s.categoryColors).join(", ")}
              >
                <div className="flex flex-col gap-2">
                  {Object.entries(s.categoryColors).map(([cat, color]) => (
                    <div key={cat} className="flex items-center justify-between">
                      <span className="text-sm">{cat}</span>
                      <input
                        type="color"
                        value={color}
                        onChange={(e) =>
                          update({
                            categoryColors: { ...s.categoryColors, [cat]: e.target.value },
                          })
                        }
                        className="h-8 w-14 cursor-pointer rounded border border-hairline bg-transparent"
                      />
                    </div>
                  ))}
                </div>
              </SettingSection>

              <SettingSection
                title="Show full last week in month view"
                summary={s.showFullLastWeek ? "On" : "Off"}
              >
                <label className="flex items-center justify-between">
                  <span className="text-sm">
                    Always show through Sunday in the last week of the month
                  </span>
                  <Switch
                    checked={s.showFullLastWeek}
                    onChange={(v) => update({ showFullLastWeek: v })}
                  />
                </label>
              </SettingSection>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function SettingSection({
  title,
  summary,
  children,
}: {
  title: string;
  summary?: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-lg border border-hairline">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between px-4 py-3 text-left"
      >
        <div className="flex flex-col">
          <span className="text-sm font-medium text-ink">{title}</span>
          {summary && !open && (
            <span className="text-xs text-muted-foreground">{summary}</span>
          )}
        </div>
        <ChevronDown
          className={`h-4 w-4 text-muted-foreground transition-transform ${
            open ? "rotate-180" : ""
          }`}
        />
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.18, ease: "easeOut" }}
            style={{ overflow: "hidden" }}
          >
            <div className="border-t border-hairline px-4 py-4">{children}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1 block text-xs text-muted-foreground">{label}</label>
      {children}
    </div>
  );
}

function Switch({
  checked,
  onChange,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      onClick={() => onChange(!checked)}
      className={`relative h-5 w-9 rounded-full transition ${
        checked ? "bg-ink" : "bg-hairline"
      }`}
      aria-pressed={checked}
    >
      <span
        className={`absolute top-0.5 h-4 w-4 rounded-full bg-background transition ${
          checked ? "left-4" : "left-0.5"
        }`}
      />
    </button>
  );
}

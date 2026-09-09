/**
 * Map — UI shell that mirrors the Library/Calendar page exactly.
 *
 * Structure:
 *   - Sticky horizontal top tab bar with "Map" main tab on the left.
 *   - Side nav: Previous + collapsible "Map" section with folders.
 *   - Right body: Previous list rows, or an open map view.
 *
 * The "+" actions menu is a dropdown with three options:
 *   Folder  — opens the same new-folder dialog used elsewhere.
 *   Location — name + folder selector. Save opens a new map view.
 *   Course  — name + folder selector. Save opens a new map view.
 *
 * Folders + items are persisted to localStorage as a placeholder until the
 * backend is wired (matches the Calendar page approach).
 */

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { TopBarSlot } from "@/components/TopBarSlot";
import { useNavigate, useSearch, type NavigateOptions } from "@tanstack/react-router";
import {
  FolderClosed,
  Map as MapIcon,
  MapPin,
  Plus,
  Route as RouteIcon,
  Search as SearchIcon,
  X,
} from "lucide-react";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { MapSideNav, type MapSideNavValue } from "./MapSideNav";
import { MapItemView } from "./MapItemView";
import { FolderMapView } from "./FolderMapView";

/* ------------------------------------------------------------------ */
/* Local persistence                                                   */
/* ------------------------------------------------------------------ */

export type MapItemKind = "location" | "course";

export type LatLng = [number, number];
export type MapSplitKind = "split" | "fuel" | "start" | "finish" | "marker";
export interface MapSplitPoint {
  id: string;
  kind: MapSplitKind;
  label: string;
  position: LatLng;
  note?: string;
}

export type MapItem = {
  id: string;
  kind: MapItemKind;
  name: string;
  pinned: boolean;
  /** Legacy: folder name. New code uses folderId. Kept for back-compat reads. */
  folder: string | null;
  folderId: string | null;
  color: string;
  created_at: string;
  // Geometry
  pin?: { lat: number; lng: number } | null;
  path?: LatLng[];
  splits?: MapSplitPoint[];
};
export type MapFolderView = { center: [number, number]; zoom: number };
export type MapFolder = {
  id: string;
  name: string;
  pinned: boolean;
  sort_order: number;
  /** Default map view shown when creating a new location/course inside this folder. */
  defaultView?: MapFolderView | null;
};

export const itemsKey = (scope: string) => `map:items:${scope}`;
export const foldersKey = (scope: string) => `map:folders:${scope}`;

/** 10-color palette used for locations + courses inside a folder. */
export const MAP_COLOR_PALETTE = [
  "#6366F1", // indigo
  "#16a34a", // green
  "#dc2626", // red
  "#f59e0b", // amber
  "#0ea5e9", // sky
  "#7c3aed", // violet
  "#db2777", // pink
  "#0d9488", // teal
  "#ea580c", // orange
  "#475569", // slate
];

export function pickFolderColor(existing: string[]): string {
  for (const c of MAP_COLOR_PALETTE) {
    if (!existing.includes(c)) return c;
  }
  return MAP_COLOR_PALETTE[existing.length % MAP_COLOR_PALETTE.length];
}

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
  window.dispatchEvent(new CustomEvent("map:refresh"));
}

/* ------------------------------------------------------------------ */
/* Page                                                                */
/* ------------------------------------------------------------------ */

interface OpenItemTab {
  id: string;
  name: string;
  kind: MapItemKind;
  folder: string | null;
}

const MAX_TABS = 10;

export function MapPage({ embedded = true }: { embedded?: boolean } = {}) {
  void embedded; // map is now always rendered embedded inside /media
  const navigate = useNavigate();
  const rawSearch = useSearch({ strict: false }) as {
    folder?: string;
    open?: string;
    edit?: string;
    view?: "previous";
  };
  const search = rawSearch;
  // Map is always embedded in /media now — navigate within the Library shell.
  const navMap = useCallback(
    (s: { folder?: string; open?: string; edit?: string; view?: "previous" }, replace = true) => {
      const next: Record<string, string | undefined> = { tab: "map", ...s };
      navigate({ to: "/media", search: next as never, replace } as NavigateOptions);
    },
    [navigate],
  );
  const { user, mode, activeEntityId } = useAuth();
  const isTeamMode = mode === "team" || mode === "organizer" || !!activeEntityId;

  /* ----- team scope ----- */
  const [teamId, setTeamId] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!user || !isTeamMode) {
        setTeamId(null);
        return;
      }
      let q = supabase.from("teams").select("id").limit(1);
      q = activeEntityId ? q.eq("id", activeEntityId) : q.eq("owner_id", user.id);
      const { data } = await q.maybeSingle();
      if (cancelled) return;
      setTeamId(data?.id ?? null);
    })();
    return () => {
      cancelled = true;
    };
  }, [user, isTeamMode, activeEntityId]);

  const scope = useMemo(() => {
    if (!user) return "anon";
    return isTeamMode ? `team:${teamId ?? "none"}` : `user:${user.id}`;
  }, [user, isTeamMode, teamId]);

  /* ----- persisted folders + items ----- */
  const [folders, setFolders] = useState<MapFolder[]>([]);
  const [items, setItems] = useState<MapItem[]>([]);

  const reload = useCallback(() => {
    const fs = readJSON<MapFolder[]>(foldersKey(scope), []);
    const raw = readJSON<MapItem[]>(itemsKey(scope), []);
    // Migrate legacy items: backfill folderId from folder name; ensure color set.
    let mutated = false;
    const migrated = raw.map((it) => {
      let next = it;
      if (next.folderId === undefined) {
        const matched = next.folder ? fs.find((f) => f.name === next.folder) : null;
        next = { ...next, folderId: matched?.id ?? null };
        mutated = true;
      }
      if (!next.color) {
        next = { ...next, color: MAP_COLOR_PALETTE[0] };
        mutated = true;
      }
      return next;
    });
    if (mutated) {
      try {
        localStorage.setItem(itemsKey(scope), JSON.stringify(migrated));
      } catch { /* ignore */ }
    }
    setFolders(fs);
    setItems(migrated);
  }, [scope]);

  useEffect(() => {
    reload();
    const fn = () => reload();
    window.addEventListener("map:refresh", fn);
    return () => window.removeEventListener("map:refresh", fn);
  }, [reload]);

  /* ----- open tabs (replica of /calendar) ----- */
  const [openTabs, setOpenTabs] = useState<OpenItemTab[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);

  const profileScopeKey = `${mode}:${activeEntityId ?? "self"}`;
  const storageKey = `map:openTabs:${profileScopeKey}`;
  const hydratedRef = useRef<string | null>(null);
  useEffect(() => {
    if (hydratedRef.current === profileScopeKey) return;
    hydratedRef.current = profileScopeKey;
    if (typeof window === "undefined") return;
    try {
      const raw = window.localStorage.getItem(storageKey);
      const activeRaw = window.localStorage.getItem(`${storageKey}:active`);
      if (raw) {
        const parsed = JSON.parse(raw) as OpenItemTab[];
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

  const openItem = useCallback((it: MapItem) => {
    setOpenTabs((prev) => {
      if (prev.some((t) => t.id === it.id)) return prev;
      if (prev.length >= MAX_TABS) {
        toast.error(`You can have at most ${MAX_TABS} map tabs open at once.`);
        return prev;
      }
      return [...prev, { id: it.id, name: it.name, kind: it.kind, folder: it.folder }];
    });
    setActiveId(it.id);
  }, []);
  const closeTab = (id: string) => {
    setOpenTabs((prev) => prev.filter((t) => t.id !== id));
    if (activeId === id) setActiveId(null);
  };

  // Auto-open via ?open=
  useEffect(() => {
    if (search.open) {
      const it = items.find((x) => x.id === search.open);
      if (it) openItem(it);
      navMap({});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search.open, items.length]);

  /* ----- side nav ----- */
  const showingPrevious = search.view === "previous" || (!search.folder && !activeId);
  const sideValue: MapSideNavValue = {
    category: showingPrevious ? "previous" : "map",
    folder: showingPrevious ? "" : (search.folder ?? ""),
  };
  const onSideChange = (v: MapSideNavValue) => {
    setActiveId(null);
    if (v.category === "previous") {
      navMap({ view: "previous" });
      return;
    }
    navMap({ folder: v.folder || undefined });
  };

  /* ----- tab DnD (replica of /calendar) ----- */
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
  const [newItemOpen, setNewItemOpen] = useState<MapItemKind | null>(null);

  const persistFolders = (next: MapFolder[]) => {
    writeJSON(foldersKey(scope), next);
    setFolders(next);
  };
  const persistItems = (next: MapItem[]) => {
    writeJSON(itemsKey(scope), next);
    setItems(next);
  };

  const showingItem = activeId !== null;
  const activeItem = showingItem ? items.find((c) => c.id === activeId) ?? null : null;

  /* ----- filtered Previous list ----- */
  const folderFilter = sideValue.folder;
  const previousList = useMemo<MapItem[]>(() => {
    if (folderFilter === "__unsorted__") return items.filter((c) => !c.folder);
    if (folderFilter && folderFilter !== "") {
      const folderName = folders.find((f) => f.id === folderFilter)?.name;
      return items.filter((c) => c.folder === folderName);
    }
    return items;
  }, [items, folderFilter, folders]);

  const tabStripUI = (
    <>
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
                const TabIcon = t.kind === "course" ? RouteIcon : MapPin;
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
                    <TabIcon className="h-3 w-3 shrink-0 opacity-70" />
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
    </>
  );

  const bodyUI = (
    <MapBody
      actionsMount={actionsMount}
      showingItem={showingItem}
      activeItem={activeItem}
      previousList={previousList}
      onOpenItem={openItem}
      onNewFolder={() => setNewFolderOpen(true)}
      onNewItem={(kind) => setNewItemOpen(kind)}
      activeFolder={
        sideValue.category === "map" &&
        sideValue.folder &&
        sideValue.folder !== "__unsorted__"
          ? folders.find((f) => f.id === sideValue.folder) ?? null
          : null
      }
      allItems={items}
      onItemsChange={persistItems}
      editId={search.edit ?? null}
      onSetEdit={(id) => {
        navMap({
          folder: sideValue.folder || undefined,
          edit: id ?? undefined,
        });
      }}
      onFolderRename={(folderId, newName) => {
        const trimmed = newName.trim();
        if (!trimmed) return;
        if (folders.some((f) => f.id !== folderId && f.name.toLowerCase() === trimmed.toLowerCase())) {
          toast.error("A folder with this name already exists");
          return;
        }
        const oldName = folders.find((f) => f.id === folderId)?.name ?? null;
        persistFolders(folders.map((f) => (f.id === folderId ? { ...f, name: trimmed } : f)));
        if (oldName && oldName !== trimmed) {
          persistItems(items.map((i) => (i.folder === oldName ? { ...i, folder: trimmed } : i)));
        }
      }}
      onFolderUpdateView={(folderId, view) => {
        persistFolders(folders.map((f) => (f.id === folderId ? { ...f, defaultView: view } : f)));
      }}
    />
  );

  if (embedded) {
    // Inside /media — Library shell provides outer wrapper, side nav, and
    // top tab bar. Render the tab strip inline at the top of the body so it
    // doesn't fight the Library page's own TopBarSlot tabs.
    return (
      <div className="flex h-full min-h-0 flex-col bg-white">
        <div className="flex items-end border-b border-hairline">{tabStripUI}</div>
        <div className="min-w-0 flex-1 overflow-y-auto">{bodyUI}</div>
        {renderDialogs()}
      </div>
    );
  }

  return (
    <div className="h-full overflow-hidden bg-white px-4 md:px-6">
      <TopBarSlot>{tabStripUI}</TopBarSlot>

      <div className="grid h-full gap-6 overflow-hidden pt-4 md:grid-cols-[220px_1fr]">
        <aside className="md:h-full md:overflow-y-auto md:pr-1">
          <MapSideNav
            value={sideValue}
            onChange={onSideChange}
            folders={folders}
            onFoldersChange={persistFolders}
          />
        </aside>

        <div className="min-w-0 md:h-full md:overflow-y-auto">{bodyUI}</div>
      </div>

      {renderDialogs()}
    </div>
  );

  function renderDialogs() {
    return (
      <>
        {newFolderOpen && (
          <NewFolderDialog
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
      {newItemOpen && (
        <NewMapItemDialog
          kind={newItemOpen}
          folders={folders}
          onClose={() => setNewItemOpen(null)}
          onCreateFolder={(name) => {
            const trimmed = name.trim();
            if (!trimmed) return null;
            if (folders.some((f) => f.name.toLowerCase() === trimmed.toLowerCase())) {
              toast.error("A folder with this name already exists");
              return null;
            }
            const f: MapFolder = {
              id: crypto.randomUUID(),
              name: trimmed,
              pinned: false,
              sort_order: folders.length,
            };
            persistFolders([...folders, f]);
            return f;
          }}
          onSubmit={(name, folder) => {
            // folder here is folder NAME (legacy from dialog). Resolve folderId.
            const folderObj = folder ? folders.find((f) => f.name === folder) : null;
            const folderId = folderObj?.id ?? null;
            // Pick a color avoiding collisions inside that folder.
            const used = items
              .filter((c) => c.folderId === folderId)
              .map((c) => c.color);
            const color = pickFolderColor(used);
            const it: MapItem = {
              id: crypto.randomUUID(),
              kind: newItemOpen,
              name: name.trim() || (newItemOpen === "course" ? "Untitled course" : "Untitled location"),
              pinned: false,
              folder: folder ?? null,
              folderId,
              color,
              created_at: new Date().toISOString(),
              pin: newItemOpen === "location" ? null : undefined,
              path: newItemOpen === "course" ? [] : undefined,
              splits: newItemOpen === "course" ? [] : undefined,
            };
            persistItems([...items, it]);
            setNewItemOpen(null);
            // Route into the parent folder view in edit mode.
            if (folderId) {
              navMap({ folder: folderId, edit: it.id });
            } else {
              openItem(it);
            }
          }}
        />
      )}
      </>
    );
  }
}

/* ------------------------------------------------------------------ */
/* Body                                                                */
/* ------------------------------------------------------------------ */

function MapBody({
  actionsMount,
  showingItem,
  activeItem,
  previousList,
  onOpenItem,
  onNewFolder,
  onNewItem,
  activeFolder,
  allItems,
  onItemsChange,
  editId,
  onSetEdit,
  onFolderRename,
  onFolderUpdateView,
}: {
  actionsMount: HTMLDivElement | null;
  showingItem: boolean;
  activeItem: MapItem | null;
  previousList: MapItem[];
  onOpenItem: (it: MapItem) => void;
  onNewFolder: () => void;
  onNewItem: (kind: MapItemKind) => void;
  activeFolder: MapFolder | null;
  allItems: MapItem[];
  onItemsChange: (next: MapItem[]) => void;
  editId: string | null;
  onSetEdit: (id: string | null) => void;
  onFolderRename: (folderId: string, newName: string) => void;
  onFolderUpdateView: (folderId: string, view: MapFolderView | null) => void;
}) {
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const closeSearch = () => {
    setSearchOpen(false);
    setSearchQuery("");
  };

  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!menuOpen) return;
    const onDoc = (e: MouseEvent) => {
      if (!menuRef.current) return;
      if (!menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenuOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [menuOpen]);

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
          aria-label="Search map"
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
          placeholder="Search in map"
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
      <div className="relative" ref={menuRef}>
        <button
          onClick={() => setMenuOpen((o) => !o)}
          aria-label="Create new"
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          className="flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground transition-all hover:bg-secondary hover:text-ink"
        >
          <Plus className="h-[18px] w-[18px]" strokeWidth={2.25} />
        </button>
        {menuOpen && (
          <div
            role="menu"
            className="absolute right-0 top-full z-30 mt-2 w-44 origin-top-right overflow-hidden rounded-xl border border-hairline bg-popover p-1 shadow-xl animate-in fade-in zoom-in-95 slide-in-from-top-1 duration-150"
          >
            <DropdownItem
              icon={<FolderClosed className="h-3.5 w-3.5" />}
              label="Folder"
              onClick={() => {
                setMenuOpen(false);
                onNewFolder();
              }}
            />
            <DropdownItem
              icon={<MapPin className="h-3.5 w-3.5" />}
              label="Location"
              onClick={() => {
                setMenuOpen(false);
                onNewItem("location");
              }}
            />
            <DropdownItem
              icon={<RouteIcon className="h-3.5 w-3.5" />}
              label="Course"
              onClick={() => {
                setMenuOpen(false);
                onNewItem("course");
              }}
            />
          </div>
        )}
      </div>
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
      {activeFolder ? (
        <FolderMapView
          folder={activeFolder}
          items={allItems.filter((i) => i.folderId === activeFolder.id)}
          onItemsChange={(updater) => {
            const inFolder = allItems.filter((i) => i.folderId === activeFolder.id);
            const updated = updater(inFolder);
            const others = allItems.filter((i) => i.folderId !== activeFolder.id);
            onItemsChange([...others, ...updated]);
          }}
          editId={editId}
          onSetEdit={onSetEdit}
          onFolderRename={(newName) => onFolderRename(activeFolder.id, newName)}
          onFolderUpdateView={(view) => onFolderUpdateView(activeFolder.id, view)}
        />
      ) : showingItem && activeItem ? (
        <MapItemView item={activeItem} />
      ) : (
        <PreviousList list={filtered} onOpen={onOpenItem} />
      )}
    </div>
  );
}

function DropdownItem({
  icon,
  label,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      role="menuitem"
      onClick={onClick}
      className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-ink transition hover:bg-secondary"
    >
      <span className="text-muted-foreground">{icon}</span>
      <span>{label}</span>
    </button>
  );
}

function PreviousList({ list, onOpen }: { list: MapItem[]; onOpen: (c: MapItem) => void }) {
  if (list.length === 0) {
    return (
      <div className="mt-6 rounded-lg border border-dashed border-hairline p-12 text-center text-sm text-muted-foreground">
        No items yet. Click <span className="font-medium text-ink">+</span> to create a location or course.
      </div>
    );
  }
  return (
    <div className="mt-4 flex flex-col divide-y divide-hairline rounded-lg border border-hairline">
      {list.map((c) => {
        const Icon = c.kind === "course" ? RouteIcon : MapPin;
        return (
          <button
            key={c.id}
            onClick={() => onOpen(c)}
            className="flex items-center gap-3 px-4 py-3 text-left transition hover:bg-secondary/40"
          >
            <Icon className="h-4 w-4 text-muted-foreground" strokeWidth={2.25} />
            <span className="flex-1 text-sm text-ink">
              {c.folder ? `${c.folder} · ${c.name}` : c.name}
            </span>
            <span className="rounded-full bg-secondary px-2 py-0.5 text-[10px] font-medium text-muted-foreground capitalize">
              {c.kind}
            </span>
          </button>
        );
      })}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Dialogs                                                             */
/* ------------------------------------------------------------------ */

function NewFolderDialog({
  onClose,
  onSubmit,
}: {
  onClose: () => void;
  onSubmit: (name: string) => void;
}) {
  const [val, setVal] = useState("");
  return (
    <Modal onClose={onClose} title="New folder">
      <input
        autoFocus
        value={val}
        onChange={(e) => setVal(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") onSubmit(val);
          if (e.key === "Escape") onClose();
        }}
        placeholder="Folder name"
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

function NewMapItemDialog({
  kind,
  folders,
  onClose,
  onSubmit,
  onCreateFolder,
}: {
  kind: MapItemKind;
  folders: MapFolder[];
  onClose: () => void;
  onSubmit: (name: string, folder: string | null) => void;
  onCreateFolder: (name: string) => MapFolder | null;
}) {
  const [name, setName] = useState("");
  const [folder, setFolder] = useState<string>("");
  const [creatingFolder, setCreatingFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const title = kind === "course" ? "New course" : "New location";
  const placeholder = kind === "course" ? "Course name" : "Location name";
  return (
    <Modal onClose={onClose} title={title}>
      <div className="flex flex-col gap-3">
        <div>
          <label className="mb-1 block text-xs text-muted-foreground">Name</label>
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={placeholder}
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
          Save
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

import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import {
  Search,
  Library,
  Tent,
  Settings,
  LogIn,
  Users,
  UsersRound,
  Armchair,
  CalendarDays,
  Map as MapIcon,
  MapPin,
  Route as RouteIcon,
  BookOpen,
  Briefcase,
  StickyNote,
  FolderClosed,
  Image as ImageIcon,
  Plus,
  ChevronRight,
} from "lucide-react";
import { useAuth } from "@/lib/auth";
import { useIsGroupLeader } from "@/hooks/useIsGroupLeader";
import { ProfileTab } from "@/components/ProfileTab";

type NavKey =
  | "library"
  | "calendar"
  | "diary"
  | "search"
  | "map"
  | "events"
  | "members"
  | "group-meetings"
  | "group-members"
  | "desk"
  | "settings"
  | "auth";

interface NavItem {
  key: NavKey;
  to: string;
  label: string;
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
}

function useNavItems(): NavItem[] {
  const { user, mode } = useAuth();
  const isGroupLeader = useIsGroupLeader();
  const isOrganizer = (mode === "organizer" || mode === "team") && !!user;
  const isIndividual = !isOrganizer;

  const items: NavItem[] = [];
  if (!user) {
    items.push({ key: "auth", to: "/auth", label: "Sign in", icon: LogIn });
    return items;
  }
  if (mode === "team") {
    items.push({ key: "members", to: "/team/members", label: "Members", icon: Users });
  }
  if (isOrganizer && isGroupLeader) {
    items.push({ key: "group-meetings", to: "/team/group-meetings", label: "Group meetings", icon: Briefcase });
    items.push({ key: "group-members", to: "/team/group-members", label: "Group members", icon: UsersRound });
  }
  items.push({ key: "library", to: "/media", label: "Library", icon: Library });
  items.push({ key: "calendar", to: "/calendar", label: "Calendar", icon: CalendarDays });
  if (isIndividual) {
    items.push({ key: "diary", to: "/diary", label: "Diary", icon: BookOpen });
    items.push({ key: "search", to: "/", label: "Search", icon: Search });
  }
  if (isOrganizer) {
    items.push({ key: "map", to: "/map", label: "Map", icon: MapIcon });
    items.push({ key: "events", to: "/organizer/library", label: "My events", icon: Tent });
  }
  items.push({ key: "settings", to: "/settings", label: "Settings", icon: Settings });
  return items;
}

function useOrderKey() {
  const { user, mode, activeEntityId } = useAuth();
  return `nav-icon-tabs:order:${mode}:${activeEntityId ?? user?.id ?? "anon"}`;
}

function useOrderedItems(items: NavItem[]): [NavItem[], (next: NavItem[]) => void] {
  const orderKey = useOrderKey();
  const [order, setOrder] = useState<string[]>([]);
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = window.localStorage.getItem(orderKey);
      if (raw) setOrder(JSON.parse(raw) as string[]);
      else setOrder([]);
    } catch {
      setOrder([]);
    }
  }, [orderKey]);

  const ordered = (() => {
    const map = new Map(items.map((i) => [i.key, i]));
    const seen = new Set<string>();
    const out: NavItem[] = [];
    for (const k of order) {
      const it = map.get(k as NavKey);
      if (it) {
        out.push(it);
        seen.add(k);
      }
    }
    for (const it of items) if (!seen.has(it.key)) out.push(it);
    return out;
  })();

  const persist = (next: NavItem[]) => {
    setOrder(next.map((i) => i.key));
    try {
      window.localStorage.setItem(orderKey, JSON.stringify(next.map((i) => i.key)));
    } catch {
      /* ignore */
    }
  };
  return [ordered, persist];
}

export function NavIconTabs({
  activeKey,
  onActiveClick,
}: {
  activeKey: NavKey;
  onActiveClick?: () => void;
}) {
  const items = useNavItems();
  const [ordered, persist] = useOrderedItems(items);
  const visible = ordered;

  const stripRef = useRef<HTMLDivElement | null>(null);
  const btnRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const [dragKey, setDragKey] = useState<string | null>(null);
  const [dragDx, setDragDx] = useState(0);
  const stateRef = useRef<{
    key: string;
    startX: number;
    startIndex: number;
    currentIndex: number;
    width: number;
    offsets: number[];
    moved: boolean;
  } | null>(null);

  const onPointerDown = (e: React.PointerEvent, key: string) => {
    if (e.button !== 0) return;
    const strip = stripRef.current;
    if (!strip) return;
    const startIndex = visible.findIndex((i) => i.key === key);
    if (startIndex < 0) return;
    const buttons = visible
      .map((i) => btnRefs.current.get(i.key))
      .filter((b): b is HTMLDivElement => !!b);
    if (buttons.length !== visible.length) return;
    const stripRect = strip.getBoundingClientRect();
    const offsets = buttons.map((b) => b.getBoundingClientRect().left - stripRect.left);
    const width = buttons[startIndex].getBoundingClientRect().width;

    stateRef.current = {
      key,
      startX: e.clientX,
      startIndex,
      currentIndex: startIndex,
      width,
      offsets,
      moved: false,
    };

    const onMove = (ev: PointerEvent) => {
      const st = stateRef.current;
      if (!st) return;
      const dx = ev.clientX - st.startX;
      if (!st.moved && Math.abs(dx) < 4) return;
      st.moved = true;
      if (dragKey !== st.key) setDragKey(st.key);
      setDragDx(dx);
      const stripEl = stripRef.current;
      if (!stripEl) return;
      const pointerXInStrip = ev.clientX - stripEl.getBoundingClientRect().left;
      let newIdx = 0;
      for (let i = 0; i < st.offsets.length; i++) {
        const mid = st.offsets[i] + st.width / 2;
        if (pointerXInStrip < mid) {
          newIdx = i;
          break;
        }
        newIdx = i;
      }
      if (newIdx !== st.currentIndex) st.currentIndex = newIdx;
    };

    const onUp = (ev: PointerEvent) => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
      const st = stateRef.current;
      stateRef.current = null;
      if (st && st.moved && st.currentIndex !== st.startIndex) {
        const next = visible.slice();
        const [moved] = next.splice(st.startIndex, 1);
        next.splice(st.currentIndex, 0, moved);
        persist(next);
      } else if (st && !st.moved) {
        const target = ev.target as HTMLElement;
        const link = target.closest("a");
        if (link instanceof HTMLAnchorElement) link.click();
      }
      setDragKey(null);
      setDragDx(0);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
  };

  if (visible.length === 0) return null;

  return (
    <div ref={stripRef} className="-mb-px flex shrink-0 items-end gap-0.5 pr-2">
      {visible.map((item, idx) => {
        const Icon = item.icon;
        const isDragging = dragKey === item.key;
        let translateX = 0;
        if (dragKey && !isDragging) {
          const st = stateRef.current;
          if (st) {
            const from = st.startIndex;
            const to = st.currentIndex;
            if (to > from && idx > from && idx <= to) translateX = -st.width;
            else if (to < from && idx >= to && idx < from) translateX = st.width;
          }
        }
        const style: React.CSSProperties = isDragging
          ? { transform: `translate3d(${dragDx}px,0,0)`, transition: "none", zIndex: 5 }
          : {
              transform: `translate3d(${translateX}px,0,0)`,
              transition: dragKey
                ? "transform 180ms cubic-bezier(0.2, 0.8, 0.2, 1)"
                : undefined,
            };
        const isActive = item.key === activeKey;
        return (
          <div
            key={item.key}
            ref={(el) => {
              if (el) btnRefs.current.set(item.key, el);
              else btnRefs.current.delete(item.key);
            }}
            style={style}
            className="relative"
          >
            <Link
              to={item.to}
              aria-label={item.label}
              title={item.label}
              onPointerDown={(e) => onPointerDown(e, item.key)}
              onClick={(e) => {
                if (stateRef.current?.moved) {
                  e.preventDefault();
                  return;
                }
                if (isActive && onActiveClick) {
                  e.preventDefault();
                  onActiveClick();
                }
              }}
              className={`-mb-px flex h-9 w-9 select-none items-center justify-center rounded-md border-b-2 transition hover:bg-secondary/60 ${
                isActive
                  ? "border-primary text-ink"
                  : "border-transparent text-muted-foreground hover:text-ink"
              }`}
            >
              <Icon className="h-[18px] w-[18px]" strokeWidth={2.25} />
            </Link>
          </div>
        );
      })}
    </div>
  );
}

/**
 * Right-side pinned actions for the universal top tab bar:
 * a Search shortcut (jumps to "/") and a Plus menu with
 * Meeting (entity only) / Note / File / Media / Map → Location|Course / Event.
 */
function PlusMenu() {
  const navigate = useNavigate();
  const { user, mode } = useAuth();
  const isOrganizer = (mode === "organizer" || mode === "team") && !!user;
  const [open, setOpen] = useState(false);
  const [mapOpen, setMapOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) {
        setOpen(false);
        setMapOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        setMapOpen(false);
      }
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const close = () => {
    setOpen(false);
    setMapOpen(false);
  };

  const go = (path: string, kind: string) => {
    close();
    navigate({ to: path, search: { new: kind } as never });
  };

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        aria-label="Create new"
        aria-haspopup="menu"
        aria-expanded={open}
        className="flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground transition-all hover:bg-secondary hover:text-ink"
      >
        <Plus className="h-[18px] w-[18px]" strokeWidth={2.25} />
      </button>
      {open && (
        <div
          role="menu"
          className="absolute right-0 top-full z-50 mt-1 w-52 origin-top-right overflow-visible rounded-xl border border-hairline bg-popover p-1 shadow-xl animate-in fade-in zoom-in-95 slide-in-from-top-1 duration-150"
          onMouseLeave={() => setMapOpen(false)}
        >
          {isOrganizer && (
            <PlusItem
              icon={<Briefcase className="h-3.5 w-3.5" />}
              label="Meeting"
              onClick={() => go("/media", "meeting")}
            />
          )}
          <PlusItem
            icon={<StickyNote className="h-3.5 w-3.5" />}
            label="Note"
            onClick={() => go("/media", "note")}
          />
          <PlusItem
            icon={<FolderClosed className="h-3.5 w-3.5" />}
            label="File"
            onClick={() => go("/media", "files")}
          />
          <PlusItem
            icon={<ImageIcon className="h-3.5 w-3.5" />}
            label="Media"
            onClick={() => go("/media", "media")}
          />
          <div
            className="relative"
            onMouseEnter={() => setMapOpen(true)}
          >
            <PlusItem
              icon={<MapIcon className="h-3.5 w-3.5" />}
              label="Map"
              hasSubmenu
              onClick={() => setMapOpen((v) => !v)}
            />
            {mapOpen && (
              <div
                role="menu"
                className="absolute right-full top-0 z-50 mr-1 w-44 overflow-hidden rounded-xl border border-hairline bg-popover p-1 shadow-xl animate-in fade-in zoom-in-95 slide-in-from-right-1 duration-150"
              >
                <PlusItem
                  icon={<MapPin className="h-3.5 w-3.5" />}
                  label="Location"
                  onClick={() => go("/map", "location")}
                />
                <PlusItem
                  icon={<RouteIcon className="h-3.5 w-3.5" />}
                  label="Course"
                  onClick={() => go("/map", "course")}
                />
              </div>
            )}
          </div>
          <PlusItem
            icon={<Tent className="h-3.5 w-3.5" />}
            label="Event"
            onClick={() => go(isOrganizer ? "/organizer/library" : "/", "event")}
          />
        </div>
      )}
    </div>
  );
}

function PlusItem({
  icon,
  label,
  onClick,
  hasSubmenu,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  hasSubmenu?: boolean;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-ink transition hover:bg-secondary"
    >
      <span className="text-muted-foreground">{icon}</span>
      <span className="flex-1">{label}</span>
      {hasSubmenu && <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />}
    </button>
  );
}

/**
 * Fixed, universal top tab bar. Sits directly under the colored TopBar (h-14)
 * and is present on every page. Contains the ProfileTab on the left, the
 * draggable nav-icon strip, and the pinned Search + Plus actions on the right.
 */
export function UniversalNavBar() {
  const { user } = useAuth();
  const activeKey = useActiveNavKey();
  if (!user) return null;
  return (
    <div className="fixed left-0 right-0 top-14 z-40 flex h-[42px] items-end gap-1 border-b border-hairline bg-background pl-4 pr-4 md:pl-6 md:pr-6">
      <ProfileTab />
      <NavIconTabs activeKey={activeKey} />
      <div className="flex-1" />
      <Link
        to="/"
        aria-label="Search"
        title="Search"
        className="-mb-px flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground transition hover:bg-secondary hover:text-ink"
      >
        <Search className="h-[18px] w-[18px]" strokeWidth={2.25} />
      </Link>
      <div className="-mb-px">
        <PlusMenu />
      </div>
    </div>
  );
}

/** @deprecated Kept as a no-op shim for pages still importing it. */
export function UniversalTopBar(_props: {
  activeKey?: NavKey;
  title?: string;
  icon?: React.ComponentType<{ className?: string; strokeWidth?: number }>;
  rightSlot?: React.ReactNode;
}) {
  return null;
}

export function useActiveNavKey(): NavKey {
  const router = useRouterState();
  const path = router.location.pathname;
  if (path.startsWith("/team/group-meetings")) return "group-meetings";
  if (path.startsWith("/team/group-members")) return "group-members";
  if (path.startsWith("/team/members")) return "members";
  if (path.startsWith("/media")) return "library";
  if (path.startsWith("/calendar")) return "calendar";
  if (path.startsWith("/diary")) return "diary";
  if (path.startsWith("/map")) return "map";
  if (path.startsWith("/organizer")) return "events";
  if (path.startsWith("/desk")) return "desk";
  if (path.startsWith("/settings")) return "settings";
  if (path.startsWith("/auth")) return "auth";
  return "search";
}

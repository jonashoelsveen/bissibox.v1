import { useEffect, useRef, useState } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import {
  Library,
  LogIn,
  Plus,
  CalendarDays,
  BookOpen,
} from "lucide-react";
import { useAuth } from "@/lib/auth";
import { useIsGroupLeader } from "@/hooks/useIsGroupLeader";

import { GroupMemberHoverMenu } from "@/components/team/GroupMemberHoverMenu";

type NavKey =
  | "library"
  | "calendar"
  | "diary"
  | "map"
  | "group-members"
  | "desk"
  | "settings"
  | "auth";

interface NavItem {
  key: NavKey;
  to: string;
  label: string;
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
  search?: Record<string, string>;
}

/** Keys that render as a fixed, non-draggable "active-tab" style icon
 *  rather than the standard hover-tile nav icon. */
const FIXED_TAB_KEYS = new Set<NavKey>(["calendar", "diary"]);

function useNavItems(): NavItem[] {
  const { user, mode } = useAuth();
  useIsGroupLeader();
  const isOrganizer = (mode === "organizer" || mode === "team") && !!user;
  const isIndividual = !isOrganizer;

  const items: NavItem[] = [];
  if (!user) {
    items.push({ key: "auth", to: "/auth", label: "Sign in", icon: LogIn });
    return items;
  }
  items.push({ key: "library", to: "/media", label: "Library", icon: Library });
  items.push({ key: "calendar", to: "/calendar", label: "Calendar", icon: CalendarDays });
  if (isIndividual) {
    items.push({ key: "diary", to: "/diary", label: "Diary", icon: BookOpen });
  }
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

/** Renders the calendar/diary nav icon as an active tab — replicating the
 *  curved white pill used by the page-tab strip so the visual reads as the
 *  same family. */
function ActiveTabIcon({
  to,
  label,
  Icon,
  navKey,
  onClick,
}: {
  to: string;
  label: string;
  Icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
  navKey: NavKey;
  onClick?: (e: React.MouseEvent) => void;
}) {
  return (
    <div
      data-tab
      data-active-tab=""
      style={{
        position: "relative",
        height: 38,
        width: 52,
        marginBottom: -1,
        paddingBottom: 1,
      }}
    >
      <span
        aria-hidden
        style={{
          position: "absolute",
          top: 0,
          left: 12,
          right: 12,
          bottom: -1,
          background: "#FFFFFF",
          pointerEvents: "none",
          zIndex: 0,
        }}
      />
      <svg
        aria-hidden
        width="28"
        height="39"
        viewBox="0 0 32 39"
        style={{ position: "absolute", top: 0, left: -16, pointerEvents: "none", zIndex: 0, overflow: "visible", display: "block" }}
      >
        <path d="M 0 39 L 0 38 A 16 16 0 0 0 16 22 L 16 8 A 8 8 0 0 1 24 0 L 32 0 L 32 39 Z" fill="#FFFFFF" shapeRendering="geometricPrecision" />
      </svg>
      <svg
        aria-hidden
        width="28"
        height="39"
        viewBox="0 0 32 39"
        style={{ position: "absolute", top: 0, right: -16, pointerEvents: "none", zIndex: 0, overflow: "visible", display: "block" }}
      >
        <path d="M 32 39 L 32 38 A 16 16 0 0 1 16 22 L 16 8 A 8 8 0 0 0 8 0 L 0 0 L 0 39 Z" fill="#FFFFFF" shapeRendering="geometricPrecision" />
      </svg>
      <Link
        to={to}
        aria-label={label}
        title={label}
        data-nav-key={navKey}
        onClick={onClick}
        className="relative z-[1] flex h-full w-full items-center justify-center text-ink"
      >
        <Icon className="h-[18px] w-[18px]" strokeWidth={2.25} />
      </Link>
    </div>
  );
}

export function NavIconTabs({
  activeKey,
  onActiveClick,
  stripped = false,
}: {
  activeKey: NavKey;
  onActiveClick?: () => void;
  /** When true, only the group-members icon is shown (Calendar / Diary /
   *  Library are hidden — they live in the apps menu on these surfaces). */
  stripped?: boolean;
}) {
  const allItems = useNavItems();
  const items = stripped ? allItems.filter((i) => i.key === "group-members") : allItems;
  const [ordered, persist] = useOrderedItems(items);
  // Calendar/diary are pinned, non-draggable "fixed tabs" rendered to the
  // right of the draggable strip. Everything else stays in the drag pool.
  const draggable = ordered.filter((i) => !FIXED_TAB_KEYS.has(i.key));
  const fixed = items.filter((i) => FIXED_TAB_KEYS.has(i.key));

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
    const startIndex = draggable.findIndex((i) => i.key === key);
    if (startIndex < 0) return;
    const buttons = draggable
      .map((i) => btnRefs.current.get(i.key))
      .filter((b): b is HTMLDivElement => !!b);
    if (buttons.length !== draggable.length) return;
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
        const next = draggable.slice();
        const [moved] = next.splice(st.startIndex, 1);
        next.splice(st.currentIndex, 0, moved);
        // Persist drag order — fixed items keep their natural position.
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

  if (draggable.length === 0 && fixed.length === 0) return null;

  return (
    <div ref={stripRef} className="-mb-px flex shrink-0 items-end gap-0.5 pr-2">
      {draggable.map((item, idx) => {
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
        const linkEl = (
          <Link
            to={item.to}
            search={item.search as never}
            aria-label={item.label}
            title={item.label}
            data-nav-icon=""
            data-nav-key={item.key}
            onPointerDown={(e) => onPointerDown(e, item.key)}
            onClick={(e) => {
              if (stateRef.current?.moved) {
                e.preventDefault();
                return;
              }
              if (item.key === "group-members" && typeof window !== "undefined") {
                window.dispatchEvent(new CustomEvent("group-members:show-list"));
              }
              if (isActive && onActiveClick) {
                e.preventDefault();
                onActiveClick();
              }
            }}
            className={`flex h-9 w-9 select-none items-center justify-center rounded-md ${
              item.key === "group-members"
                ? "text-muted-foreground/70 hover:text-muted-foreground"
                : isActive ? "text-ink" : "text-muted-foreground hover:text-ink"
            }`}
          >
            <Icon className="h-[18px] w-[18px]" strokeWidth={2.25} />
          </Link>
        );
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
            {item.key === "group-members" ? (
              <GroupMemberHoverMenu>{linkEl}</GroupMemberHoverMenu>
            ) : (
              linkEl
            )}
          </div>
        );
      })}
      {fixed.map((item) => {
        const Icon = item.icon;
        const isActive = item.key === activeKey;
        if (isActive) {
          return (
            <ActiveTabIcon
              key={item.key}
              to={item.to}
              label={item.label}
              Icon={Icon}
              navKey={item.key}
              onClick={(e) => {
                if (onActiveClick) {
                  e.preventDefault();
                  onActiveClick();
                }
              }}
            />
          );
        }
        return (
          <div key={item.key} className="relative">
            <Link
              to={item.to}
              aria-label={item.label}
              title={item.label}
              data-nav-icon=""
              data-nav-key={item.key}
              className="flex h-9 w-9 select-none items-center justify-center text-muted-foreground hover:text-ink"
            >
              <Icon className="h-[18px] w-[18px]" strokeWidth={2.25} />
            </Link>
          </div>
        );
      })}
    </div>
  );
}

export function UniversalTopBar({
  activeKey,
  rightSlot,
}: {
  activeKey: NavKey;
  /** kept for backwards-compat; unused now that the page title is no longer rendered */
  title?: string;
  icon?: React.ComponentType<{ className?: string; strokeWidth?: number }>;
  rightSlot?: React.ReactNode;
}) {
  return (
    <div className="sticky top-14 z-20 -mx-4 flex items-end gap-1 border-b border-hairline bg-background pl-4 pr-4 md:-mx-6 md:pl-6 md:pr-6">
      
      <NavIconTabs activeKey={activeKey} />
      <div className="flex-1" />
      {rightSlot}
    </div>
  );
}

export function useActiveNavKey(): NavKey {
  const router = useRouterState();
  const path = router.location.pathname;
  if (path.startsWith("/clients")) return "group-members";
  if (path.startsWith("/media")) return "library";
  if (path.startsWith("/calendar")) return "calendar";
  if (path.startsWith("/diary")) return "diary";
  if (path.startsWith("/desk")) return "desk";
  if (path.startsWith("/settings")) return "settings";
  if (path.startsWith("/auth")) return "auth";
  return "library";
}

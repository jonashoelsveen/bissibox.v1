import { useEffect, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import {
  Search,
  Plus,
  Briefcase,
  StickyNote,
  FolderClosed,
  Image as ImageIcon,
  Map as MapIcon,
  Tent,
  ChevronRight,
  MapPin,
  Route as RouteIcon,
} from "lucide-react";
import { useAuth } from "@/lib/auth";
import { ProfileTab } from "@/components/ProfileTab";
import { NavIconTabs, useActiveNavKey } from "@/components/NavIconTabs";
import { TopBarSlotMount } from "@/components/TopBarSlot";

type CreateKind =
  | "meeting"
  | "note"
  | "file"
  | "media"
  | "map-location"
  | "map-course"
  | "event";

/**
 * Universal top tab bar fixed under the colored TopBar. Shown on every page.
 * Hosts: ProfileTab + section icons + page-provided open tabs (slot) +
 * Search + Plus menu.
 */
export function GlobalTopTabBar() {
  const { user, mode } = useAuth();
  const activeKey = useActiveNavKey();


  const isEntity = mode === "team" || mode === "organizer";

  const [plusOpen, setPlusOpen] = useState(false);
  const [mapHover, setMapHover] = useState(false);
  const plusRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!plusOpen) return;
    const onDoc = (e: MouseEvent) => {
      if (!plusRef.current) return;
      if (!plusRef.current.contains(e.target as Node)) {
        setPlusOpen(false);
        setMapHover(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setPlusOpen(false);
        setMapHover(false);
      }
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [plusOpen]);

  if (!user) return null;

  const close = () => {
    setPlusOpen(false);
    setMapHover(false);
  };

  const trigger = (kind: CreateKind) => {
    close();
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("global-create", { detail: { kind } }));
    }
  };

  return (
    <div className="fixed left-0 right-0 top-[11px] z-40 border-b border-hairline bg-background">
      <div className="flex items-end gap-1 px-4 md:px-6">
        <ProfileTab />
        <NavIconTabs activeKey={activeKey} />
        {/* Page-provided slot — open notes/event tabs etc. */}
        <TopBarSlotMount className="flex min-w-0 flex-1 items-end pl-2" />
        {/* Search */}
        <Link
          to="/"
          aria-label="Search"
          title="Search"
          className="mb-1 flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground transition hover:bg-secondary hover:text-ink"
        >
          <Search className="h-[18px] w-[18px]" strokeWidth={2.25} />
        </Link>
        {/* Plus */}
        <div className="relative mb-1" ref={plusRef}>
          <button
            onClick={() => setPlusOpen((v) => !v)}
            aria-label="Create new"
            aria-haspopup="menu"
            aria-expanded={plusOpen}
            className="flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground transition hover:bg-secondary hover:text-ink"
          >
            <Plus className="h-[18px] w-[18px]" strokeWidth={2.25} />
          </button>
          {plusOpen && (
            <div
              role="menu"
              className="absolute right-0 top-full z-50 mt-2 w-52 origin-top-right overflow-visible rounded-xl border border-hairline bg-popover p-1 shadow-xl animate-in fade-in zoom-in-95 slide-in-from-top-1 duration-150"
            >
              {isEntity && (
                <Item
                  icon={<Briefcase className="h-3.5 w-3.5" />}
                  label="Meeting"
                  onClick={() => trigger("meeting")}
                />
              )}
              <Item
                icon={<StickyNote className="h-3.5 w-3.5" />}
                label="Note"
                onClick={() => trigger("note")}
              />
              <Item
                icon={<FolderClosed className="h-3.5 w-3.5" />}
                label="File"
                onClick={() => trigger("file")}
              />
              <Item
                icon={<ImageIcon className="h-3.5 w-3.5" />}
                label="Media"
                onClick={() => trigger("media")}
              />
              {/* Map with submenu */}
              <div
                className="relative"
                onMouseEnter={() => setMapHover(true)}
                onMouseLeave={() => setMapHover(false)}
              >
                <button
                  type="button"
                  role="menuitem"
                  className="group flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-ink transition hover:bg-secondary"
                >
                  <span className="text-muted-foreground">
                    <MapIcon className="h-3.5 w-3.5" />
                  </span>
                  <span className="flex-1">Map</span>
                  <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
                </button>
                {mapHover && (
                  <>
                    <div className="absolute right-full top-0 h-full w-2" />
                    <div
                      role="menu"
                      className="absolute right-full top-0 z-50 w-44 overflow-hidden rounded-xl border border-hairline bg-popover p-1 shadow-xl animate-in fade-in zoom-in-95 slide-in-from-right-1 duration-150"
                      style={{ marginRight: 8 }}
                    >
                      <Item
                        icon={<MapPin className="h-3.5 w-3.5" />}
                        label="Location"
                        onClick={() => trigger("map-location")}
                      />
                      <Item
                        icon={<RouteIcon className="h-3.5 w-3.5" />}
                        label="Course"
                        onClick={() => trigger("map-course")}
                      />
                    </div>
                  </>
                )}
              </div>
              {isEntity && (
                <Item
                  icon={<Tent className="h-3.5 w-3.5" />}
                  label="Event"
                  onClick={() => trigger("event")}
                />
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Item({
  icon,
  label,
  hint,
  onClick,
  onHintClick,
}: {
  icon: React.ReactNode;
  label: string;
  hint?: string;
  onClick: () => void;
  onHintClick?: () => void;
}) {
  return (
    <div
      role="menuitem"
      className="group flex w-full items-center gap-2 rounded-lg pl-3 pr-1 text-left text-sm text-ink transition hover:bg-secondary"
    >
      <button
        type="button"
        onClick={onClick}
        className="flex flex-1 items-center gap-2 py-2 text-left"
      >
        <span className="text-muted-foreground">{icon}</span>
        <span className="flex-1">{label}</span>
      </button>
      {hint &&
        (onHintClick ? (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onHintClick();
            }}
            aria-label={`New ${hint.toLowerCase()}`}
            className="rounded-md px-2 py-1 text-sm text-muted-foreground/60 opacity-0 transition group-hover:opacity-100 hover:bg-secondary-foreground/5 hover:text-ink"
          >
            {hint}
          </button>
        ) : (
          <span className="px-2 py-1 text-sm text-muted-foreground/60 opacity-0 transition-opacity duration-150 group-hover:opacity-100">
            {hint}
          </span>
        ))}
    </div>
  );
}

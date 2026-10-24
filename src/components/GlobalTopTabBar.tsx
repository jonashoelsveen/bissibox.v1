import { useEffect, useRef, useState, type RefObject } from "react";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import { CalendarDays } from "lucide-react";
import { OrganizationIcon } from "@/components/OrganizationIcon";
import { ProfileSwitcherMenu } from "@/components/ProfileSwitcherMenu";
import { useAuth } from "@/lib/auth";
import { useUserGroups, type UserGroup } from "@/hooks/useUserGroups";
import { useProfileDisplayName } from "@/hooks/useProfileDisplayName";
import { TopBarSlotMount } from "@/components/TopBarSlot";
import { TopBarBrandTitle } from "@/components/HomeIcon";
import { clearCloudHomeScroll, requestCloudSignIn, scrollCloudPageToTop } from "@/components/CloudLandingSection";
import { isCloudLandingChromePath, minimalTopTabBarShellStyle, MINIMAL_TOP_TAB_BAR_HEIGHT, ACTIVE_STATUS_COLOR, landingPrimaryButtonCompactStyle, CLOUD_PAGE_BG } from "@/lib/cloud-landing-design";
import { useAuthTransition, useSignInModalOpen, setAuthTransitionPhase } from "@/lib/auth-transition";
import {
  clearAccountSurfacePreference,
} from "@/lib/app-surface";
import { isEntityFeatureEnabled } from "@/lib/features";
import { useCalendarTheme } from "@/components/calendar/calendarThemePref";

/**
 * Universal top tab bar fixed under the colored TopBar. Shown on every page.
 * Logged-out landing: Log in on the right. Platform (calendar, etc.): never
 * show Log in — that chrome is only for the logged-out home. Logged-in: Apps
 * launcher only when entityAppsLauncher is on and the user owns an entity.
 */
export function GlobalTopTabBar() {
  const { user, authReady, activeEntityId, setActiveEntity } = useAuth();
  const { groups } = useUserGroups();

  const navigate = useNavigate();
  const path = useRouterState({ select: (s) => s.location.pathname });
  const transition = useAuthTransition();
  const signInOpen = useSignInModalOpen();
  const [appsOpen, setAppsOpen] = useState(false);
  const appsRef = useRef<HTMLDivElement | null>(null);

  /** Apps launcher — Bucket A: hidden until entityAppsLauncher and the user owns an entity. */
  const showAppsMenu =
    !!user &&
    isEntityFeatureEnabled("entityAppsLauncher") &&
    groups.length > 0;

  useEffect(() => {
    if (!appsOpen) return;
    const onDoc = (e: MouseEvent) => {
      if (!appsRef.current) return;
      if (!appsRef.current.contains(e.target as Node)) setAppsOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setAppsOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [appsOpen]);

  const calendarTheme = useCalendarTheme();
  const isCloudLandingChrome = isCloudLandingChromePath(path);
  const calendarCanvas =
    path === "/calendar" ||
    path.startsWith("/calendar/") ||
    path === "/projects" ||
    path.startsWith("/projects/");
  const recede = isCloudLandingChrome && signInOpen && transition !== "fading-out" && transition !== "hidden";

  // While the modal dim covers the page, drop the bar's own plate so its
  // 48px edge is not a separate layer under the same fade.
  useEffect(() => {
    if (!isCloudLandingChrome || !recede) return;
    const html = document.documentElement;
    const body = document.body;
    const prevHtml = html.style.backgroundColor;
    const prevBody = body.style.backgroundColor;
    html.style.backgroundColor = CLOUD_PAGE_BG;
    body.style.backgroundColor = CLOUD_PAGE_BG;
    return () => {
      html.style.backgroundColor = prevHtml;
      body.style.backgroundColor = prevBody;
    };
  }, [isCloudLandingChrome, recede]);


  // Safety net: the sign-in exit choreography mutates module-level state
  // through a chain of setTimeouts. If the tab is backgrounded for a long
  // time, browsers throttle/coalesce timers and the chain can leave the
  // phase stuck on "hidden" or "reveal-dark" after the modal has already
  // unmounted. That used to cause the entire top tab-bar to vanish on the
  // destination page (Calendar, Diary, Photos, Clients, …) after logging
  // back in. Whenever we're no longer on the landing page, force the
  // phase back to idle so the dark bar always renders.
  useEffect(() => {
    if (!isCloudLandingChrome && transition !== "idle") {
      setAuthTransitionPhase("idle");
    }
  }, [isCloudLandingChrome, transition]);

  const handleAppPick = (key: "calendar" | "entity") => {
    setAppsOpen(false);
    if (key === "entity") {
      if (!activeEntityId && groups[0]) setActiveEntity(groups[0].id);
      void navigate({ to: "/entity", resetScroll: false });
      return;
    }
    void navigate({ to: "/calendar", resetScroll: false });
  };

  // White minimal bar on cloud home (logged in or out), read-more pages, etc.
  // During the gap between the modal vanishing and the dark bar revealing,
  // render nothing — but only on the landing page where the choreography
  // is actually playing.
  if (isCloudLandingChrome && transition === "hidden") return null;

  if (isCloudLandingChrome) {
    const fading = isCloudLandingChrome && transition === "fading-out";
    const hideCloudBrand = path === "/" && !!user;
    return (
      <div
        className="fixed left-0 right-0 top-0 z-[90] flex items-center justify-between"
        style={{
          ...minimalTopTabBarShellStyle,
          backgroundColor: recede ? "transparent" : minimalTopTabBarShellStyle.backgroundColor,
          // Stay fully painted under the modal dim so the bar fades with the
          // page, not as a separate rectangle. `recede` only blocks clicks.
          opacity: fading ? 0 : authReady ? 1 : 0.5,
          pointerEvents: fading || recede || !authReady ? "none" : "auto",
          transition: fading
            ? "opacity 700ms ease-out"
            : "opacity 220ms ease-out",
        }}
      >
        {hideCloudBrand ? (
          <span aria-hidden className="h-9 w-9" />
        ) : (
          <TopBarBrandTitle
            ariaLabel="Bissibox home"
            onClick={() => {
              clearAccountSurfacePreference();
              clearCloudHomeScroll();
              scrollCloudPageToTop();
              void navigate({ to: "/", resetScroll: true }).then(() => {
                scrollCloudPageToTop();
                requestAnimationFrame(() => scrollCloudPageToTop());
                window.setTimeout(scrollCloudPageToTop, 50);
              });
            }}
          />
        )}
        {user ? (
          showAppsMenu ? (
            <AppsLauncher
              open={appsOpen}
              onToggle={() => setAppsOpen((v) => !v)}
              menuRef={appsRef}
              onPick={handleAppPick}
              buttonClassName="flex h-9 w-9 items-center justify-center rounded-md text-[#1d1d1f] transition hover:bg-black/5"
            />
          ) : null
        ) : authReady ? (
          <button
            type="button"
            onClick={() => {
              requestCloudSignIn();
            }}
            className="bissibox-desktop-only text-white transition active:scale-[0.98]"
            style={landingPrimaryButtonCompactStyle}
          >
            Log in
          </button>
        ) : null}
      </div>
    );
  }

  // Only honor the reveal-dark phase on the landing page where the
  // choreography actually plays. On every other route, render the bar
  // normally regardless of any stale module-level phase.
  const revealing = path === "/" && transition === "reveal-dark";
  return (
    <div
      className="global-topbar-dark fixed right-0 top-0 z-[90]"
      style={{
        left: "var(--topbar-left-offset, 0px)",
        backgroundColor:
          calendarTheme === "dark" && calendarCanvas ? "#0c0c0c" : "#ffffff",
        height: MINIMAL_TOP_TAB_BAR_HEIGHT,
        opacity: revealing ? 0 : authReady ? 1 : 0.5,
        pointerEvents: revealing || !authReady ? "none" : "auto",
        transition: "opacity 350ms ease-out",
      }}

    >
      <style>{`
        .global-topbar-dark .topbar-row { color: #1d1d1f; }
        .global-topbar-dark .topbar-row > *:not([role="menu"]):not([role="menu"] *) { color: #1d1d1f; }
        .global-topbar-dark .topbar-row > *:not([role="menu"]):not([role="menu"] *) *:not([data-folder-icon]):not([data-folder-icon] *):not([role="menu"]):not([role="menu"] *) { color: #1d1d1f; }
        /* macOS menu-bar style hover: instant on/off, no easing. */
        .global-topbar-dark .topbar-row [data-nav-icon] {
          border-radius: 6px;
          transition: none !important;
        }
        .global-topbar-dark .topbar-row [data-nav-icon]:hover {
          background-color: rgba(0, 0, 0, 0.06) !important;
        }
        .global-topbar-dark .topbar-row [data-nav-icon]:active {
          background-color: rgba(0, 0, 0, 0.10) !important;
        }
        /* Group-members icon: slightly darker hover so it reads as the
           same tile family as the menu it opens, with a touch more weight. */
        .global-topbar-dark .topbar-row [data-nav-icon][data-nav-key="group-members"]:hover {
          background-color: rgba(0, 0, 0, 0.10) !important;
        }
        .global-topbar-dark .topbar-row [data-nav-icon][data-nav-key="group-members"]:active {
          background-color: rgba(0, 0, 0, 0.14) !important;
        }
        /* Generic button hover fallback for plus icons. */
        .global-topbar-dark .topbar-row button:hover {
          background-color: rgba(0,0,0,0.06) !important;
        }
        /* Chrome-style inset hover pill for the plus (new client tab) button —
           keep the hit area tall but shrink the visible hover to a small square. */
        .global-topbar-dark .topbar-row [data-plus-tab]:hover {
          background-color: transparent !important;
        }
        .global-topbar-dark .topbar-row [data-plus-tab]::before {
          content: "";
          position: absolute;
          top: 7px;
          bottom: 8px;
          left: 3px;
          right: 3px;
          border-radius: 6px;
          background-color: rgba(0, 0, 0, 0.06);
          opacity: 0;
          transition: opacity 120ms ease-out;
          pointer-events: none;
          z-index: 0;
        }
        .global-topbar-dark .topbar-row [data-plus-tab]:hover::before {
          opacity: 1;
        }
        /* Chrome-style inset hover pill for inactive tabs.
           Replaces the full-rect hover with a smaller pill that floats
           inside the tab area, inset on all four sides. */
        .global-topbar-dark .topbar-row [data-tab]:not([data-active-tab]):hover {
          background-color: transparent !important;
        }
        .global-topbar-dark .topbar-row [data-tab]:not([data-active-tab])::before {
          content: "";
          position: absolute;
          top: 4px;
          bottom: 5px;
          left: 4px;
          right: 4px;
          border-radius: 8px;
          background-color: rgba(0, 0, 0, 0.06);
          opacity: 0;
          transition: opacity 120ms ease-out;
          pointer-events: none;
          z-index: 0;
        }
        .global-topbar-dark .topbar-row [data-tab]:not([data-active-tab]):hover::before {
          opacity: 1;
        }
        /* Active tab sits on a white background — force black text/icon
           regardless of the dark-bar default. Folder icon keeps its inline
           color via specificity (set further below). */
        .global-topbar-dark .topbar-row [data-active-tab] { color: #111111 !important; }
        .global-topbar-dark .topbar-row [data-active-tab] *:not([data-folder-icon]):not([data-folder-icon] *) { color: #111111 !important; }
        .global-topbar-dark .topbar-row [data-active-tab]:hover,
        .global-topbar-dark .topbar-row [data-active-tab] *:hover {
          background-color: transparent !important;
        }
        /* Folder icon: when a folder color is set on the tab, it wins over
           the active-tab black override. Higher specificity than [data-active-tab] *. */
        .global-topbar-dark .topbar-row [data-tab] [data-folder-icon],
        .global-topbar-dark .topbar-row [data-active-tab] [data-folder-icon] {
          color: var(--folder-color, currentColor) !important;
        }
        /* Inactive-tab divider (Chrome-style). Hidden when either adjacent
           tab is hovered or active. */
        .global-topbar-dark .topbar-row [data-tab-divider] { transition: opacity 120ms; }
        .global-topbar-dark .topbar-row [data-tab]:hover + [data-tab-divider],
        .global-topbar-dark .topbar-row [data-tab-divider]:has(+ [data-tab]:hover) {
          opacity: 0 !important;
        }
        .global-topbar-dark .topbar-row [role="menu"],
        .global-topbar-dark .topbar-row [role="menu"] *:not([data-active-label]) { color: oklch(0.14 0.012 260) !important; }
        .global-topbar-dark .topbar-row [role="menu"] [data-active-label] { color: ${ACTIVE_STATUS_COLOR} !important; }
        .global-topbar-dark .topbar-row [role="menu"] .text-muted-foreground { color: oklch(0.5 0.01 260) !important; }
        .global-topbar-dark .topbar-row [role="menu"] button:hover {
          background-color: rgba(0, 0, 0, 0.06) !important;
          transition: none !important;
        }
      `}</style>
      <div className="topbar-row relative z-10 flex h-full items-end gap-1 pl-3 pr-4 md:pr-6">
        {/* Page-provided slot — open notes/event tabs etc. */}
        <div className="flex h-full min-w-0 flex-1 items-end">
          <TopBarSlotMount className="flex h-full min-w-0 flex-1 items-end" />
        </div>
        {showAppsMenu ? (
          <div className="relative mb-1">
            <AppsLauncher
              open={appsOpen}
              onToggle={() => setAppsOpen((v) => !v)}
              menuRef={appsRef}
              onPick={handleAppPick}
              buttonClassName="flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground transition hover:bg-secondary hover:text-ink"
            />
          </div>
        ) : null}
      </div>
    </div>
  );
}

function AppsLauncher({
  open,
  onToggle,
  menuRef,
  onPick,
  buttonClassName,
}: {
  open: boolean;
  onToggle: () => void;
  menuRef: RefObject<HTMLDivElement | null>;
  onPick: (key: "calendar" | "entity") => void;
  buttonClassName: string;
}) {
  return (
    <div className="relative" ref={menuRef}>
      <button
        type="button"
        onClick={onToggle}
        aria-label="Apps"
        aria-haspopup="menu"
        aria-expanded={open}
        className={buttonClassName}
      >
        <AppsIcon className="h-[18px] w-[18px]" />
      </button>
      {open ? (
        <div
          role="menu"
          className="absolute right-0 top-full z-50 mt-2 w-56 origin-top-right overflow-hidden rounded-xl border border-hairline bg-popover text-ink shadow-xl animate-in fade-in zoom-in-95 slide-in-from-top-1 duration-150"
        >
          <div className="p-3">
            <div className="px-1 pb-2 text-xs font-semibold text-muted-foreground">Apps</div>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                aria-label="Calendar"
                onClick={() => onPick("calendar")}
                className="flex aspect-square flex-col items-center justify-center gap-1 rounded-xl p-2 text-ink hover:bg-secondary"
                style={{ transition: "none" }}
              >
                <span className="flex h-[58%] w-full items-center justify-center [&_svg]:h-full [&_svg]:w-auto">
                  <CalendarDays strokeWidth={1.75} />
                </span>
                <span className="text-[11px] leading-none">Calendar</span>
              </button>
              <button
                type="button"
                aria-label="Entity"
                onClick={() => onPick("entity")}
                className="flex aspect-square flex-col items-center justify-center gap-1 rounded-xl p-2 text-ink hover:bg-secondary"
                style={{ transition: "none" }}
              >
                <span className="flex h-[58%] w-full items-center justify-center [&_svg]:h-full [&_svg]:w-auto">
                  <OrganizationIcon strokeWidth={1.75} />
                </span>
                <span className="text-[11px] leading-none">Entity</span>
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function AppsIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      fill="currentColor"
      aria-hidden="true"
    >
      {[5, 12, 19].flatMap((y) =>
        [5, 12, 19].map((x) => <circle key={`${x}-${y}`} cx={x} cy={y} r="1.6" />),
      )}
    </svg>
  );
}

function InitialBadge({ user }: { user: { email?: string | null; user_metadata?: Record<string, unknown> } }) {
  const meta = (user.user_metadata ?? {}) as Record<string, unknown>;
  const first = typeof meta.first_name === "string" ? meta.first_name : "";
  const last = typeof meta.last_name === "string" ? meta.last_name : "";
  const personalInitial =
    (first.trim()[0] || last.trim()[0] || user.email?.trim()[0] || "?").toUpperCase();
  const { personalName } = useProfileDisplayName();

  const { signOut, activeEntityId, setActiveEntity } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);
  const { groups, refresh } = useUserGroups();

  const activeGroup: UserGroup | null = activeEntityId
    ? groups.find((g) => g.id === activeEntityId) ?? null
    : null;
  const badgeInitial = activeGroup
    ? (activeGroup.name.trim()[0] || "?").toUpperCase()
    : personalInitial;

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!ref.current) return;
      if (!ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  useEffect(() => {
    if (open) void refresh();
  }, [open, refresh]);

  const handleSignOut = async () => {
    setOpen(false);
    await signOut();
    void navigate({ to: "/" });
  };

  const handleSelectPersonal = () => {
    setOpen(false);
    setActiveEntity(null);
  };

  const handleSelectGroup = (id: string) => {
    setOpen(false);
    setActiveEntity(id);
  };

  return (
    <div className="relative mb-1" ref={ref}>
      <button
        type="button"
        aria-label="Your profile"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="flex h-7 w-7 select-none items-center justify-center rounded-full bg-white/15 text-[12px] font-semibold text-white transition hover:bg-white/25"
      >
        {badgeInitial}
      </button>
      {open && (
        <ProfileSwitcherMenu
          personalName={personalName}
          personalInitial={personalInitial}
          groups={groups}
          activeEntityId={activeEntityId}
          onSelectPersonal={handleSelectPersonal}
          onSelectEntity={handleSelectGroup}
          onClose={() => setOpen(false)}
          onSignOut={() => void handleSignOut()}
          isLoggedIn
          className="absolute right-0 top-full z-50 mt-1.5 w-60 origin-top-right"
        />
      )}
    </div>
  );
}



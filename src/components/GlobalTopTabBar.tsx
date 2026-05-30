import { useEffect, useRef, useState } from "react";
import { useNavigate, useRouterState } from "@tanstack/react-router";

import {
  Image as ImageIcon,
  CalendarDays,
  BookOpen,
  Home,
  UserRound,
  Settings as SettingsIcon,
  UsersRound,
} from "lucide-react";
import { OrganizationIcon } from "@/components/OrganizationIcon";
// removed:
import { useAuth } from "@/lib/auth";


import { NavIconTabs, useActiveNavKey } from "@/components/NavIconTabs";
import { TopBarSlotMount } from "@/components/TopBarSlot";
import { ProfileSwitcherBar } from "@/components/ProfileSwitcherBar";
import { HomeIcon } from "@/components/HomeIcon";
import { useAuthTransition, useSignInModalOpen, setAuthTransitionPhase } from "@/lib/auth-transition";

/** Routes whose top tab-bar is stripped down to: Me/We + (conditional)
 *  Group Members. Calendar / Diary / Photos icons move into the apps menu. */
const STRIPPED_SURFACE_PREFIXES = ["/calendar", "/diary", "/media", "/photos", "/clients"];

function useIsStrippedSurface(): boolean {
  const path = useRouterState({ select: (s) => s.location.pathname });
  return STRIPPED_SURFACE_PREFIXES.some((p) => path === p || path.startsWith(p + "/"));
}


/**
 * Universal top tab bar fixed under the colored TopBar. Shown on every page.
 * Hosts: ProfileTab + section icons + page-provided open tabs (slot) +
 * Search + Plus menu.
 */
export function GlobalTopTabBar() {
  const { user, authReady } = useAuth();

  const activeKey = useActiveNavKey();
  const stripped = useIsStrippedSurface();
  const navigate = useNavigate();
  const path = useRouterState({ select: (s) => s.location.pathname });
  const transition = useAuthTransition();
  const signInOpen = useSignInModalOpen();

  // Safety net: the sign-in exit choreography mutates module-level state
  // through a chain of setTimeouts. If the tab is backgrounded for a long
  // time, browsers throttle/coalesce timers and the chain can leave the
  // phase stuck on "hidden" or "reveal-dark" after the modal has already
  // unmounted. That used to cause the entire top tab-bar to vanish on the
  // destination page (Calendar, Diary, Photos, Clients, …) after logging
  // back in. Whenever we're no longer on the landing page, force the
  // phase back to idle so the dark bar always renders.
  useEffect(() => {
    if (path !== "/" && transition !== "idle") {
      setAuthTransitionPhase("idle");
    }
  }, [path, transition]);

  // White minimal bar on landing "/" (logged-out). Keep showing it during
  // the sign-in exit fade so it can animate away in sync with the modal.
  const isHome =
    path === "/" && (!user || transition === "fading-out");
  // During the gap between the modal vanishing and the dark bar revealing,
  // render nothing — but only on the landing page where the choreography
  // is actually playing.
  if (path === "/" && transition === "hidden") return null;




  const [appsOpen, setAppsOpen] = useState(false);
  const appsRef = useRef<HTMLDivElement | null>(null);

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

  const handleAppNavigate = (to: "/calendar" | "/diary" | "/photos" | "/clients") => {
    setAppsOpen(false);
    if (!user) {
      const ctx =
        to === "/calendar" ? "calendar"
        : to === "/diary" ? "diary"
        : to === "/clients" ? "clients"
        : "photos";
      void navigate({ to: "/", search: { signin: ctx } });
      return;
    }
    void navigate({ to, resetScroll: false });
  };


  if (isHome) {
    const fading = transition === "fading-out";
    const recede = signInOpen && !fading;
    return (
      <div
        className="fixed left-0 right-0 top-0 z-[90] flex items-center justify-between"
        style={{
          backgroundColor: "#fafafa",
          height: 40,
          paddingLeft: 16,
          paddingRight: 16,
          opacity: fading ? 0 : recede ? 0 : authReady ? 1 : 0.5,
          pointerEvents: fading || recede || !authReady ? "none" : "auto",
          transition: fading
            ? "opacity 700ms ease-out"
            : "opacity 220ms ease-out",
        }}
      >
        <button
          type="button"
          aria-label="Home"
          className="flex items-center justify-center text-[#1d1d1f] hover:bg-black/5"
          style={{ height: 34, width: 34 }}
        >
          <HomeIcon className="h-[30px] w-[30px]" strokeWidth={2.2} />
        </button>
        {(
          
          <div className="relative" ref={appsRef}>
            <button
              onClick={() => setAppsOpen((v) => !v)}
              aria-label="Apps"
              aria-haspopup="menu"
              aria-expanded={appsOpen}
              className="flex h-9 w-9 items-center justify-center rounded-md text-[#1d1d1f] transition hover:bg-black/5"
            >
              <AppsIcon className="h-[18px] w-[18px]" />
            </button>
            {appsOpen && (
              <div
                role="menu"
                className="absolute right-0 top-full z-50 mt-2 w-56 origin-top-right overflow-hidden rounded-xl border border-hairline bg-popover text-ink shadow-xl animate-in fade-in zoom-in-95 slide-in-from-top-1 duration-150"
              >
                <div className="p-3">
                  <div className="px-1 pb-2 text-xs font-semibold text-muted-foreground">Apps</div>
                  <div className="grid grid-cols-2 gap-2">
                    {([
                      { key: "calendar", label: "Calendar", to: "/calendar", icon: <CalendarDays strokeWidth={1.75} />, disabled: false },
                      { key: "diary", label: "Diary", to: "/diary", icon: <BookOpen strokeWidth={1.75} />, disabled: false },
                      { key: "photos", label: "Photos", to: "/photos", icon: <ImageIcon strokeWidth={1.75} />, disabled: false },
                      { key: "organization", label: "Organization", to: null, icon: <OrganizationIcon strokeWidth={1.75} />, disabled: true },
                    ] as const).map((app) => (
                      <button
                        key={app.key}
                        type="button"
                        aria-label={app.label}
                        aria-disabled={app.disabled || undefined}
                        disabled={app.disabled}
                        onClick={app.disabled || !app.to ? undefined : () => handleAppNavigate(app.to)}
                        className={
                          "flex aspect-square flex-col items-center justify-center gap-1 rounded-xl p-2 " +
                          (app.disabled
                            ? "pointer-events-none opacity-50 text-muted-foreground"
                            : "text-ink hover:bg-secondary")
                        }
                        style={{ transition: "none" }}
                      >
                        <span className="flex h-[58%] w-full items-center justify-center [&_svg]:h-full [&_svg]:w-auto">
                          {app.icon}
                        </span>
                        <span className="text-[11px] leading-none">{app.label}</span>
                      </button>
                    ))}
                  </div>
                </div>
                <a
                  href="/"
                  onClick={(e) => {
                    e.preventDefault();
                    setAppsOpen(false);
                    void navigate({ to: "/" });
                  }}
                  className="flex w-full items-center gap-2 border-t border-hairline px-3 py-2.5 text-sm text-ink"
                  style={{ transition: "none" }}
                  onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "rgba(0,0,0,0.06)")}
                  onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "")}
                >
                  <Home className="h-4 w-4 text-muted-foreground" strokeWidth={2} />
                  <span>aponnacloud.com</span>
                </a>
                <a
                  href="/settings"
                  onClick={(e) => {
                    e.preventDefault();
                    setAppsOpen(false);
                    void navigate({ to: "/settings" });
                  }}
                  className="flex w-full items-center gap-2 border-t border-hairline px-3 py-2.5 text-sm text-ink"
                  style={{ transition: "none" }}
                  onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "rgba(0,0,0,0.06)")}
                  onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "")}
                >
                  <SettingsIcon className="h-4 w-4 text-muted-foreground" strokeWidth={2} />
                  <span>Aponna Cloud settings</span>
                </a>
                <a
                  href="#"
                  onClick={(e) => e.preventDefault()}
                  className="flex w-full items-center gap-2 border-t border-hairline px-3 py-2.5 text-sm text-ink"
                  style={{ transition: "none" }}
                  onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "rgba(0,0,0,0.06)")}
                  onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "")}
                >
                  <UserRound className="h-4 w-4 text-muted-foreground" strokeWidth={2} />
                  <span>account.aponna.com</span>
                </a>
              </div>
            )}
          </div>
        )}
      </div>
    );
  }

  // Only honor the reveal-dark phase on the landing page where the
  // choreography actually plays. On every other route, render the bar
  // normally regardless of any stale module-level phase.
  const revealing = path === "/" && transition === "reveal-dark";
  return (
    <div
      className="global-topbar-dark fixed left-0 right-0 top-0 z-[90]"
      style={{
        backgroundColor: revealing
          ? "rgba(74, 74, 74, 0.91)"
          : "rgba(29, 29, 31, 0.91)",
        backdropFilter: "saturate(180%) blur(20px)",
        WebkitBackdropFilter: "saturate(180%) blur(20px)",
        opacity: revealing ? 0 : authReady ? 1 : 0.5,
        pointerEvents: revealing || !authReady ? "none" : "auto",
        transition: revealing
          ? "opacity 350ms ease-out, background-color 450ms ease-out"
          : "opacity 350ms ease-out, background-color 350ms ease-out",
        animation: revealing
          ? "aponna-bar-reveal 500ms ease-out forwards"
          : undefined,
      }}
    >
      <style>{`
        @keyframes aponna-bar-reveal {
          0% { opacity: 0; background-color: rgba(74,74,74,0.91); }
          60% { opacity: 1; }
          100% { opacity: 1; background-color: rgba(29,29,31,0.91); }
        }
      `}</style>
      <style>{`
        .global-topbar-dark .topbar-row { color: #ffffff; }
        .global-topbar-dark .topbar-row > *:not([role="menu"]):not([role="menu"] *) { color: #ffffff; }
        .global-topbar-dark .topbar-row > *:not([role="menu"]):not([role="menu"] *) *:not([data-folder-icon]):not([data-folder-icon] *):not([role="menu"]):not([role="menu"] *) { color: #ffffff; }
        /* macOS menu-bar style hover: instant on/off, no easing. */
        .global-topbar-dark .topbar-row [data-nav-icon] {
          border-radius: 6px;
          transition: none !important;
        }
        .global-topbar-dark .topbar-row [data-nav-icon]:hover {
          background-color: rgba(255, 255, 255, 0.10) !important;
        }
        .global-topbar-dark .topbar-row [data-nav-icon]:active {
          background-color: rgba(255, 255, 255, 0.16) !important;
        }
        /* Group-members icon: slightly darker hover so it reads as the
           same tile family as the menu it opens, with a touch more weight. */
        .global-topbar-dark .topbar-row [data-nav-icon][data-nav-key="group-members"]:hover {
          background-color: rgba(255, 255, 255, 0.16) !important;
        }
        .global-topbar-dark .topbar-row [data-nav-icon][data-nav-key="group-members"]:active {
          background-color: rgba(255, 255, 255, 0.22) !important;
        }
        /* Generic button hover fallback for plus/apps icons. */
        .global-topbar-dark .topbar-row button:hover {
          background-color: rgba(255,255,255,0.10) !important;
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
          background-color: rgba(255, 255, 255, 0.10);
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
        .global-topbar-dark .topbar-row [role="menu"] * { color: oklch(0.14 0.012 260) !important; }
        .global-topbar-dark .topbar-row [role="menu"] .text-muted-foreground { color: oklch(0.5 0.01 260) !important; }
        .global-topbar-dark .topbar-row [role="menu"] button:hover {
          background-color: rgba(0, 0, 0, 0.06) !important;
          transition: none !important;
        }
      `}</style>
      <div className="topbar-row relative z-10 flex items-end gap-1 pl-0 pr-4 md:pr-6">
        {user && <ProfileSwitcherBar />}
        
        {user && <NavIconTabs activeKey={activeKey} stripped={stripped} />}
        {/* Page-provided slot — open notes/event tabs etc. */}
        <TopBarSlotMount className="flex min-w-0 flex-1 items-end pl-2" />
        {user && (
        <div className="relative mb-1" ref={appsRef}>
          <button
            onClick={() => { setAppsOpen((v) => !v); }}

            aria-label="Apps"
            aria-haspopup="menu"
            aria-expanded={appsOpen}
            className="flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground transition hover:bg-secondary hover:text-ink"
          >
            <AppsIcon className="h-[18px] w-[18px]" />
          </button>
          {appsOpen && (
            <div
              role="menu"
              className="absolute right-0 top-full z-50 mt-2 w-56 origin-top-right overflow-hidden rounded-xl border border-hairline bg-popover shadow-xl animate-in fade-in zoom-in-95 slide-in-from-top-1 duration-150"
            >
              <div className="p-3">
                <div className="px-1 pb-2 text-xs font-semibold text-muted-foreground">Apps</div>
                <div className="grid grid-cols-2 gap-2">
                  {([
                    { key: "calendar", label: "Calendar", to: "/calendar" as const, icon: <CalendarDays strokeWidth={1.75} />, disabled: false },
                    { key: "diary", label: "Diary", to: "/diary" as const, icon: <BookOpen strokeWidth={1.75} />, disabled: false },
                    { key: "photos", label: "Photos", to: "/photos" as const, icon: <ImageIcon strokeWidth={1.75} />, disabled: false },
                    { key: "organization", label: "Organization", to: null, icon: <OrganizationIcon strokeWidth={1.75} />, disabled: true },
                    { key: "clients", label: "Clients", to: "/clients" as const, icon: <UsersRound strokeWidth={1.75} />, disabled: false },
                  ] as Array<{ key: string; label: string; to: "/calendar" | "/diary" | "/photos" | "/clients" | null; icon: React.ReactNode; disabled: boolean }>).map((app) => (
                    <button
                      key={app.key}
                      type="button"
                      aria-label={app.label}
                      aria-disabled={app.disabled || undefined}
                      disabled={app.disabled}
                      onClick={app.disabled || !app.to ? undefined : () => handleAppNavigate(app.to!)}
                      className={
                        "flex aspect-square flex-col items-center justify-center gap-1 rounded-xl p-2 " +
                        (app.disabled
                          ? "pointer-events-none opacity-50 text-muted-foreground"
                          : "text-ink hover:bg-secondary")
                      }
                      style={{ transition: "none" }}
                    >
                      <span className="flex h-[58%] w-full items-center justify-center [&_svg]:h-full [&_svg]:w-auto">
                        {app.icon}
                      </span>
                      <span className="text-[11px] leading-none">{app.label}</span>
                    </button>
                  ))}
                </div>
              </div>
              <a
                href="/"
                onClick={(e) => {
                  e.preventDefault();
                  setAppsOpen(false);
                  void navigate({ to: "/" });
                }}
                className="flex w-full items-center gap-2 border-t border-hairline px-3 py-2.5 text-sm text-ink"
                style={{ transition: "none" }}
                onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "rgba(0,0,0,0.06)")}
                onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "")}
              >
                <Home className="h-4 w-4 text-muted-foreground" strokeWidth={2} />
                <span>aponnacloud.com</span>
              </a>
              <a
                href="/settings"
                onClick={(e) => {
                  e.preventDefault();
                  setAppsOpen(false);
                  void navigate({ to: "/settings" });
                }}
                className="flex w-full items-center gap-2 border-t border-hairline px-3 py-2.5 text-sm text-ink"
                style={{ transition: "none" }}
                onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "rgba(0,0,0,0.06)")}
                onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "")}
              >
                <SettingsIcon className="h-4 w-4 text-muted-foreground" strokeWidth={2} />
                <span>Aponna Cloud settings</span>
              </a>
              <a
                href="#"
                onClick={(e) => e.preventDefault()}
                className="flex w-full items-center gap-2 border-t border-hairline px-3 py-2.5 text-sm text-ink"
                style={{ transition: "none" }}
                onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "rgba(0,0,0,0.06)")}
                onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "")}
              >
                <UserRound className="h-4 w-4 text-muted-foreground" strokeWidth={2} />
                <span>account.aponna.com</span>
              </a>
            </div>
          )}
        </div>
        )}
      </div>
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
        [5, 12, 19].map((x) => <circle key={`${x}-${y}`} cx={x} cy={y} r="1.6" />)
      )}
    </svg>
  );
}


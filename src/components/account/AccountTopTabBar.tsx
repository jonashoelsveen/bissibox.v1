import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import { useAuth } from "@/lib/auth";
import {
  CLOUD_FOOTER_BG,
  landingPrimaryButtonCompactStyle,
  MINIMAL_TOP_TAB_BAR_HEIGHT,
  MINIMAL_TOP_TAB_BAR_PADDING_X,
  minimalTopTabBarShellStyle,
} from "@/lib/cloud-landing-design";
import { TopBarBrandTitle } from "@/components/HomeIcon";
import {
  clearCloudHomeScroll,
  scrollCloudPageToTop,
} from "@/components/CloudLandingSection";
import { useSignInModalOpen } from "@/lib/auth-transition";
import { requestAccountSignIn } from "@/components/account/AccountLandingPage";
import { AccountNav } from "@/components/account/AccountNav";
import { accountHomeSearch } from "@/lib/app-surface";
import type { AccountSectionId } from "@/lib/account-route";
import { useBelowBissiboxDesktop } from "@/hooks/useBelowBissiboxDesktop";

const PANEL_WIDTH = 256;
/** Same dim as the account/cloud sign-in overlay. */
const PAGE_DIM = "rgba(0,0,0,0.28)";
const MENU_BTN = 36;
/** Matches calendar / library left-rail open-close (`duration-300 ease-out`). */
const PANEL_MOTION = "300ms ease-out";

function sectionFromPath(path: string): AccountSectionId {
  if (path.startsWith("/profiles")) return "profiles";
  if (path.startsWith("/family")) return "family";
  return "me";
}

/** Square-cap bars — slightly thinner and more spaced than the first pass. */
function AccountMenuIcon() {
  return (
    <svg
      width={22}
      height={22}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="square"
      strokeLinejoin="miter"
      aria-hidden
    >
      <path d="M3.5 5.75h17" />
      <path d="M3.5 12h17" />
      <path d="M3.5 18.25h17" />
    </svg>
  );
}

/**
 * Top bar for account.bissibox.com — matches cloud landing chrome on the left.
 * Logged out: compact Log in (same pill as Cloud).
 * Logged in: brand + hamburger below 640px; Sign out lives in the nav.
 */
export function AccountTopTabBar() {
  const { user, authReady } = useAuth();
  const signInOpen = useSignInModalOpen();
  const navigate = useNavigate();
  const path = useRouterState({ select: (s) => s.location.pathname });
  const recede = !user && signInOpen && path === "/";
  const [menuOpen, setMenuOpen] = useState(false);
  const belowDesktop = useBelowBissiboxDesktop();

  useEffect(() => {
    setMenuOpen(false);
  }, [path]);

  useEffect(() => {
    if (!belowDesktop) setMenuOpen(false);
  }, [belowDesktop]);

  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenuOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [menuOpen]);

  const goAccountHome = () => {
    clearCloudHomeScroll();
    scrollCloudPageToTop();
    void navigate({ to: "/", search: accountHomeSearch(), resetScroll: true }).then(() => {
      scrollCloudPageToTop();
      requestAnimationFrame(() => scrollCloudPageToTop());
      window.setTimeout(scrollCloudPageToTop, 50);
    });
  };

  const menuButton = (
    <button
      type="button"
      className="bissibox-compact-only h-9 w-9 place-items-center border-0 bg-transparent p-0 text-[#1d1d1f]"
      aria-label={menuOpen ? "Close menu" : "Open menu"}
      aria-expanded={menuOpen}
      onClick={() => setMenuOpen((v) => !v)}
    >
      <AccountMenuIcon />
    </button>
  );

  return (
    <>
      <div
        className="fixed left-0 right-0 top-0 z-[90] flex items-center justify-between"
        style={{
          ...minimalTopTabBarShellStyle,
          opacity: recede ? 0 : authReady ? 1 : 0.5,
          pointerEvents: recede || !authReady ? "none" : "auto",
          transition: "opacity 220ms ease-out",
        }}
      >
        <TopBarBrandTitle
          label="Account"
          ariaLabel="Bissibox Account"
          onClick={goAccountHome}
        />
        {user ? (
          <span className="bissibox-compact-only h-9 w-9" aria-hidden />
        ) : authReady ? (
          <button
            type="button"
            onClick={() => {
              if (path === "/") {
                requestAccountSignIn();
                return;
              }
              void navigate({
                to: "/",
                search: { ...accountHomeSearch(), signin: "account" },
              });
            }}
            className="text-white transition active:scale-[0.98]"
            style={landingPrimaryButtonCompactStyle}
          >
            Log in
          </button>
        ) : null}
      </div>
      {user && typeof document !== "undefined"
        ? createPortal(
            <>
              <div
                className="account-menu-toggle fixed z-[110] grid place-items-center"
                style={{
                  top: (MINIMAL_TOP_TAB_BAR_HEIGHT - MENU_BTN) / 2,
                  right: MINIMAL_TOP_TAB_BAR_PADDING_X,
                  width: MENU_BTN,
                  height: MENU_BTN,
                }}
              >
                {menuButton}
              </div>
              <button
                type="button"
                className="account-nav-dim fixed inset-0 z-[95] border-0 p-0"
                style={{
                  background: PAGE_DIM,
                  opacity: menuOpen ? 1 : 0,
                  pointerEvents: menuOpen ? "auto" : "none",
                  transition: `opacity ${PANEL_MOTION}`,
                }}
                aria-label="Close menu"
                onClick={() => setMenuOpen(false)}
              />
              <aside
                className="account-nav-panel fixed bottom-0 right-0 top-0 z-[100] overflow-hidden"
                style={{
                  width: PANEL_WIDTH,
                  backgroundColor: CLOUD_FOOTER_BG,
                  transform: menuOpen ? "translateX(0)" : "translateX(100%)",
                  transition: `transform ${PANEL_MOTION}`,
                  pointerEvents: menuOpen ? "auto" : "none",
                }}
                aria-hidden={!menuOpen}
                aria-label="Account menu"
              >
                <div className="relative flex h-full flex-col overflow-hidden border-l border-hairline">
                  <div
                    className="min-h-0 flex-1 overflow-y-auto px-3"
                    style={{ paddingTop: MINIMAL_TOP_TAB_BAR_HEIGHT + 8 }}
                  >
                    <AccountNav active={sectionFromPath(path)} inPanel />
                  </div>
                </div>
              </aside>
            </>,
            document.body,
          )
        : null}
    </>
  );
}

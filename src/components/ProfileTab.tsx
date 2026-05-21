import { useEffect, useState } from "react";
import { useRouterState } from "@tanstack/react-router";
import { useAuth } from "@/lib/auth";
import { LibraryAlbumsHoverMenu } from "@/components/library/LibraryAlbumsHoverMenu";

/**
 * Leftmost fixed slot in the universal tab bar. Renders a macOS-menu-bar
 * style label — "Me" in individual mode and "We" in entity (team/organizer)
 * mode.
 *
 * The tab container geometry is constant across every route and every
 * state (inactive / active). Only the visibility of the white pill fill
 * and the two curve SVGs changes — they fade in via opacity when the
 * label is clicked on a stripped surface (/calendar, /diary, /photos,
 * /media). This keeps the bottom hairline of the tab bar perfectly
 * continuous and avoids any layout shift on activation.
 */

const STRIPPED_SURFACE_PREFIXES = ["/calendar", "/diary", "/media", "/photos"];

const LABEL_FONT =
  '-apple-system, BlinkMacSystemFont, "Helvetica Neue", Helvetica, Arial, sans-serif';

const PILL_TRANSITION = "opacity 140ms cubic-bezier(0.2, 0.8, 0.2, 1)";

export function ProfileTab() {
  const { user, mode, activeEntityId } = useAuth();
  const router = useRouterState();
  const path = router.location.pathname;
  const [activated, setActivated] = useState(false);

  // Other tabs can request that the Me/We tab releases its active state
  // (so only one tab in the strip reads as "active" at a time).
  useEffect(() => {
    if (typeof window === "undefined") return;
    const off = () => setActivated(false);
    window.addEventListener("topbar:profile-tab:deactivate", off);
    return () => window.removeEventListener("topbar:profile-tab:deactivate", off);
  }, []);

  // Reset activation when navigating away from a stripped surface.
  useEffect(() => {
    const onStripped = STRIPPED_SURFACE_PREFIXES.some(
      (p) => path === p || path.startsWith(p + "/")
    );
    if (!onStripped) setActivated(false);
  }, [path]);

  if (!user) return null;

  const isEntity =
    mode === "team" || mode === "organizer" || !!activeEntityId;
  const label = isEntity ? "We" : "Me";
  const onMedia = path.startsWith("/media");
  const onStripped = STRIPPED_SURFACE_PREFIXES.some(
    (p) => path === p || path.startsWith(p + "/")
  );

  const isActive = onStripped && activated;
  const pillOpacity = isActive ? 1 : 0;

  const inner = (
    <button
      type="button"
      data-nav-key="profile-label"
      aria-label={label}
      {...(onStripped ? { "aria-pressed": activated } : {})}
      onClick={() => {
        if (onStripped) setActivated((v) => !v);
      }}
      className="relative z-[1] flex h-full items-center px-3 text-[15px] font-semibold leading-none text-ink"
      style={{ fontFamily: LABEL_FONT }}
    >
      {label}
    </button>
  );

  return (
    <div
      data-tab
      {...(isActive ? { "data-active-tab": "" } : {})}
      className="relative shrink-0 select-none"
      style={{
        height: 38,
        marginLeft: 16,
        marginRight: 16,
        marginBottom: -1,
        paddingBottom: 1,
      }}
    >
      {/* White pill body */}
      <span
        aria-hidden
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          bottom: -1,
          background: "#FFFFFF",
          pointerEvents: "none",
          zIndex: 0,
          opacity: pillOpacity,
          transition: PILL_TRANSITION,
        }}
      />
      {/* Left wave — extends 16px outside the container so it lands on x=0 of the page */}
      <svg
        aria-hidden
        width="28"
        height="39"
        viewBox="0 0 32 39"
        style={{
          position: "absolute",
          top: 0,
          left: -16,
          pointerEvents: "none",
          zIndex: 0,
          overflow: "visible",
          display: "block",
          opacity: pillOpacity,
          transition: PILL_TRANSITION,
        }}
      >
        <path
          d="M 0 39 L 0 38 A 16 16 0 0 0 16 22 L 16 8 A 8 8 0 0 1 24 0 L 32 0 L 32 39 Z"
          fill="#FFFFFF"
          shapeRendering="geometricPrecision"
        />
      </svg>
      {/* Right wave */}
      <svg
        aria-hidden
        width="28"
        height="39"
        viewBox="0 0 32 39"
        style={{
          position: "absolute",
          top: 0,
          right: -16,
          pointerEvents: "none",
          zIndex: 0,
          overflow: "visible",
          display: "block",
          opacity: pillOpacity,
          transition: PILL_TRANSITION,
        }}
      >
        <path
          d="M 32 39 L 32 38 A 16 16 0 0 1 16 22 L 16 8 A 8 8 0 0 0 8 0 L 0 0 L 0 39 Z"
          fill="#FFFFFF"
          shapeRendering="geometricPrecision"
        />
      </svg>
      {onMedia ? <LibraryAlbumsHoverMenu>{inner}</LibraryAlbumsHoverMenu> : inner}
    </div>
  );
}

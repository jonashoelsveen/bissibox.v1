import { useEffect, useState } from "react";
import { useRouterState } from "@tanstack/react-router";
import { useAuth } from "@/lib/auth";
import { LibraryAlbumsHoverMenu } from "@/components/library/LibraryAlbumsHoverMenu";

/**
 * Leftmost fixed slot in the universal tab bar. Renders a macOS-menu-bar
 * style label — "Me" in individual mode and "We" in entity (team/organizer)
 * mode.
 *
 * On the stripped surfaces (/calendar, /diary, /photos, /media), clicking
 * the label promotes it to an "active tab" — the white pill with the
 * curved wave on each side, matching the page-tab strip. The left wave
 * is flush with the page's left edge. The tab is fixed (non-draggable).
 *
 * On /media the existing hover menu of albums stays attached.
 */

const STRIPPED_SURFACE_PREFIXES = ["/calendar", "/diary", "/media", "/photos"];

const LABEL_FONT =
  '-apple-system, BlinkMacSystemFont, "Helvetica Neue", Helvetica, Arial, sans-serif';

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

  if (onStripped && activated) {
    // Active-tab presentation: white pill with curved waves on each side.
    // Container sits 16px from the page edge so the LEFT wave (which
    // extends 16px outside the container) lands exactly on x=0.
    const inner = (
      <button
        type="button"
        aria-label={label}
        aria-pressed
        onClick={() => setActivated(false)}
        className="relative z-[1] flex h-full items-center px-3 text-[15px] font-semibold leading-none text-ink"
        style={{ fontFamily: LABEL_FONT }}
      >
        {label}
      </button>
    );

    return (
      <div
        data-tab
        data-active-tab=""
        className="relative shrink-0 select-none"
        style={{
          height: 38,
          marginLeft: 16,
          marginRight: 16,
          marginBottom: -1,
          paddingBottom: 1,
        }}
      >
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
          }}
        />
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
          }}
        >
          <path
            d="M 0 39 L 0 38 A 16 16 0 0 0 16 22 L 16 8 A 8 8 0 0 1 24 0 L 32 0 L 32 39 Z"
            fill="#FFFFFF"
            shapeRendering="geometricPrecision"
          />
        </svg>
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

  const button = (
    <button
      type="button"
      data-nav-icon=""
      data-nav-key="profile-label"
      aria-label={label}
      onClick={() => {
        if (onStripped) setActivated(true);
      }}
      className="flex h-8 select-none items-center rounded-md px-3 text-[15px] font-semibold leading-none text-ink"
      style={{ fontFamily: LABEL_FONT }}
    >
      {label}
    </button>
  );

  return (
    <div
      className="relative flex h-9 shrink-0 select-none items-center"
      style={{ paddingLeft: 16, paddingRight: 8 }}
    >
      {onMedia ? <LibraryAlbumsHoverMenu>{button}</LibraryAlbumsHoverMenu> : button}
    </div>
  );
}

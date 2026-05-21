import { useRouterState } from "@tanstack/react-router";
import { useAuth } from "@/lib/auth";
import { LibraryAlbumsHoverMenu } from "@/components/library/LibraryAlbumsHoverMenu";

/**
 * Leftmost fixed slot in the universal tab bar. Renders a macOS-menu-bar
 * style label — "Me" in individual mode and "We" in entity (team/organizer)
 * mode.
 *
 * The label has no active/white pill state — only a subtle hover tile,
 * matching the rest of the tabs in the strip.
 */

const LABEL_FONT =
  '-apple-system, BlinkMacSystemFont, "Helvetica Neue", Helvetica, Arial, sans-serif';

export function ProfileTab() {
  const { user, mode, activeEntityId } = useAuth();
  const router = useRouterState();
  const path = router.location.pathname;

  if (!user) return null;

  const isEntity =
    mode === "team" || mode === "organizer" || !!activeEntityId;
  const label = isEntity ? "We" : "Me";
  const onMedia = path.startsWith("/media");

  const inner = (
    <button
      type="button"
      data-nav-key="profile-label"
      aria-label={label}
      className="relative z-[1] flex h-full items-center rounded-md px-3 text-[15px] font-semibold leading-none text-ink transition-colors hover:bg-black/5"
      style={{ fontFamily: LABEL_FONT }}
    >
      {label}
    </button>
  );

  return (
    <div
      data-tab
      className="relative shrink-0 select-none"
      style={{
        height: 38,
        marginLeft: 16,
        marginRight: 16,
        marginBottom: -1,
        paddingBottom: 1,
      }}
    >
      {onMedia ? <LibraryAlbumsHoverMenu>{inner}</LibraryAlbumsHoverMenu> : inner}
    </div>
  );
}

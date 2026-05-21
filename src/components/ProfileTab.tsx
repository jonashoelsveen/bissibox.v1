import { useRouterState } from "@tanstack/react-router";
import { useAuth } from "@/lib/auth";
import { LibraryAlbumsHoverMenu } from "@/components/library/LibraryAlbumsHoverMenu";

/**
 * Leftmost fixed slot in the universal tab bar. Renders a macOS-menu-bar
 * style label — "Me" in individual mode and "We" in entity (team/organizer)
 * mode. On the Library (/media) page, hovering reveals a hover menu of
 * albums; clicking an album opens it as a tab on first click.
 */
export function ProfileTab() {
  const { user, mode, activeEntityId } = useAuth();
  const router = useRouterState();
  if (!user) return null;

  const isEntity = mode === "team" || mode === "organizer" || !!activeEntityId;
  const label = isEntity ? "We" : "Me";
  const onMedia = router.location.pathname.startsWith("/media");

  const button = (
    <button
      type="button"
      data-nav-icon=""
      data-nav-key="profile-label"
      aria-label={label}
      className="flex h-9 select-none items-center rounded-md px-3 text-[13px] font-semibold text-ink"
      style={{
        fontFamily:
          '-apple-system, BlinkMacSystemFont, "Helvetica Neue", Helvetica, Arial, sans-serif',
      }}
    >
      {label}
    </button>
  );

  return (
    <div className="-mb-px relative flex shrink-0 select-none items-end pr-2">
      <div className="flex h-[42px] items-center border-b-2 border-transparent">
        {onMedia ? (
          <LibraryAlbumsHoverMenu>{button}</LibraryAlbumsHoverMenu>
        ) : (
          button
        )}
      </div>
    </div>
  );
}

import { Link } from "@tanstack/react-router";
import { useAuth } from "@/lib/auth";
import { HomeIcon } from "@/components/HomeIcon";

/**
 * Leftmost fixed slot in the universal tab bar. Hosts the Home icon and a
 * static "Calendar" label. Clicking the icon navigates to the Home page.
 * The previous profile/entity-switcher dropdown has moved into the
 * profile-menu on the right side of the bar.
 */
export function ProfileTab() {
  const { user } = useAuth();
  if (!user) return null;

  return (
    <div className="-mb-px relative flex shrink-0 select-none items-end">
      <div className="flex h-[42px] items-center gap-2 border-b-2 border-transparent pr-3">
        <Link
          to="/home"
          aria-label="Home"
          data-nav-icon=""
          data-nav-key="home"
          className="flex h-9 w-9 items-center justify-center rounded-md text-ink"
        >
          <HomeIcon className="h-[20px] w-[20px]" />
        </Link>
        <span
          className="select-none text-[13px] font-normal text-ink"
          style={{
            fontFamily:
              '-apple-system, BlinkMacSystemFont, "Helvetica Neue", Helvetica, Arial, sans-serif',
          }}
        >
          Calendar
        </span>
      </div>
    </div>
  );
}

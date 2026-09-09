import { Eye, EyeOff, MoreHorizontal } from "lucide-react";
import {
  CategoryActionsMenu,
  MEMBERSHIP_COLOR_DEFAULT,
} from "@/components/library/CategoryActionsMenu";
import { useMembershipCalendarSafe } from "./MembershipCalendarContext";

/**
 * Individual-mode left rail: one row per active entity membership.
 * Empty when the user has no memberships (replaces “today’s sessions”).
 */
export function MembershipEntityTabs() {
  const membership = useMembershipCalendarSafe();
  if (!membership || membership.memberships.length === 0) {
    return <div className="min-h-0 flex-1" aria-hidden="true" />;
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden px-1.5">
      <div
        className="sidenav-scroll group/scroll flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto pb-6 pt-1"
        style={{
          maskImage:
            "linear-gradient(to bottom, black 0, black calc(100% - 28px), transparent 100%)",
          WebkitMaskImage:
            "linear-gradient(to bottom, black 0, black calc(100% - 28px), transparent 100%)",
        }}
      >
        {membership.memberships.map((team) => {
          const hidden = membership.isHidden(team.teamId);
          const overlay = membership.overlayColor(team.teamId);
          return (
            <div
              key={team.teamId}
              className={`group flex cursor-default items-center gap-2 rounded-md px-2 py-1 text-xs transition-colors hover:bg-secondary/60 ${
                hidden ? "text-muted-foreground" : "text-ink"
              }`}
            >
              <span className="min-w-0 flex-1 cursor-default truncate select-none">{team.name}</span>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  membership.toggleHidden(team.teamId);
                }}
                onPointerDown={(e) => e.stopPropagation()}
                aria-label={hidden ? "Show sessions" : "Hide sessions"}
                className="grid h-5 w-5 shrink-0 place-items-center rounded hover:bg-secondary"
              >
                {hidden ? (
                  <EyeOff className="h-3 w-3 text-muted-foreground/70" />
                ) : (
                  <Eye className="h-3 w-3 text-muted-foreground/50 opacity-0 group-hover:opacity-100" />
                )}
              </button>
              <CategoryActionsMenu
                includeDefaultColor
                colorLabel="Session colour"
                currentColor={overlay ?? MEMBERSHIP_COLOR_DEFAULT}
                onColorChange={(hex) =>
                  membership.setOverlayColor(team.teamId, hex || null)
                }
                trigger={
                  <button
                    type="button"
                    onClick={(e) => e.stopPropagation()}
                    onPointerDown={(e) => e.stopPropagation()}
                    className="grid h-5 w-5 shrink-0 place-items-center rounded text-muted-foreground/60 opacity-0 hover:bg-secondary hover:text-ink group-hover:opacity-100 data-[state=open]:opacity-100"
                    aria-label={`${team.name} session colour`}
                  >
                    <MoreHorizontal className="h-3 w-3" />
                  </button>
                }
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}

import { Link, useRouterState } from "@tanstack/react-router";
import { useState } from "react";
import { Search, Library, Plus, Tent, Settings, LogIn, Users, Armchair, CalendarDays, Map as MapIcon, BookOpen, Briefcase } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { useIsGroupLeader } from "@/hooks/useIsGroupLeader";
import { NewNoteOverlay } from "@/components/library/NewNoteOverlay";
import { NewEventDialog } from "@/components/organizer/NewEventDialog";

export function TopChrome() {
  const router = useRouterState();
  const path = router.location.pathname;
  const { user, mode } = useAuth();
  const isGroupLeader = useIsGroupLeader();
  const [newNoteOpen, setNewNoteOpen] = useState(false);
  const [newEventOpen, setNewEventOpen] = useState(false);

  const isOrganizer = (mode === "organizer" || mode === "team") && !!user;
  const isIndividual = !isOrganizer;

  return (
    <aside className="pointer-events-none fixed left-0 top-0 z-40 h-screen p-5 pt-[72px] md:p-6 md:pt-[72px]">
      <div className="pointer-events-auto flex h-full flex-col items-center gap-2">
        {/* Sign-in shortcut for logged-out users (logged-in identity lives in the top bar) */}
        {!user && (
          <Link
            to="/auth"
            aria-label="Sign in"
            className={`flex h-9 w-9 items-center justify-center rounded-full transition ${
              path.startsWith("/auth")
                ? "bg-primary text-primary-foreground"
                : "text-ink hover:bg-secondary"
            }`}
          >
            <LogIn className="h-[18px] w-[18px]" strokeWidth={2.25} />
          </Link>
        )}

        {!user && <div className="my-1 h-px w-6 bg-hairline" />}
        {user && mode === "team" && (
          <NavBtn to="/team/members" label="Members" active={path.startsWith("/team/members")}>
            <Users className="h-[18px] w-[18px]" strokeWidth={2.25} />
          </NavBtn>
        )}
        {user && isGroupLeader && (
          <NavBtn
            to="/team/group-meetings"
            label="Group meetings"
            active={path.startsWith("/team/group-meetings")}
          >
            <Briefcase className="h-[18px] w-[18px]" strokeWidth={2.25} />
          </NavBtn>
        )}

        {user && (
          <NavBtn to="/media" label="Content" active={path.startsWith("/media")}>
            <Library className="h-[18px] w-[18px]" strokeWidth={2.25} />
          </NavBtn>
        )}

        {user && (
          <NavBtn to="/calendar" label="Calendar" active={path.startsWith("/calendar")}>
            <CalendarDays className="h-[18px] w-[18px]" strokeWidth={2.25} />
          </NavBtn>
        )}

        {user && isIndividual && (
          <NavBtn to="/diary" label="Diary" active={path.startsWith("/diary")}>
            <BookOpen className="h-[18px] w-[18px]" strokeWidth={2.25} />
          </NavBtn>
        )}

        {isOrganizer && (
          <NavBtn to="/map" label="Map" active={path.startsWith("/map")}>
            <MapIcon className="h-[18px] w-[18px]" strokeWidth={2.25} />
          </NavBtn>
        )}

        {isOrganizer ? (
          <>
            <NavBtn
              to="/organizer/library"
              label="My events"
              active={
                path.startsWith("/organizer/library") ||
                (path.startsWith("/organizer/") && !path.startsWith("/organizer/new")) ||
                path === "/"
              }
            >
              <Tent className="h-[18px] w-[18px]" strokeWidth={2.25} />
            </NavBtn>
            <button
              onClick={() => setNewEventOpen(true)}
              aria-label="Create event"
              className="flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground transition-all hover:bg-secondary hover:text-ink"
            >
              <Plus className="h-[18px] w-[18px]" strokeWidth={2.25} />
            </button>
          </>
        ) : (
          <>
            <NavBtn to="/" label="Search races" active={path === "/"}>
              <Search className="h-[18px] w-[18px]" strokeWidth={2.25} />
            </NavBtn>
            {isIndividual && user && (
              <NavBtn
                to="/discover"
                label="Search people"
                active={path.startsWith("/discover")}
              >
                <span className="relative inline-flex">
                  <Search className="h-[18px] w-[18px]" strokeWidth={2.25} />
                  <span className="pointer-events-none absolute -right-1.5 -top-1.5 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-primary text-[8px] font-bold text-primary-foreground">
                    2
                  </span>
                </span>
              </NavBtn>
            )}
            {isIndividual && user && (
              <button
                onClick={() => setNewNoteOpen(true)}
                aria-label="New note"
                className="flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground transition-all hover:bg-secondary hover:text-ink"
              >
                <Plus className="h-[18px] w-[18px]" strokeWidth={2.25} />
              </button>
            )}
          </>
        )}

        <div className="mt-auto flex flex-col items-center gap-2 pb-2">
          {isIndividual && user && (
            <NavBtn to="/desk" label="Desk" active={path.startsWith("/desk")}>
              <Armchair className="h-[18px] w-[18px]" strokeWidth={2.25} />
            </NavBtn>
          )}
          <NavBtn
            to={user ? "/settings" : "/auth"}
            label="Settings"
            active={path.startsWith("/settings")}
          >
            <Settings className="h-[18px] w-[18px]" strokeWidth={2.25} />
          </NavBtn>
        </div>
      </div>
      {newNoteOpen && <NewNoteOverlay onClose={() => setNewNoteOpen(false)} />}
      {newEventOpen && <NewEventDialog onClose={() => setNewEventOpen(false)} />}
    </aside>
  );
}





function NavBtn({
  to,
  label,
  active,
  children,
}: {
  to: string;
  label: string;
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      to={to}
      aria-label={label}
      className={`flex h-9 w-9 items-center justify-center rounded-full transition-all ${
        active ? "bg-primary text-primary-foreground" : "text-ink hover:bg-secondary"
      }`}
    >
      {children}
    </Link>
  );
}

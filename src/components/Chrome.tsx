import { Link, useRouterState } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Search, Library, Plus, Image, Settings, LogIn, Users, Briefcase } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";

export function TopChrome() {
  const router = useRouterState();
  const path = router.location.pathname;
  const { user, mode } = useAuth();
  const [letter, setLetter] = useState<string>("");

  const isOrganizer = (mode === "organizer" || mode === "team") && !!user;
  const isIndividual = !isOrganizer;

  useEffect(() => {
    let cancel = false;
    if (!user) {
      setLetter("");
      return;
    }
    (async () => {
      const { data } = await supabase
        .from("profiles")
        .select("first_name,last_name,email")
        .eq("id", user.id)
        .maybeSingle();
      if (cancel) return;
      const src =
        (data?.first_name && data.first_name.trim()) ||
        (data?.last_name && data.last_name.trim()) ||
        data?.email ||
        user.email ||
        "?";
      setLetter(src.charAt(0).toUpperCase());
    })();
    return () => {
      cancel = true;
    };
  }, [user]);

  return (
    <aside className="fixed left-0 top-0 z-40 h-screen p-5 md:p-6">
      <div className="flex h-full flex-col items-center gap-2 pt-2">
        {/* Profile / Sign-in at the top */}
        {user ? (
          <Link
            to="/profile"
            aria-label="Profile"
            className={`flex h-9 w-9 items-center justify-center rounded-full text-sm font-medium transition-all ${
              path.startsWith("/profile")
                ? "bg-primary text-primary-foreground"
                : "text-ink hover:bg-secondary"
            }`}
          >
            {letter}
          </Link>
        ) : (
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

        <div className="my-1 h-px w-6 bg-hairline" />

        {user && mode === "team" && (
          <>
            <NavBtn to="/team/members" label="Members" active={path.startsWith("/team/members")}>
              <Users className="h-[18px] w-[18px]" strokeWidth={2.25} />
            </NavBtn>
            <NavBtn to="/team/board" label="Board" active={path.startsWith("/team/board")}>
              <Briefcase className="h-[18px] w-[18px]" strokeWidth={2.25} />
            </NavBtn>
          </>
        )}

        {user && (
          <NavBtn to="/media" label="Content" active={path.startsWith("/media")}>
            <Image className="h-[18px] w-[18px]" strokeWidth={2.25} />
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
              <Library className="h-[18px] w-[18px]" strokeWidth={2.25} />
            </NavBtn>
            <NavBtn
              to="/organizer/new"
              label="Create event"
              active={path.startsWith("/organizer/new")}
            >
              <Plus className="h-[18px] w-[18px]" strokeWidth={2.25} />
            </NavBtn>
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
          </>
        )}

        <div className="mt-auto flex flex-col items-center gap-2 pb-2">
          {user && <ModeSwitch />}
          <NavBtn
            to={user ? "/settings" : "/auth"}
            label="Settings"
            active={path.startsWith("/settings")}
          >
            <Settings className="h-[18px] w-[18px]" strokeWidth={2.25} />
          </NavBtn>
        </div>
      </div>
    </aside>
  );
}

function ModeSwitch() {
  const { mode, setMode } = useAuth();
  const isTeam = mode === "team" || mode === "organizer";
  return (
    <div
      className="flex flex-col items-center rounded-full border border-hairline bg-card p-0.5 shadow-sm"
      role="group"
      aria-label="Switch account mode"
    >
      <button
        type="button"
        aria-label="Individual"
        title="Individual"
        onClick={() => setMode("participant")}
        className={`flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-semibold transition ${
          !isTeam ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-ink"
        }`}
      >
        I
      </button>
      <button
        type="button"
        aria-label="Team"
        title="Team"
        onClick={() => setMode("team")}
        className={`mt-0.5 flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-semibold transition ${
          isTeam ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-ink"
        }`}
      >
        T
      </button>
    </div>
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

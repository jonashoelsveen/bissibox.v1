import { Link, useRouterState } from "@tanstack/react-router";
import { Search, User2, Library, Plus } from "lucide-react";
import { useAuth } from "@/lib/auth";

export function TopChrome() {
  const router = useRouterState();
  const path = router.location.pathname;
  const { user, mode } = useAuth();

  const isOrganizer = mode === "organizer" && !!user;

  return (
    <aside className="fixed left-0 top-0 z-40 h-screen p-5 md:p-6">
      <div className="flex h-full flex-col items-center gap-2 pt-2">
        {isOrganizer ? (
          <>
            <NavBtn
              to="/organizer/library"
              label="Library"
              active={path.startsWith("/organizer/library") || path === "/"}
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
          <NavBtn to="/" label="Search" active={path === "/"}>
            <Search className="h-[18px] w-[18px]" strokeWidth={2.25} />
          </NavBtn>
        )}

        <NavBtn
          to={user ? "/profile" : "/auth"}
          label="Profile"
          active={path.startsWith("/profile") || path.startsWith("/auth")}
        >
          <User2 className="h-[18px] w-[18px]" strokeWidth={2.25} />
        </NavBtn>
      </div>
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

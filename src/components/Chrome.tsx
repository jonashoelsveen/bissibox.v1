import { Link, useRouterState } from "@tanstack/react-router";
import { Search, User2, Plus, Home } from "lucide-react";
import { useAuth } from "@/lib/auth";

export function TopChrome() {
  const router = useRouterState();
  const onSearch = router.location.pathname.startsWith("/search");
  return (
    <header className="fixed left-0 top-0 z-40 p-5 md:p-7">
      <Link
        to="/search"
        aria-label="Search"
        className={`group flex h-10 w-10 items-center justify-center rounded-full transition-all hover:bg-secondary ${
          onSearch ? "bg-primary text-primary-foreground" : "text-ink"
        }`}
      >
        <Search className="h-[18px] w-[18px]" strokeWidth={2.25} />
      </Link>
    </header>
  );
}

export function BottomChrome() {
  const { user, mode } = useAuth();
  const router = useRouterState();
  const path = router.location.pathname;

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-40 flex items-center justify-center pb-5 pt-3">
      <div className="flex items-center gap-2 rounded-full border border-hairline bg-card/80 px-2 py-2 backdrop-blur ring-soft">
        {mode === "organizer" && user && (
          <NavBtn to="/organizer/new" label="Create" active={path.startsWith("/organizer/new")}>
            <Plus className="h-[18px] w-[18px]" strokeWidth={2.25} />
          </NavBtn>
        )}
        <NavBtn to="/" label="Home" active={path === "/"}>
          <Home className="h-[18px] w-[18px]" strokeWidth={2.25} />
        </NavBtn>
        <NavBtn
          to={user ? "/profile" : "/auth"}
          label="Profile"
          active={path.startsWith("/profile") || path.startsWith("/auth")}
        >
          <User2 className="h-[18px] w-[18px]" strokeWidth={2.25} />
        </NavBtn>
      </div>
    </nav>
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
      className={`flex h-10 w-10 items-center justify-center rounded-full transition-all ${
        active ? "bg-primary text-primary-foreground" : "text-ink hover:bg-secondary"
      }`}
    >
      {children}
    </Link>
  );
}

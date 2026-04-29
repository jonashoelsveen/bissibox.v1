import { useEffect, useRef, useState } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import {
  LayoutGrid,
  Search,
  Library,
  CalendarDays,
  Tent,
  Users,
  Armchair,
  Settings,
  LogIn,
} from "lucide-react";
import { useAuth } from "@/lib/auth";

type Item = {
  to: string;
  label: string;
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
  match?: (path: string) => boolean;
};

export function AppLauncher() {
  const { user, mode } = useAuth();
  const router = useRouterState();
  const path = router.location.pathname;
  const [open, setOpen] = useState(false);
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const isOrganizer = (mode === "organizer" || mode === "team") && !!user;
  const isIndividual = !isOrganizer;

  const items: Item[] = [];
  if (!user) {
    items.push({ to: "/auth", label: "Sign in", icon: LogIn, match: (p) => p.startsWith("/auth") });
  }
  if (user && mode === "team") {
    items.push({ to: "/team/members", label: "Members", icon: Users, match: (p) => p.startsWith("/team/members") });
  }
  if (user) {
    items.push({ to: "/media", label: "Content", icon: Library, match: (p) => p.startsWith("/media") });
    items.push({ to: "/calendar", label: "Calendar", icon: CalendarDays, match: (p) => p.startsWith("/calendar") });
  }
  if (isOrganizer) {
    items.push({
      to: "/organizer/library",
      label: "My events",
      icon: Tent,
      match: (p) =>
        p.startsWith("/organizer/library") ||
        (p.startsWith("/organizer/") && !p.startsWith("/organizer/new")) ||
        p === "/",
    });
  } else {
    items.push({ to: "/", label: "Search races", icon: Search, match: (p) => p === "/" });
    if (isIndividual && user) {
      items.push({ to: "/discover", label: "Search people", icon: Search, match: (p) => p.startsWith("/discover") });
    }
  }
  if (isIndividual && user) {
    items.push({ to: "/desk", label: "Desk", icon: Armchair, match: (p) => p.startsWith("/desk") });
  }
  items.push({
    to: user ? "/settings" : "/auth",
    label: "Settings",
    icon: Settings,
    match: (p) => p.startsWith("/settings"),
  });

  // Close on outside click / Escape
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <div className="pointer-events-auto relative">
      <button
        onClick={() => setOpen((v) => !v)}
        aria-label="Open app launcher"
        aria-expanded={open}
        className={`flex h-9 w-9 items-center justify-center rounded-full transition-all ${
          open ? "bg-secondary text-ink" : "text-ink hover:bg-secondary"
        }`}
      >
        <WaffleIcon className="h-[18px] w-[18px]" />
      </button>

      {open && (
        <>
          <div
            className="fixed inset-0 z-40"
            onClick={() => setOpen(false)}
            aria-hidden
          />
          <div
            ref={panelRef}
            role="menu"
            aria-label="Apps"
            className="absolute right-0 top-full z-50 mt-2 origin-top-right"
            style={{
              animation: "launcher-bloom 320ms cubic-bezier(0.34, 1.56, 0.64, 1) both",
            }}
          >
            <div className="rounded-2xl border border-ink/10 bg-card/95 p-3 shadow-2xl backdrop-blur-xl">
              <div
                className="grid grid-cols-3 gap-1"
                onMouseLeave={() => setHoverIdx(null)}
              >
                {items.slice(0, 9).map((it, i) => {
                  const Icon = it.icon;
                  const active = it.match ? it.match(path) : false;
                  // Magnify based on distance to hovered item
                  let scale = 1;
                  if (hoverIdx !== null) {
                    const d = Math.abs(i - hoverIdx);
                    if (d === 0) scale = 1.18;
                    else if (d === 1) scale = 1.08;
                    else if (d === 2) scale = 1.02;
                  }
                  return (
                    <Link
                      key={`${it.to}-${i}`}
                      to={it.to}
                      role="menuitem"
                      onClick={() => setOpen(false)}
                      onMouseEnter={() => setHoverIdx(i)}
                      onFocus={() => setHoverIdx(i)}
                      className="group flex w-24 flex-col items-center gap-1.5 rounded-xl px-2 py-3 transition-colors hover:bg-secondary"
                      style={{
                        transform: `scale(${scale})`,
                        transition:
                          "transform 220ms cubic-bezier(0.34, 1.56, 0.64, 1), background-color 160ms ease",
                        transformOrigin: "bottom center",
                      }}
                    >
                      <span
                        className={`flex h-11 w-11 items-center justify-center rounded-xl ${
                          active
                            ? "bg-primary text-primary-foreground"
                            : "bg-secondary/60 text-ink"
                        }`}
                      >
                        <Icon className="h-5 w-5" strokeWidth={2.25} />
                      </span>
                      <span className="truncate text-[11px] font-medium text-ink">
                        {it.label}
                      </span>
                    </Link>
                  );
                })}
              </div>
            </div>
          </div>
        </>
      )}

      <style>{`
        @keyframes launcher-bloom {
          0% { opacity: 0; transform: scale(0.6) translateY(-6px); }
          60% { opacity: 1; transform: scale(1.04) translateY(0); }
          100% { opacity: 1; transform: scale(1) translateY(0); }
        }
      `}</style>
    </div>
  );
}

function WaffleIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden>
      {[
        [5, 5], [12, 5], [19, 5],
        [5, 12], [12, 12], [19, 12],
        [5, 19], [12, 19], [19, 19],
      ].map(([cx, cy], i) => (
        <circle key={i} cx={cx} cy={cy} r="1.6" fill="currentColor" />
      ))}
    </svg>
  );
}

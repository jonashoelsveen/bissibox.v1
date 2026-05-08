import { Link } from "@tanstack/react-router";

export function SearchModeToggle({ active }: { active: "races" | "teams" }) {
  return (
    <div className="inline-flex items-center rounded-full border border-hairline bg-card p-0.5 text-xs">
      <Link
        to="/"
        className={`rounded-full px-3 py-1.5 transition ${
          active === "races"
            ? "bg-primary text-primary-foreground"
            : "text-muted-foreground hover:text-ink"
        }`}
      >
        Races
      </Link>
      <Link
        to="/discover"
        className={`rounded-full px-3 py-1.5 transition ${
          active === "teams"
            ? "bg-primary text-primary-foreground"
            : "text-muted-foreground hover:text-ink"
        }`}
      >
        Teams
      </Link>
    </div>
  );
}

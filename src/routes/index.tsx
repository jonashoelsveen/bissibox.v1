import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { formatDate } from "@/lib/format";
import { ArrowUpRight } from "lucide-react";
import { RaceListItem } from "@/components/RaceListItem";
import { useAuth } from "@/lib/auth";

export const Route = createFileRoute("/")({
  component: Index,
  head: () => ({
    meta: [
      { title: "Raceline" },
      {
        name: "description",
        content:
          "Find your next race. Browse, search and sign up for running and triathlon events across Norway.",
      },
    ],
  }),
});

interface EventRow {
  id: string;
  title: string;
  organizer: string;
  location: string;
  region: string;
  starts_at: string;
  signup_fee: number;
  currency: string;
  race_types: string[];
  featured: boolean;
  world_athletics_certified?: boolean;
}

function Index() {
  const { user, mode } = useAuth();
  const nav = useNavigate();
  const [featured, setFeatured] = useState<EventRow[]>([]);
  const [upcoming, setUpcoming] = useState<EventRow[]>([]);

  useEffect(() => {
    if (mode === "organizer" && user) nav({ to: "/organizer/library" });
  }, [mode, user, nav]);

  useEffect(() => {
    (async () => {
      const { data: feat } = await supabase
        .from("events")
        .select("*")
        .eq("featured", true)
        .eq("published", true)
        .order("starts_at", { ascending: true })
        .limit(6);
      const { data: up } = await supabase
        .from("events")
        .select("*")
        .eq("published", true)
        .order("starts_at", { ascending: true })
        .limit(8);
      setFeatured((feat as EventRow[]) ?? []);
      setUpcoming((up as EventRow[]) ?? []);
    })();
  }, []);

  return (
    <div className="px-4 md:px-6">
      <header className="pt-4">
        <p className="mono text-xs uppercase tracking-[0.2em] text-muted-foreground">
          Raceline · Norway
        </p>
        <h1 className="mt-2 text-3xl leading-[1.05] text-ink md:text-5xl">
          Find your next race.
          <br />
          <span className="text-muted-foreground">Sign up in seconds.</span>
        </h1>
        <p className="mt-4 max-w-xl text-base text-muted-foreground">
          One quiet place for every race in Norway. Search like Spotify. Trust like BankID.
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <Link
            to="/search"
            className="inline-flex items-center gap-2 rounded-full bg-primary px-5 py-3 text-sm font-medium text-primary-foreground transition hover:opacity-90"
          >
            Browse races
            <ArrowUpRight className="h-4 w-4" />
          </Link>
          <Link
            to="/auth"
            className="inline-flex items-center gap-2 rounded-full border border-hairline bg-card px-5 py-3 text-sm font-medium text-ink transition hover:bg-secondary"
          >
            Create profile
          </Link>
        </div>
        <div className="mt-7 border-b border-hairline" />
      </header>

      {featured.length > 0 && (
        <section className="mt-16">
          <SectionHeader title="Featured" hint="Promoted by organizers" />
          <div className="mt-5 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {featured.map((e) => (
              <FeaturedCard key={e.id} event={e} />
            ))}
          </div>
        </section>
      )}

      <section className="mt-16">
        <SectionHeader title="Upcoming races" hint="Soonest first" />
        <ul className="mt-5 divide-y divide-hairline overflow-hidden rounded-xl border border-hairline bg-card">
          {upcoming.map((e) => (
            <RaceListItem key={e.id} event={e} />
          ))}
        </ul>
      </section>

      <footer className="mt-20 border-t border-hairline pt-8 pb-6 text-xs text-muted-foreground">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <span className="mono">© Raceline</span>
          <span>Norway · Built calmly</span>
        </div>
      </footer>
    </div>
  );
}

function SectionHeader({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="flex items-end justify-between">
      <h2 className="text-2xl text-ink md:text-3xl">{title}</h2>
      {hint && <span className="mono text-xs uppercase tracking-widest text-muted-foreground">{hint}</span>}
    </div>
  );
}

function categoryStyle(types: string[]): { label: string; color: string; surface: string; border: string } {
  const t = (types ?? []).map((s) => s.toLowerCase()).join(" ");
  if (t.includes("trail")) {
    return {
      label: "Trail",
      color: "var(--cat-trail)",
      surface: "var(--cat-trail-surface)",
      border: "color-mix(in oklab, var(--cat-trail) 30%, transparent)",
    };
  }
  if (t.includes("tri") || t.includes("swim") || t.includes("bike")) {
    return {
      label: "Triathlon",
      color: "var(--cat-tri)",
      surface: "var(--cat-tri-surface)",
      border: "color-mix(in oklab, var(--cat-tri) 30%, transparent)",
    };
  }
  if (t.includes("road") || t.includes("marathon") || t.includes("half") || t.includes("10k") || t.includes("5k")) {
    return {
      label: "Road",
      color: "var(--cat-road)",
      surface: "var(--cat-road-surface)",
      border: "color-mix(in oklab, var(--cat-road) 30%, transparent)",
    };
  }
  return {
    label: types?.[0] ?? "Race",
    color: "var(--cat-default)",
    surface: "var(--cat-default-surface)",
    border: "var(--color-hairline)",
  };
}

function FeaturedCard({ event }: { event: EventRow }) {
  const cat = categoryStyle(event.race_types);
  return (
    <Link
      to="/events/$eventId"
      params={{ eventId: event.id }}
      className="group relative flex flex-col justify-between overflow-hidden rounded-2xl border bg-card p-6 transition hover:translate-y-[-1px]"
      style={{
        borderColor: cat.border,
        background: `linear-gradient(180deg, ${cat.surface} 0%, var(--color-card) 60%)`,
      }}
    >
      <span
        aria-hidden
        className="absolute left-0 top-0 h-full w-1"
        style={{ background: cat.color }}
      />
      <div>
        <span
          className="mono inline-flex items-center gap-1.5 text-[10px] uppercase tracking-widest"
          style={{ color: cat.color }}
        >
          <span className="h-1.5 w-1.5 rounded-full" style={{ background: cat.color }} />
          {cat.label} · Featured
        </span>
        <h3 className="mt-3 text-xl text-ink">{event.title}</h3>
        <p className="mt-1 text-sm text-muted-foreground">{event.organizer}</p>
      </div>
      <div className="mt-6 flex items-end justify-between">
        <div className="mono text-xs uppercase tracking-widest text-muted-foreground">
          {event.location}
        </div>
        <div className="num text-sm text-ink">{formatDate(event.starts_at)}</div>
      </div>
    </Link>
  );
}


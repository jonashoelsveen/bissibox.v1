import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { formatDate } from "@/lib/format";
import { Search } from "lucide-react";
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

const TYPES = ["5K", "10K", "Half Marathon", "Marathon", "Trail", "Triathlon", "Relay"];
const REGIONS = ["Oslo", "Vestland", "Trøndelag", "Rogaland", "Troms", "Innlandet"];

function Index() {
  const { user, mode } = useAuth();
  const nav = useNavigate();
  const [featured, setFeatured] = useState<EventRow[]>([]);
  const [upcoming, setUpcoming] = useState<EventRow[]>([]);
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<string | null>(null);

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
        .limit(20);
      setFeatured((feat as EventRow[]) ?? []);
      setUpcoming((up as EventRow[]) ?? []);
    })();
  }, []);

  const filteredUpcoming = useMemo(() => {
    const term = q.trim().toLowerCase();
    return upcoming.filter((e) => {
      if (filter) {
        const f = filter.toLowerCase();
        const matches =
          e.race_types.some((t) => t.toLowerCase().includes(f)) ||
          (e.region ?? "").toLowerCase() === f;
        if (!matches) return false;
      }
      if (!term) return true;
      return (
        e.title.toLowerCase().includes(term) ||
        e.organizer.toLowerCase().includes(term) ||
        e.location.toLowerCase().includes(term) ||
        (e.region ?? "").toLowerCase().includes(term) ||
        e.race_types.some((t) => t.toLowerCase().includes(term))
      );
    });
  }, [q, filter, upcoming]);

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
        <div className="mt-7 border-b border-hairline" />
      </header>

      <div className="mt-8 flex justify-center">
        <label className="flex w-full max-w-md items-center gap-3 rounded-full border border-hairline bg-card px-5 py-2.5 ring-soft focus-within:border-primary">
          <Search className="h-4 w-4 text-muted-foreground" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Race, organizer, distance, region…"
            className="flex-1 bg-transparent text-sm text-ink outline-none placeholder:text-muted-foreground"
          />
          {q && (
            <button
              onClick={() => setQ("")}
              className="mono text-xs uppercase tracking-widest text-muted-foreground hover:text-ink"
            >
              clear
            </button>
          )}
        </label>
      </div>

      <div className="mx-auto mt-5 max-w-5xl">
        <div className="flex flex-wrap justify-center gap-2">
          {[...TYPES, ...REGIONS].map((t) => {
            const active = filter === t;
            return (
              <button
                key={t}
                onClick={() => setFilter(active ? null : t)}
                className={`rounded-full border px-3 py-1.5 text-xs transition ${
                  active
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-hairline bg-card text-muted-foreground hover:text-ink"
                }`}
              >
                {t}
              </button>
            );
          })}
        </div>
      </div>

      {featured.length > 0 && !q && !filter && (
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
        <SectionHeader
          title={q || filter ? `${filteredUpcoming.length} result${filteredUpcoming.length === 1 ? "" : "s"}` : "Upcoming races"}
          hint={q || filter ? undefined : "Soonest first"}
        />
        {filteredUpcoming.length === 0 ? (
          <p className="mt-5 text-sm text-muted-foreground">No races match that yet.</p>
        ) : (
          <ul className="mt-5 divide-y divide-hairline overflow-hidden rounded-xl border border-hairline bg-card">
            {filteredUpcoming.map((e) => (
              <RaceListItem key={e.id} event={e} />
            ))}
          </ul>
        )}
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


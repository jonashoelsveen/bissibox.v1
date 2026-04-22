import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { formatDate } from "@/lib/format";
import { Search as SearchIcon } from "lucide-react";
import { RaceListItem } from "@/components/RaceListItem";

export const Route = createFileRoute("/search")({
  component: SearchPage,
  head: () => ({
    meta: [
      { title: "Search races · Raceline" },
      {
        name: "description",
        content: "Search races by name, organizer, distance or region.",
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
  category: string | null;
  featured: boolean;
  popularity: number;
  world_athletics_certified?: boolean;
}

const TYPES = ["5K", "10K", "Half Marathon", "Marathon", "Trail", "Triathlon", "Relay"];
const REGIONS = ["Oslo", "Vestland", "Trøndelag", "Rogaland", "Troms", "Innlandet"];

function SearchPage() {
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<string | null>(null);
  const [all, setAll] = useState<EventRow[]>([]);

  useEffect(() => {
    supabase
      .from("events")
      .select("*")
      .order("popularity", { ascending: false })
      .then(({ data }) => setAll((data as EventRow[]) ?? []));
  }, []);

  const trending = useMemo(
    () => [...all].sort((a, b) => b.popularity - a.popularity).slice(0, 6),
    [all]
  );

  const results = useMemo(() => {
    const term = q.trim().toLowerCase();
    return all.filter((e) => {
      if (filter) {
        const matches =
          e.race_types.some((t) => t.toLowerCase().includes(filter.toLowerCase())) ||
          (e.category ?? "").toLowerCase() === filter.toLowerCase() ||
          e.region.toLowerCase() === filter.toLowerCase();
        if (!matches) return false;
      }
      if (!term) return true;
      return (
        e.title.toLowerCase().includes(term) ||
        e.organizer.toLowerCase().includes(term) ||
        e.location.toLowerCase().includes(term) ||
        e.region.toLowerCase().includes(term) ||
        e.race_types.some((t) => t.toLowerCase().includes(term))
      );
    });
  }, [q, filter, all]);

  const showResults = q.trim().length > 0 || filter !== null;

  return (
    <div className="px-4 md:px-6">
      <header className="pt-4">
        <p className="mono text-xs uppercase tracking-[0.2em] text-muted-foreground">
          Search
        </p>
        <h1 className="mt-2 text-3xl text-ink md:text-4xl">Find a race</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Search by name, organizer, distance or region.
        </p>
      </header>

      <div className="mt-6 border-b border-hairline" />

      <div className="mx-auto max-w-3xl pt-6">
        <label className="mx-auto flex max-w-2xl items-center gap-3 rounded-full border border-hairline bg-card px-5 py-3 ring-soft focus-within:border-primary">
          <SearchIcon className="h-4 w-4 text-muted-foreground" />
          <input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Race, organizer, distance, region…"
            className="flex-1 bg-transparent text-base text-ink outline-none placeholder:text-muted-foreground"
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

        <div className="mt-4 flex flex-wrap justify-center gap-2">
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

        {!showResults ? (
          <>
            <Section label="Trending now">
              <ul className="divide-y divide-hairline rounded-2xl border border-hairline bg-card">
                {trending.map((e, i) => (
                  <TrendingItem key={e.id} index={i + 1} event={e} />
                ))}
              </ul>
            </Section>

            <Section label="Browse by distance">
              <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
                {TYPES.map((t) => {
                  const c = TILE_COLORS[t] ?? TILE_COLORS._default;
                  return (
                    <button
                      key={t}
                      onClick={() => setFilter(t)}
                      className="group relative flex aspect-[5/3] flex-col justify-between overflow-hidden rounded-lg p-5 text-left transition hover:translate-y-[-2px]"
                      style={{ background: c.bg, color: c.fg }}
                    >
                      <span
                        className="mono text-[10px] uppercase tracking-widest"
                        style={{ color: c.fg, opacity: 0.75 }}
                      >
                        Distance
                      </span>
                      <span className="text-2xl font-semibold" style={{ color: c.fg }}>
                        {t}
                      </span>
                    </button>
                  );
                })}
              </div>
            </Section>
          </>
        ) : (
          <Section label={`${results.length} result${results.length === 1 ? "" : "s"}`}>
            {results.length === 0 ? (
              <p className="text-sm text-muted-foreground">No races match that yet.</p>
            ) : (
              <ul className="divide-y divide-hairline overflow-hidden rounded-xl border border-hairline bg-card">
                {results.map((e) => (
                  <RaceListItem key={e.id} event={e} />
                ))}
              </ul>
            )}
          </Section>
        )}
      </div>
    </div>
  );
}

// Spotify-like flat category tiles (Porsche/minimalist palette — solid, no gradients)
const TILE_COLORS: Record<string, { bg: string; fg: string }> = {
  "5K": { bg: "#1f3a5f", fg: "#ffffff" },           // deep navy
  "10K": { bg: "#7a4b2a", fg: "#ffffff" },          // burnt sienna
  "Half Marathon": { bg: "#2f5d4f", fg: "#ffffff" },// forest
  "Marathon": { bg: "#9b1c1c", fg: "#ffffff" },     // crimson
  "Trail": { bg: "#5a4a2f", fg: "#ffffff" },        // moss/khaki
  "Triathlon": { bg: "#2a4d6e", fg: "#ffffff" },    // ocean
  "Relay": { bg: "#6b4a7a", fg: "#ffffff" },        // muted plum
  _default: { bg: "#3a3a3a", fg: "#ffffff" },
};

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <section className="mt-10">
      <h2 className="mono text-xs uppercase tracking-[0.2em] text-muted-foreground">{label}</h2>
      <div className="mt-4">{children}</div>
    </section>
  );
}

function TrendingItem({ index, event }: { index: number; event: EventRow }) {
  return (
    <li>
      <Link
        to="/events/$eventId"
        params={{ eventId: event.id }}
        className="flex items-center gap-4 px-5 py-4 transition hover:bg-secondary"
      >
        <span className="num w-8 text-right text-2xl text-muted-foreground">{index}</span>
        <div className="min-w-0 flex-1">
          <div className="truncate text-ink">{event.title}</div>
          <div className="truncate text-xs text-muted-foreground">
            {event.organizer} · {event.location}
          </div>
        </div>
        <span className="mono text-xs text-muted-foreground">{formatDate(event.starts_at)}</span>
      </Link>
    </li>
  );
}


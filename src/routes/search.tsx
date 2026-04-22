import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
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
      .eq("published", true)
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
      <header className="flex justify-center pt-6 pb-4">
        <label className="flex w-full max-w-md items-center gap-3 rounded-full border border-hairline bg-card px-5 py-2.5 ring-soft focus-within:border-primary">
          <SearchIcon className="h-4 w-4 text-muted-foreground" />
          <input
            autoFocus
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
      </header>

      <div className="border-b border-hairline" />

      <div className="mx-auto max-w-5xl pt-6">
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

        {!showResults ? (
          <>
            <Section label="Browse by distance">
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
                {TYPES.map((t) => {
                  const c = TILE_COLORS[t] ?? TILE_COLORS._default;
                  return (
                    <button
                      key={t}
                      onClick={() => setFilter(t)}
                      className="group relative flex aspect-[5/3] overflow-hidden rounded-md p-3 text-left transition hover:translate-y-[-2px]"
                      style={{ background: c.bg, color: c.fg }}
                    >
                      <span
                        className="relative z-10 text-base font-semibold leading-tight"
                        style={{ color: c.fg }}
                      >
                        {t}
                      </span>
                      
                    </button>
                  );
                })}
              </div>
            </Section>

            <Section label="Trending now">
              <ul className="space-y-0.5">
                {trending.map((e, i) => (
                  <RaceListItem key={e.id} event={e} rank={i + 1} />
                ))}
              </ul>
            </Section>
          </>
        ) : (
          <Section label={`${results.length} result${results.length === 1 ? "" : "s"}`}>
            {results.length === 0 ? (
              <p className="text-sm text-muted-foreground">No races match that yet.</p>
            ) : (
              <ul className="space-y-0.5">
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



import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { formatDate } from "@/lib/format";
import { Search, SlidersHorizontal, ArrowUpDown, X, Check } from "lucide-react";
import { RaceListItem } from "@/components/RaceListItem";
import { SearchModeToggle } from "@/components/SearchModeToggle";
import { useAuth } from "@/lib/auth";
import { UniversalTopBar } from "@/components/NavIconTabs";

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
  country: string;
  starts_at: string;
  signup_fee: number;
  currency: string;
  race_types: string[];
  featured: boolean;
  world_athletics_certified?: boolean;
}

const TYPES = ["5K", "10K", "Half Marathon", "Marathon", "Trail", "Triathlon", "Relay"];

const COUNTRIES: Record<string, string> = {
  NO: "Norway",
  SE: "Sweden",
  DK: "Denmark",
  FI: "Finland",
  IS: "Iceland",
  GB: "United Kingdom",
  US: "United States",
  DE: "Germany",
  FR: "France",
  ES: "Spain",
  IT: "Italy",
};

type SortKey = "soonest" | "popular" | "fewest";

function Index() {
  const { user, mode } = useAuth();
  const nav = useNavigate();
  const [allEvents, setAllEvents] = useState<EventRow[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [q, setQ] = useState("");
  const [chip, setChip] = useState<string | null>(null);

  // filter panel
  const [showFilter, setShowFilter] = useState(false);
  const [showSort, setShowSort] = useState(false);
  const [country, setCountry] = useState<string>("NO");
  const [region, setRegion] = useState<string>("");
  const [organizerQ, setOrganizerQ] = useState<string>("");
  const [distMin, setDistMin] = useState<string>("");
  const [distMax, setDistMax] = useState<string>("");
  const [sort, setSort] = useState<SortKey>("soonest");

  const filterRef = useRef<HTMLDivElement>(null);
  const sortRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if ((mode === "organizer" || mode === "team") && user) nav({ to: "/organizer/library" });
  }, [mode, user, nav]);

  // pull default country from profile
  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data } = await supabase
        .from("profiles")
        .select("country")
        .eq("id", user.id)
        .maybeSingle();
      if (data?.country) setCountry(data.country);
    })();
  }, [user]);

  useEffect(() => {
    (async () => {
      const { data: ev } = await supabase
        .from("events")
        .select("*")
        .eq("published", true)
        .order("starts_at", { ascending: true });
      const list = (ev as EventRow[]) ?? [];
      setAllEvents(list);

      // Fetch registration counts in one query
      if (list.length) {
        const { data: regs } = await supabase
          .from("registrations")
          .select("event_id")
          .in("event_id", list.map((e) => e.id));
        const map: Record<string, number> = {};
        (regs ?? []).forEach((r: { event_id: string }) => {
          map[r.event_id] = (map[r.event_id] ?? 0) + 1;
        });
        setCounts(map);
      }
    })();
  }, []);

  // close popovers on outside click
  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (filterRef.current && !filterRef.current.contains(e.target as Node)) setShowFilter(false);
      if (sortRef.current && !sortRef.current.contains(e.target as Node)) setShowSort(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  // Distinct regions for selected country (from data)
  const regionsForCountry = useMemo(() => {
    const set = new Set<string>();
    allEvents.forEach((e) => {
      if ((e.country ?? "NO") === country && e.region) set.add(e.region);
    });
    return Array.from(set).sort();
  }, [allEvents, country]);

  const filterActive =
    region !== "" || organizerQ.trim() !== "" || distMin !== "" || distMax !== "" || country !== "NO";

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    let list = allEvents.filter((e) => {
      // country
      if (country && (e.country ?? "NO") !== country) return false;
      // region
      if (region && (e.region ?? "").toLowerCase() !== region.toLowerCase()) return false;
      // organizer
      if (organizerQ.trim()) {
        if (!e.organizer.toLowerCase().includes(organizerQ.trim().toLowerCase())) return false;
      }
      // distance: parse from race_types like "10K", "Half Marathon", "Marathon"
      const km = inferKm(e.race_types);
      if (distMin !== "" && km !== null && km < Number(distMin)) return false;
      if (distMax !== "" && km !== null && km > Number(distMax)) return false;

      // chip filter (type only — region chips dropped because region lives in filter)
      if (chip) {
        const f = chip.toLowerCase();
        if (!e.race_types.some((t) => t.toLowerCase().includes(f))) return false;
      }

      // text search across title, organizer, location, region (incl. comma-separated parts)
      if (term) {
        const haystack = [
          e.title,
          e.organizer,
          e.location,
          e.region,
          e.country,
          ...(e.race_types ?? []),
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        // Also split location on commas so "Gøteborg" inside "Ullevi, Gøteborg, Sweden" matches
        if (!haystack.includes(term)) return false;
      }
      return true;
    });

    // sort
    if (sort === "soonest") {
      list = list.sort((a, b) => +new Date(a.starts_at) - +new Date(b.starts_at));
    } else if (sort === "popular") {
      list = list.sort((a, b) => (counts[b.id] ?? 0) - (counts[a.id] ?? 0));
    } else if (sort === "fewest") {
      list = list.sort((a, b) => (counts[a.id] ?? 0) - (counts[b.id] ?? 0));
    }
    return list;
  }, [allEvents, q, chip, country, region, organizerQ, distMin, distMax, sort, counts]);

  const featured = useMemo(
    () => allEvents.filter((e) => e.featured).slice(0, 6),
    [allEvents],
  );

  const showFeatured = featured.length > 0 && !q && !chip && !filterActive;

  return (
    <div className="px-4 md:px-6">
      
      {user && mode !== "organizer" && mode !== "team" && (
        <div className="pt-6">
          <SearchModeToggle active="races" />
        </div>
      )}
      <header className="flex justify-center pt-8">
        <div className="flex w-full max-w-2xl items-center gap-2">
          <label className="flex flex-1 items-center gap-3 rounded-full border border-hairline bg-card px-6 py-4 ring-soft focus-within:border-primary">
            <Search className="h-5 w-5 text-muted-foreground" />
            <input
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

          {/* Filter icon */}
          <div className="relative" ref={filterRef}>
            <button
              onClick={() => {
                setShowFilter((s) => !s);
                setShowSort(false);
              }}
              aria-label="Filter"
              className={`flex h-12 w-12 items-center justify-center rounded-full border transition ${
                showFilter || filterActive
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-hairline bg-card text-muted-foreground hover:text-ink"
              }`}
            >
              <SlidersHorizontal className="h-5 w-5" />
            </button>
            {showFilter && (
              <FilterPanel
                country={country}
                setCountry={(c) => {
                  setCountry(c);
                  setRegion("");
                }}
                region={region}
                setRegion={setRegion}
                regions={regionsForCountry}
                organizerQ={organizerQ}
                setOrganizerQ={setOrganizerQ}
                distMin={distMin}
                setDistMin={setDistMin}
                distMax={distMax}
                setDistMax={setDistMax}
                onClose={() => setShowFilter(false)}
                onClear={() => {
                  setCountry("NO");
                  setRegion("");
                  setOrganizerQ("");
                  setDistMin("");
                  setDistMax("");
                }}
              />
            )}
          </div>

          {/* Sort icon */}
          <div className="relative" ref={sortRef}>
            <button
              onClick={() => {
                setShowSort((s) => !s);
                setShowFilter(false);
              }}
              aria-label="Sort"
              className={`flex h-12 w-12 items-center justify-center rounded-full border transition ${
                showSort || sort !== "soonest"
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-hairline bg-card text-muted-foreground hover:text-ink"
              }`}
            >
              <ArrowUpDown className="h-5 w-5" />
            </button>
            {showSort && (
              <SortPanel
                value={sort}
                onChange={(v) => {
                  setSort(v);
                  setShowSort(false);
                }}
              />
            )}
          </div>
        </div>
      </header>

      {/* Recommended chips (types only) */}
      <div className="mx-auto mt-5 max-w-5xl">
        <div className="flex flex-wrap justify-center gap-2">
          {TYPES.map((t) => {
            const active = chip === t;
            return (
              <button
                key={t}
                onClick={() => setChip(active ? null : t)}
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

      {showFeatured && (
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
          title={
            q || chip || filterActive
              ? `${filtered.length} result${filtered.length === 1 ? "" : "s"}`
              : "Upcoming races"
          }
          hint={
            q || chip || filterActive
              ? sortLabel(sort)
              : sort === "soonest"
                ? "Soonest first"
                : sortLabel(sort)
          }
        />
        {filtered.length === 0 ? (
          <p className="mt-5 text-sm text-muted-foreground">No races match that yet.</p>
        ) : (
          <ul className="mt-5 divide-y divide-hairline overflow-hidden rounded-xl border border-hairline bg-card">
            {filtered.map((e) => (
              <RaceListItem key={e.id} event={e} />
            ))}
          </ul>
        )}
      </section>

      <footer className="mt-20 border-t border-hairline pt-8 pb-6 text-xs text-muted-foreground">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <span className="mono">© Raceline</span>
          <span>Built calmly</span>
        </div>
      </footer>
    </div>
  );
}

function inferKm(types: string[]): number | null {
  const t = (types ?? []).map((s) => s.toLowerCase()).join(" ");
  if (t.includes("marathon") && !t.includes("half")) return 42;
  if (t.includes("half")) return 21;
  if (t.includes("10k")) return 10;
  if (t.includes("5k")) return 5;
  if (t.includes("ultra")) return 50;
  return null;
}

function sortLabel(s: SortKey) {
  if (s === "popular") return "Most participants";
  if (s === "fewest") return "Fewest participants";
  return "Soonest first";
}

function FilterPanel(props: {
  country: string;
  setCountry: (c: string) => void;
  region: string;
  setRegion: (r: string) => void;
  regions: string[];
  organizerQ: string;
  setOrganizerQ: (s: string) => void;
  distMin: string;
  setDistMin: (s: string) => void;
  distMax: string;
  setDistMax: (s: string) => void;
  onClose: () => void;
  onClear: () => void;
}) {
  return (
    <div className="absolute right-0 top-14 z-40 w-[320px] rounded-2xl border border-hairline bg-card p-5 shadow-lg ring-soft">
      <div className="flex items-center justify-between">
        <h3 className="mono text-xs uppercase tracking-widest text-muted-foreground">Filter</h3>
        <button onClick={props.onClose} className="text-muted-foreground hover:text-ink">
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="mt-4 space-y-4">
        <Field label="Country">
          <select
            value={props.country}
            onChange={(e) => props.setCountry(e.target.value)}
            className="w-full rounded-md border border-hairline bg-background px-3 py-2 text-sm text-ink outline-none focus:border-primary"
          >
            {Object.entries(COUNTRIES).map(([code, name]) => (
              <option key={code} value={code}>
                {name}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Region / City">
          {props.regions.length > 0 ? (
            <select
              value={props.region}
              onChange={(e) => props.setRegion(e.target.value)}
              className="w-full rounded-md border border-hairline bg-background px-3 py-2 text-sm text-ink outline-none focus:border-primary"
            >
              <option value="">All regions</option>
              {props.regions.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          ) : (
            <input
              value={props.region}
              onChange={(e) => props.setRegion(e.target.value)}
              placeholder="Type a region or city"
              className="w-full rounded-md border border-hairline bg-background px-3 py-2 text-sm text-ink outline-none focus:border-primary"
            />
          )}
        </Field>

        <Field label="Organizer">
          <input
            value={props.organizerQ}
            onChange={(e) => props.setOrganizerQ(e.target.value)}
            placeholder="e.g. Oslo Maraton"
            className="w-full rounded-md border border-hairline bg-background px-3 py-2 text-sm text-ink outline-none focus:border-primary"
          />
        </Field>

        <Field label="Distance (km)">
          <div className="flex items-center gap-2">
            <input
              value={props.distMin}
              onChange={(e) => props.setDistMin(e.target.value.replace(/[^0-9]/g, ""))}
              placeholder="Min"
              inputMode="numeric"
              className="w-full rounded-md border border-hairline bg-background px-3 py-2 text-sm text-ink outline-none focus:border-primary"
            />
            <span className="text-muted-foreground">–</span>
            <input
              value={props.distMax}
              onChange={(e) => props.setDistMax(e.target.value.replace(/[^0-9]/g, ""))}
              placeholder="Max"
              inputMode="numeric"
              className="w-full rounded-md border border-hairline bg-background px-3 py-2 text-sm text-ink outline-none focus:border-primary"
            />
          </div>
        </Field>
      </div>

      <div className="mt-5 flex items-center justify-between gap-2">
        <button
          onClick={props.onClear}
          className="mono text-xs uppercase tracking-widest text-muted-foreground hover:text-ink"
        >
          Clear all
        </button>
        <button
          onClick={props.onClose}
          className="rounded-full bg-primary px-4 py-2 text-xs text-primary-foreground hover:opacity-90"
        >
          Apply
        </button>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}

function SortPanel({ value, onChange }: { value: SortKey; onChange: (v: SortKey) => void }) {
  const options: { key: SortKey; label: string }[] = [
    { key: "soonest", label: "Soonest first" },
    { key: "popular", label: "Most participants" },
    { key: "fewest", label: "Fewest participants" },
  ];
  return (
    <div className="absolute right-0 top-14 z-40 w-[240px] overflow-hidden rounded-2xl border border-hairline bg-card p-1 shadow-lg ring-soft">
      {options.map((o) => {
        const active = o.key === value;
        return (
          <button
            key={o.key}
            onClick={() => onChange(o.key)}
            className={`flex w-full items-center justify-between rounded-xl px-3 py-2 text-sm ${
              active ? "bg-primary/10 text-ink" : "text-muted-foreground hover:bg-muted/50 hover:text-ink"
            }`}
          >
            {o.label}
            {active && <Check className="h-4 w-4 text-primary" />}
          </button>
        );
      })}
    </div>
  );
}

function SectionHeader({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="flex items-end justify-between">
      <h2 className="text-2xl text-ink md:text-3xl">{title}</h2>
      {hint && (
        <span className="mono text-xs uppercase tracking-widest text-muted-foreground">{hint}</span>
      )}
    </div>
  );
}

function categoryStyle(types: string[]): {
  label: string;
  color: string;
  surface: string;
  border: string;
} {
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
  if (
    t.includes("road") ||
    t.includes("marathon") ||
    t.includes("half") ||
    t.includes("10k") ||
    t.includes("5k")
  ) {
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

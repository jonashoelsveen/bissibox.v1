import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { formatDate, formatMoney } from "@/lib/format";
import { ArrowUpRight } from "lucide-react";

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
}

function Index() {
  const [featured, setFeatured] = useState<EventRow[]>([]);
  const [upcoming, setUpcoming] = useState<EventRow[]>([]);

  useEffect(() => {
    (async () => {
      const { data: feat } = await supabase
        .from("events")
        .select("*")
        .eq("featured", true)
        .order("starts_at", { ascending: true })
        .limit(6);
      const { data: up } = await supabase
        .from("events")
        .select("*")
        .order("starts_at", { ascending: true })
        .limit(8);
      setFeatured((feat as EventRow[]) ?? []);
      setUpcoming((up as EventRow[]) ?? []);
    })();
  }, []);

  return (
    <div className="mx-auto max-w-5xl px-6 md:px-10">
      <section className="pt-10 md:pt-16">
        <p className="mono text-xs uppercase tracking-[0.2em] text-muted-foreground">
          Raceline · Norway
        </p>
        <h1 className="mt-3 text-4xl leading-[1.05] text-ink md:text-6xl">
          Find your next race.
          <br />
          <span className="text-muted-foreground">Sign up in seconds.</span>
        </h1>
        <p className="mt-5 max-w-xl text-base text-muted-foreground md:text-lg">
          One quiet place for every race in Norway. Search like Spotify. Trust like BankID.
        </p>
        <div className="mt-7 flex flex-wrap gap-3">
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
      </section>

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
        <ul className="mt-5 divide-y divide-hairline rounded-2xl border border-hairline bg-card">
          {upcoming.map((e) => (
            <EventRowItem key={e.id} event={e} />
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

function FeaturedCard({ event }: { event: EventRow }) {
  return (
    <Link
      to="/events/$eventId"
      params={{ eventId: event.id }}
      className="group flex flex-col justify-between rounded-2xl border border-hairline bg-card p-6 transition hover:bg-secondary"
    >
      <div>
        <span className="mono text-[10px] uppercase tracking-widest text-accent">Featured</span>
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

function EventRowItem({ event }: { event: EventRow }) {
  return (
    <li>
      <Link
        to="/events/$eventId"
        params={{ eventId: event.id }}
        className="grid grid-cols-12 items-center gap-3 px-5 py-4 transition hover:bg-secondary md:px-6"
      >
        <div className="col-span-12 md:col-span-5">
          <div className="text-base text-ink">{event.title}</div>
          <div className="text-xs text-muted-foreground">{event.organizer}</div>
        </div>
        <div className="col-span-6 md:col-span-3 mono text-xs uppercase tracking-widest text-muted-foreground">
          {event.location}
        </div>
        <div className="col-span-3 md:col-span-2 num text-sm text-ink">{formatDate(event.starts_at)}</div>
        <div className="col-span-3 md:col-span-2 text-right num text-sm text-ink">
          {formatMoney(Number(event.signup_fee), event.currency)}
        </div>
      </Link>
    </li>
  );
}

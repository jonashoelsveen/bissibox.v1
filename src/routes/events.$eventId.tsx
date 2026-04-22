import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { formatDateLong, formatMoney, formatTime } from "@/lib/format";
import { useAuth } from "@/lib/auth";
import { toast } from "sonner";
import { ArrowLeft, CalendarDays, Heart, MapPin, Tag, Trophy } from "lucide-react";

export const Route = createFileRoute("/events/$eventId")({
  component: EventDetail,
});

interface EventRow {
  id: string;
  title: string;
  organizer: string;
  description: string | null;
  race_types: string[];
  category: string | null;
  location: string;
  region: string;
  starts_at: string;
  signup_deadline: string | null;
  signup_fee: number;
  currency: string;
  featured: boolean;
}

function EventDetail() {
  const { eventId } = Route.useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [event, setEvent] = useState<EventRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [chosen, setChosen] = useState<string | null>(null);
  const [registered, setRegistered] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [likeId, setLikeId] = useState<string | null>(null);
  const [likeBusy, setLikeBusy] = useState(false);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from("events").select("*").eq("id", eventId).maybeSingle();
      setEvent(data as EventRow | null);
      if (data) setChosen((data as EventRow).race_types[0] ?? null);
      setLoading(false);

      if (user) {
        const { data: reg } = await supabase
          .from("registrations")
          .select("id")
          .eq("user_id", user.id)
          .eq("event_id", eventId)
          .maybeSingle();
        if (reg) setRegistered(true);
        const { data: lk } = await supabase
          .from("event_likes")
          .select("id")
          .eq("user_id", user.id)
          .eq("event_id", eventId)
          .maybeSingle();
        if (lk) setLikeId((lk as { id: string }).id);
      }
    })();
  }, [eventId, user]);

  const toggleLike = async () => {
    if (!user) {
      navigate({ to: "/auth", search: { redirect: `/events/${eventId}` } });
      return;
    }
    setLikeBusy(true);
    if (likeId) {
      const { error } = await supabase.from("event_likes").delete().eq("id", likeId);
      setLikeBusy(false);
      if (error) return toast.error(error.message);
      setLikeId(null);
    } else {
      const { data, error } = await supabase
        .from("event_likes")
        .insert({ user_id: user.id, event_id: eventId })
        .select("id")
        .single();
      setLikeBusy(false);
      if (error) return toast.error(error.message);
      setLikeId((data as { id: string }).id);
      toast.success("Added to liked races.");
    }
  };

  const handleSignup = async () => {
    if (!user) {
      navigate({ to: "/auth", search: { redirect: `/events/${eventId}` } });
      return;
    }
    if (!chosen) return;
    setSubmitting(true);
    const { error } = await supabase.from("registrations").insert({
      user_id: user.id,
      event_id: eventId,
      race_type: chosen,
      status: "pending",
    });
    setSubmitting(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    setRegistered(true);
    toast.success("You're signed up. Payment will follow via Vipps.");
  };

  if (loading) return <div className="mx-auto max-w-3xl px-6 py-20 text-muted-foreground">Loading…</div>;
  if (!event) return <div className="mx-auto max-w-3xl px-6 py-20">Event not found.</div>;

  return (
    <div className="mx-auto max-w-3xl px-6 md:px-10">
      <Link
        to="/search"
        className="mt-2 inline-flex items-center gap-2 text-xs text-muted-foreground hover:text-ink"
      >
        <ArrowLeft className="h-3 w-3" /> Back to search
      </Link>

      <header className="mt-6">
        {event.featured && (
          <span className="mono text-[10px] uppercase tracking-widest text-accent">Featured</span>
        )}
        <h1 className="mt-2 text-4xl text-ink md:text-5xl">{event.title}</h1>
        <p className="mt-2 text-base text-muted-foreground">by {event.organizer}</p>
      </header>

      <dl className="mt-8 grid grid-cols-1 gap-4 md:grid-cols-2">
        <Meta icon={<CalendarDays className="h-4 w-4" />} label="Date">
          <span className="num">
            {formatDateLong(event.starts_at)} · {formatTime(event.starts_at)}
          </span>
        </Meta>
        <Meta icon={<MapPin className="h-4 w-4" />} label="Location">
          {event.location}, {event.region}
        </Meta>
        <Meta icon={<Trophy className="h-4 w-4" />} label="Distances">
          {event.race_types.join(" · ")}
        </Meta>
        <Meta icon={<Tag className="h-4 w-4" />} label="Entry fee">
          <span className="num">{formatMoney(Number(event.signup_fee), event.currency)}</span>
        </Meta>
      </dl>

      {event.description && (
        <p className="mt-8 text-base leading-relaxed text-ink">{event.description}</p>
      )}

      <section className="ticket mt-10 bg-card text-ink shadow-[0_1px_0_rgba(0,0,0,0.04),0_20px_40px_-24px_rgba(0,0,0,0.18)]">
        <div className="ticket-stub">
          <div>
            <div className="mono text-[10px] uppercase tracking-widest text-muted-foreground">
              Entry ticket
            </div>
            <h2 className="mt-1 text-xl text-ink">Sign up</h2>
          </div>
          <div className="text-right">
            <div className="mono text-[10px] uppercase tracking-widest text-muted-foreground">
              No.
            </div>
            <div className="num text-sm text-ink">
              {event.id.slice(0, 6).toUpperCase()}
            </div>
          </div>
        </div>

        <div className="ticket-perf" aria-hidden />

        <div className="ticket-body">
          <p className="text-sm text-muted-foreground">Choose your distance.</p>
          <div className="mt-4 flex flex-wrap gap-2">
            {event.race_types.map((t) => {
              const active = chosen === t;
              return (
                <button
                  key={t}
                  onClick={() => setChosen(t)}
                  disabled={registered}
                  className={`rounded-[6px] border px-4 py-2 text-sm transition ${
                    active
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-hairline bg-background text-ink hover:bg-secondary"
                  } ${registered ? "opacity-60" : ""}`}
                >
                  {t}
                </button>
              );
            })}
          </div>
          <div className="mt-6 flex items-center justify-between">
            <div>
              <div className="mono text-[10px] uppercase tracking-widest text-muted-foreground">
                Total
              </div>
              <div className="num text-2xl text-ink">
                {formatMoney(Number(event.signup_fee), event.currency)}
              </div>
            </div>
            <button
              onClick={handleSignup}
              disabled={submitting || registered || !chosen}
              className="inline-flex items-center gap-2 rounded-[8px] bg-primary px-6 py-3 text-sm font-medium text-primary-foreground transition hover:opacity-90 disabled:opacity-50"
            >
              {registered ? "Already signed up" : submitting ? "Signing up…" : "Sign up"}
            </button>
          </div>
          <p className="mt-4 mono text-[10px] uppercase tracking-widest text-muted-foreground">
            Payments by Vipps · coming soon
          </p>
        </div>
      </section>
    </div>
  );
}

function Meta({
  icon,
  label,
  children,
}: {
  icon: React.ReactNode;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-hairline bg-card p-5">
      <div className="flex items-center gap-2 text-muted-foreground">
        {icon}
        <span className="mono text-[10px] uppercase tracking-widest">{label}</span>
      </div>
      <div className="mt-2 text-base text-ink">{children}</div>
    </div>
  );
}

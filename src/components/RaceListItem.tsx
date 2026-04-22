import { Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { formatMoney } from "@/lib/format";
import { toast } from "sonner";
import { BadgeCheck } from "lucide-react";

export interface RaceListEvent {
  id: string;
  title: string;
  organizer: string;
  location: string | null;
  region?: string | null;
  starts_at: string;
  signup_fee: number;
  currency: string;
  race_types: string[];
  world_athletics_certified?: boolean;
}

const MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
const WEEKDAYS = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];

function isToday(iso: string) {
  const d = new Date(iso);
  const n = new Date();
  return (
    d.getFullYear() === n.getFullYear() &&
    d.getMonth() === n.getMonth() &&
    d.getDate() === n.getDate()
  );
}

function categoryAccent(types: string[]): string {
  const t = (types ?? []).map((s) => s.toLowerCase()).join(" ");
  if (t.includes("trail")) return "var(--cat-trail)";
  if (t.includes("tri") || t.includes("swim") || t.includes("bike")) return "var(--cat-tri)";
  return "var(--cat-road)";
}

export function RaceListItem({ event }: { event: RaceListEvent }) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  const today = isToday(event.starts_at);
  const accent = categoryAccent(event.race_types);
  const d = new Date(event.starts_at);
  const day = String(d.getDate()).padStart(2, "0");
  const mon = MONTHS[d.getMonth()];
  const wd = WEEKDAYS[d.getDay()];
  const yr = d.getFullYear();

  const handleSignup = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!user) {
      navigate({ to: "/auth", search: { redirect: `/events/${event.id}` } });
      return;
    }
    const race = event.race_types[0];
    if (!race) return;
    setSubmitting(true);
    const { error } = await supabase.from("registrations").insert({
      user_id: user.id,
      event_id: event.id,
      race_type: race,
      status: "pending",
    });
    setSubmitting(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    setDone(true);
    toast.success(`Signed up for ${event.title}`);
  };

  return (
    <li>
      <Link
        to="/events/$eventId"
        params={{ eventId: event.id }}
        className="grid grid-cols-12 items-center gap-3 px-3 py-2.5 transition hover:bg-secondary md:px-4"
        style={today ? { background: "color-mix(in oklab, var(--cat-tri-surface) 85%, transparent)" } : undefined}
      >
        {/* Date chip */}
        <div className="col-span-3 md:col-span-2 flex items-center gap-2">
          <span
            aria-hidden
            className="h-8 w-1 rounded-full"
            style={{ background: today ? "var(--cat-tri)" : accent }}
          />
          <div
            className="mono flex w-14 flex-col items-center justify-center rounded-md border px-1 py-1 text-[9px] uppercase leading-tight tracking-widest"
            style={{
              borderColor: today ? "color-mix(in oklab, var(--cat-tri) 40%, transparent)" : "var(--color-hairline)",
              background: today ? "color-mix(in oklab, var(--cat-tri) 12%, var(--color-card))" : "var(--color-card)",
              color: today ? "var(--cat-tri)" : "var(--color-muted-foreground)",
            }}
          >
            <span className="text-[8px]">{yr}</span>
            <span className="text-[8px]">{wd}</span>
            <span className="num text-sm leading-none text-ink" style={today ? { color: "var(--cat-tri)" } : undefined}>
              {day}
            </span>
            <span className="text-[8px]">{mon}</span>
          </div>
        </div>

        {/* Title + organizer */}
        <div className="col-span-9 md:col-span-5 min-w-0">
          <div className="flex items-center gap-2">
            <span className="truncate text-sm text-ink md:text-base">{event.title}</span>
            {event.world_athletics_certified && (
              <span
                title="World Athletics certified course"
                className="mono inline-flex shrink-0 items-center gap-1 rounded-sm border px-1.5 py-0.5 text-[9px] uppercase tracking-widest"
                style={{
                  borderColor: "color-mix(in oklab, var(--cat-tri) 40%, transparent)",
                  color: "var(--cat-tri)",
                  background: "var(--cat-tri-surface)",
                }}
              >
                <BadgeCheck className="h-3 w-3" />
                WA
              </span>
            )}
            {today && (
              <span
                className="mono shrink-0 rounded-sm px-1.5 py-0.5 text-[9px] uppercase tracking-widest text-primary-foreground"
                style={{ background: "var(--cat-tri)" }}
              >
                Today
              </span>
            )}
          </div>
          <div className="truncate text-xs text-muted-foreground">
            {event.organizer}
            {event.race_types?.length ? ` · ${event.race_types.join(" · ")}` : ""}
          </div>
        </div>

        {/* Location */}
        <div className="col-span-7 md:col-span-2 mono truncate text-[11px] uppercase tracking-widest text-muted-foreground">
          {event.location}
        </div>

        {/* Fee */}
        <div className="col-span-2 md:col-span-1 num text-right text-xs text-ink">
          {formatMoney(Number(event.signup_fee), event.currency)}
        </div>

        {/* Sign up button */}
        <div className="col-span-3 md:col-span-2 flex justify-end">
          <button
            onClick={handleSignup}
            disabled={submitting || done}
            className="inline-flex items-center justify-center rounded-[6px] border border-primary bg-primary px-3 py-1.5 text-[11px] font-medium uppercase tracking-widest text-primary-foreground transition hover:opacity-90 disabled:opacity-50"
          >
            {done ? "Signed up" : submitting ? "…" : "Sign up"}
          </button>
        </div>
      </Link>
    </li>
  );
}

import { Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { toast } from "sonner";
import { BadgeCheck, MoreVertical } from "lucide-react";

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

function isToday(iso: string) {
  const d = new Date(iso);
  const n = new Date();
  return (
    d.getFullYear() === n.getFullYear() &&
    d.getMonth() === n.getMonth() &&
    d.getDate() === n.getDate()
  );
}

export function RaceListItem({ event, rank }: { event: RaceListEvent; rank?: number }) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  const today = isToday(event.starts_at);
  const d = new Date(event.starts_at);
  const day = String(d.getDate()).padStart(2, "0");
  const mon = MONTHS[d.getMonth()];
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
        className="group grid grid-cols-12 items-center gap-3 rounded-md px-3 py-2.5 transition hover:bg-foreground/[0.04] md:px-4"
      >
        {/* Rank (optional) */}
        {typeof rank === "number" && (
          <div className="col-span-1 num text-right text-sm text-muted-foreground">
            {rank}
          </div>
        )}

        {/* Date — far left */}
        <div className={`${typeof rank === "number" ? "col-span-2" : "col-span-3"} mono flex items-baseline gap-1.5 text-[11px] uppercase tracking-widest text-muted-foreground`}>
          <span className="num text-base leading-none text-ink">{day}</span>
          <span>{mon}</span>
          <span className="opacity-60">{yr}</span>
        </div>

        {/* Title + organizer */}
        <div className={`${typeof rank === "number" ? "col-span-6" : "col-span-6"} min-w-0`}>
          <div className="flex items-center gap-2">
            <span className="truncate text-sm text-ink md:text-[15px]">{event.title}</span>
            {event.world_athletics_certified && (
              <span
                title="World Athletics certified course"
                className="mono inline-flex shrink-0 items-center gap-1 rounded-sm px-1 py-0.5 text-[9px] uppercase tracking-widest text-muted-foreground"
              >
                <BadgeCheck className="h-3 w-3" />
                WA
              </span>
            )}
            {today && (
              <span className="mono shrink-0 rounded-sm px-1.5 py-0.5 text-[9px] uppercase tracking-widest text-ink/80">
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
        <div className="col-span-2 mono truncate text-[11px] uppercase tracking-widest text-muted-foreground">
          {event.location}
        </div>

        {/* Sign up button + more */}
        <div className="col-span-1 flex items-center justify-end gap-1">
          <button
            onClick={handleSignup}
            disabled={submitting || done}
            className="mono inline-flex items-center justify-center rounded-full border border-hairline px-3 py-1 text-[10px] uppercase tracking-widest text-ink opacity-0 transition group-hover:opacity-100 hover:border-ink disabled:opacity-50"
          >
            {done ? "Signed" : submitting ? "…" : "Sign up"}
          </button>
          <button
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
            }}
            aria-label="More options"
            className="inline-flex h-7 w-7 items-center justify-center rounded-full text-muted-foreground transition hover:bg-foreground/[0.06] hover:text-ink"
          >
            <MoreVertical className="h-4 w-4" />
          </button>
        </div>
      </Link>
    </li>
  );
}

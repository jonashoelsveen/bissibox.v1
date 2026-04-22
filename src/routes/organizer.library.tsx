import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { formatDate } from "@/lib/format";
import { Plus, Copy, Pencil } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/organizer/library")({
  component: LibraryPage,
  head: () => ({ meta: [{ title: "Event library · Raceline Organizer" }] }),
});

interface OrgEvent {
  id: string;
  title: string;
  organizer: string;
  starts_at: string;
  location: string | null;
  signup_fee: number;
  currency: string;
  race_types: string[];
  featured: boolean;
}

function LibraryPage() {
  const { user, loading } = useAuth();
  const nav = useNavigate();
  const [events, setEvents] = useState<OrgEvent[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!loading && !user) nav({ to: "/auth" });
  }, [loading, user, nav]);

  useEffect(() => {
    if (!user) return;
    void load();
  }, [user]);

  const load = async () => {
    if (!user) return;
    const { data } = await supabase
      .from("events")
      .select("*")
      .eq("owner_id", user.id)
      .order("starts_at", { ascending: false });
    setEvents((data as OrgEvent[]) ?? []);
  };

  const duplicate = async (sourceId: string) => {
    if (!user) return;
    setBusy(true);
    try {
      const { data: src } = await supabase.from("events").select("*").eq("id", sourceId).single();
      if (!src) throw new Error("Not found");
      const { id: _id, created_at: _c, updated_at: _u, ...rest } = src as Record<string, unknown>;
      const insert = {
        ...rest,
        title: `${(rest as { title: string }).title} (copy)`,
        owner_id: user.id,
        featured: false,
      };
      const { data: inserted, error } = await supabase
        .from("events")
        .insert(insert as never)
        .select("id")
        .single();
      if (error) throw error;

      const [{ data: classes }, { data: subs }] = await Promise.all([
        supabase.from("event_classes").select("code,label,sort_order").eq("event_id", sourceId),
        supabase.from("event_subevents").select("name,starts_at,distance_km,bib_from,bib_to,max_participants,class_codes,sort_order,course_path,split_points").eq("event_id", sourceId),
      ]);
      if (classes?.length)
        await supabase.from("event_classes").insert(
          classes.map((c) => ({ ...c, event_id: inserted!.id })) as never
        );
      if (subs?.length)
        await supabase.from("event_subevents").insert(
          subs.map((s) => ({ ...s, event_id: inserted!.id })) as never
        );

      toast.success("Event duplicated.");
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not duplicate.");
    } finally {
      setBusy(false);
    }
  };

  if (!user) return <div className="mx-auto max-w-4xl px-6 py-16 text-muted-foreground">Loading…</div>;

  return (
    <div className="mx-auto max-w-5xl px-6 md:px-10">
      <header className="flex flex-wrap items-end justify-between gap-4 pt-4">
        <div>
          <p className="mono text-xs uppercase tracking-[0.2em] text-muted-foreground">Organizer · Library</p>
          <h1 className="mt-2 text-3xl text-ink md:text-4xl">Your events</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Past and upcoming events. Duplicate to use as a template.
          </p>
        </div>
        <Link
          to="/organizer/new"
          className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground transition hover:opacity-90"
        >
          <Plus className="h-4 w-4" /> New event
        </Link>
      </header>

      <section className="mt-8">
        {events.length === 0 ? (
          <div className="rounded-xl border border-dashed border-hairline bg-card/60 p-10 text-center">
            <p className="text-sm text-muted-foreground">No events yet.</p>
            <Link
              to="/organizer/new"
              className="mt-4 inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground"
            >
              <Plus className="h-4 w-4" /> Create your first event
            </Link>
          </div>
        ) : (
          <ul className="divide-y divide-hairline overflow-hidden rounded-xl border border-hairline bg-card">
            {events.map((e) => (
              <li key={e.id} className="flex items-center gap-4 px-5 py-4">
                <div className="min-w-0 flex-1">
                  <div className="truncate text-ink">{e.title}</div>
                  <div className="truncate text-xs text-muted-foreground">
                    {e.organizer} · {e.location ?? "—"} · {e.race_types.join(", ")}
                  </div>
                </div>
                <span className="num text-sm text-ink">{formatDate(e.starts_at)}</span>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => duplicate(e.id)}
                    disabled={busy}
                    aria-label="Duplicate"
                    className="rounded-md border border-hairline bg-background p-2 text-muted-foreground transition hover:text-ink disabled:opacity-50"
                  >
                    <Copy className="h-4 w-4" />
                  </button>
                  <Link
                    to="/organizer/$eventId/edit"
                    params={{ eventId: e.id }}
                    aria-label="Edit"
                    className="rounded-md border border-hairline bg-background p-2 text-muted-foreground transition hover:text-ink"
                  >
                    <Pencil className="h-4 w-4" />
                  </Link>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

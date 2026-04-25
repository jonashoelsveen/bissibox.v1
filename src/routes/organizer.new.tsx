import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { toast } from "sonner";
import { X, Plus, Users, Calendar, Flag } from "lucide-react";

export const Route = createFileRoute("/organizer/new")({
  component: NewEventModal,
  head: () => ({ meta: [{ title: "New event · Raceline Organizer" }] }),
});

type EventType = "meeting" | "event" | "race";

function NewEventModal() {
  const nav = useNavigate();
  const { user, loading, activeEntityId } = useAuth();
  const [title, setTitle] = useState("");
  const [organizer, setOrganizer] = useState("");
  const [startsAt, setStartsAt] = useState("");
  const [eventType, setEventType] = useState<EventType>("race");
  const [busy, setBusy] = useState(false);
  const [entityChecked, setEntityChecked] = useState(false);

  useEffect(() => {
    if (!loading && !user) nav({ to: "/auth" });
  }, [loading, user, nav]);

  // Only entities can create events. Auto-fill organizer with the entity's name.
  useEffect(() => {
    if (!user) return;
    if (!activeEntityId) {
      setEntityChecked(true);
      return;
    }
    void (async () => {
      const { data } = await supabase
        .from("teams")
        .select("name")
        .eq("id", activeEntityId)
        .maybeSingle();
      if (data?.name) setOrganizer(data.name);
      setEntityChecked(true);
    })();
  }, [user, activeEntityId]);

  const close = () => nav({ to: "/organizer/library" });

  const create = async () => {
    if (!user) return;
    if (!activeEntityId) {
      toast.error("Switch to an entity to create events.");
      return;
    }
    if (!title.trim() || !organizer.trim() || !startsAt) {
      toast.error("Name, organizer and date are required.");
      return;
    }
    setBusy(true);
    try {
      const { data, error } = await supabase
        .from("events")
        .insert({
          title: title.trim(),
          organizer: organizer.trim(),
          starts_at: new Date(startsAt).toISOString(),
          owner_id: user.id,
          event_type: eventType,
          team_id: activeEntityId,
        } as never)
        .select("id")
        .single();
      if (error) throw error;
      nav({ to: "/organizer/$eventId/edit", params: { eventId: data!.id } });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not create event.");
    } finally {
      setBusy(false);
    }
  };

  // Block individual users — only entities can create events.
  if (entityChecked && !activeEntityId) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="absolute inset-0 bg-ink/40 backdrop-blur-sm" onClick={close} />
        <div className="relative z-10 w-full max-w-md overflow-hidden rounded-xl border border-hairline bg-card shadow-2xl">
          <header className="flex items-center justify-between border-b border-hairline px-5 py-3.5">
            <div>
              <p className="mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">Organizer</p>
              <h2 className="mt-0.5 text-lg text-ink">Create event</h2>
            </div>
            <button
              onClick={close}
              aria-label="Close"
              className="rounded-md p-1.5 text-muted-foreground transition hover:bg-secondary hover:text-ink"
            >
              <X className="h-4 w-4" />
            </button>
          </header>
          <div className="space-y-3 px-5 py-6">
            <p className="text-sm text-ink">Events can only be created from an entity.</p>
            <p className="text-xs text-muted-foreground">
              Switch into a team, club, company or cooperation from the top-left switcher, then try again.
            </p>
          </div>
          <footer className="flex items-center justify-end gap-2 border-t border-hairline bg-background/60 px-5 py-3">
            <button
              onClick={close}
              className="rounded-md border border-hairline bg-card px-4 py-1.5 text-sm text-ink transition hover:bg-secondary"
            >
              Close
            </button>
          </footer>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-ink/40 backdrop-blur-sm" onClick={close} />
      <div className="relative z-10 w-full max-w-md overflow-hidden rounded-xl border border-hairline bg-card shadow-2xl">
        <header className="flex items-center justify-between border-b border-hairline px-5 py-3.5">
          <div>
            <p className="mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">Organizer</p>
            <h2 className="mt-0.5 text-lg text-ink">Create event</h2>
          </div>
          <button
            onClick={close}
            aria-label="Close"
            className="rounded-md p-1.5 text-muted-foreground transition hover:bg-secondary hover:text-ink"
          >
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="space-y-4 px-5 py-5">
          <p className="text-xs text-muted-foreground">
            Just the basics to get started. You can edit everything else on the next page.
          </p>

          <Field label="Event name">
            <input
              autoFocus
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Perseløpet #7 — 2026"
              className="w-full rounded-md border border-hairline bg-background px-3 py-2 text-sm text-ink outline-none focus:border-primary"
            />
          </Field>

          <Field label="Organizer">
            <input
              value={organizer}
              readOnly
              title="Organizer is the entity creating the event."
              className="w-full cursor-not-allowed rounded-md border border-hairline bg-secondary/40 px-3 py-2 text-sm text-ink outline-none"
            />
          </Field>

          <Field label="Date & start">
            <input
              type="datetime-local"
              value={startsAt}
              onChange={(e) => setStartsAt(e.target.value)}
              className="w-full rounded-md border border-hairline bg-background px-3 py-2 text-sm text-ink outline-none focus:border-primary"
            />
          </Field>

          <Field label="Event type">
            <div className="grid grid-cols-3 gap-2">
              <TypeOption
                active={eventType === "meeting"}
                onClick={() => setEventType("meeting")}
                icon={<Users className="h-3.5 w-3.5" />}
                label="Meeting"
              />
              <TypeOption
                active={eventType === "event"}
                onClick={() => setEventType("event")}
                icon={<Calendar className="h-3.5 w-3.5" />}
                label="Event"
              />
              <TypeOption
                active={eventType === "race"}
                onClick={() => setEventType("race")}
                icon={<Flag className="h-3.5 w-3.5" />}
                label="Race"
              />
            </div>
          </Field>
        </div>

        <footer className="flex items-center justify-end gap-2 border-t border-hairline bg-background/60 px-5 py-3">
          <button
            onClick={close}
            className="rounded-md border border-hairline bg-card px-4 py-1.5 text-sm text-ink transition hover:bg-secondary"
          >
            Cancel
          </button>
          <button
            onClick={create}
            disabled={busy}
            className="inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-1.5 text-sm font-medium text-primary-foreground transition hover:opacity-90 disabled:opacity-50"
          >
            <Plus className="h-3.5 w-3.5" />
            {busy ? "Creating…" : "Create"}
          </button>
        </footer>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mono mb-1.5 block text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
        {label}
      </span>
      {children}
    </label>
  );
}

function TypeOption({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center justify-center gap-1.5 rounded-md border px-2.5 py-2 text-xs font-medium transition ${
        active
          ? "border-primary bg-primary/10 text-primary"
          : "border-hairline bg-card text-ink hover:bg-secondary"
      }`}
    >
      {icon}
      {label}
    </button>
  );
}

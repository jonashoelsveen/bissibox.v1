import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { toast } from "sonner";
import { X, Plus } from "lucide-react";

export const Route = createFileRoute("/organizer/new")({
  component: NewEventModal,
  head: () => ({ meta: [{ title: "New event · Raceline Organizer" }] }),
});

function NewEventModal() {
  const nav = useNavigate();
  const { user, loading } = useAuth();
  const [title, setTitle] = useState("");
  const [organizer, setOrganizer] = useState("");
  const [startsAt, setStartsAt] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!loading && !user) nav({ to: "/auth" });
  }, [loading, user, nav]);

  // Prefill organizer with the user's name/email if available.
  useEffect(() => {
    if (!user) return;
    void (async () => {
      const { data } = await supabase
        .from("profiles")
        .select("first_name,last_name,email")
        .eq("id", user.id)
        .maybeSingle();
      const name = [data?.first_name, data?.last_name].filter(Boolean).join(" ").trim();
      setOrganizer(name || data?.email || user.email || "");
    })();
  }, [user]);

  const close = () => nav({ to: "/organizer/library" });

  const create = async () => {
    if (!user) return;
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
              onChange={(e) => setOrganizer(e.target.value)}
              placeholder="Your club or company"
              className="w-full rounded-md border border-hairline bg-background px-3 py-2 text-sm text-ink outline-none focus:border-primary"
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

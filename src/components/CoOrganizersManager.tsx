import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Plus, Trash2, UserPlus } from "lucide-react";

interface Props {
  eventId: string | undefined;
  ownerId: string | null;
  currentUserId: string;
}

interface CoOrgRow {
  id: string;
  user_id: string;
  display: string;
}

export function CoOrganizersManager({ eventId, ownerId, currentUserId }: Props) {
  const [rows, setRows] = useState<CoOrgRow[]>([]);
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const isOwner = !!ownerId && ownerId === currentUserId;

  useEffect(() => {
    if (!eventId) return;
    void load();
  }, [eventId]);

  const load = async () => {
    if (!eventId) return;
    const { data: links } = await supabase
      .from("event_co_organizers")
      .select("id,user_id")
      .eq("event_id", eventId);
    if (!links?.length) {
      setRows([]);
      return;
    }
    const ids = links.map((l) => l.user_id);
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id,first_name,last_name,email")
      .in("id", ids);
    const profMap = new Map((profiles ?? []).map((p) => [p.id, p]));
    setRows(
      links.map((l) => {
        const p = profMap.get(l.user_id);
        const name = [p?.first_name, p?.last_name].filter(Boolean).join(" ").trim();
        return {
          id: l.id,
          user_id: l.user_id,
          display: name || p?.email || l.user_id,
        };
      }),
    );
  };

  const add = async () => {
    if (!eventId || !email.trim()) return;
    setBusy(true);
    try {
      const { data: prof, error: pErr } = await supabase
        .from("profiles")
        .select("id")
        .eq("email", email.trim().toLowerCase())
        .maybeSingle();
      if (pErr) throw pErr;
      if (!prof) {
        toast.error("No user with that email. They need to sign up first.");
        return;
      }
      if (prof.id === currentUserId) {
        toast.error("You're already the owner of this event.");
        return;
      }
      const { error } = await supabase
        .from("event_co_organizers")
        .insert({ event_id: eventId, user_id: prof.id } as never);
      if (error) {
        if (error.code === "23505") toast.error("Already a co-organizer.");
        else throw error;
        return;
      }
      setEmail("");
      toast.success("Co-organizer added.");
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not add co-organizer.");
    } finally {
      setBusy(false);
    }
  };

  const remove = async (id: string) => {
    setBusy(true);
    const { error } = await supabase.from("event_co_organizers").delete().eq("id", id);
    setBusy(false);
    if (error) return toast.error(error.message);
    await load();
  };

  if (!eventId) {
    return (
      <p className="text-xs text-muted-foreground">
        Save the event first, then invite co-organizers by email.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {rows.length === 0 ? (
        <p className="text-xs text-muted-foreground">No co-organizers yet.</p>
      ) : (
        <ul className="divide-y divide-hairline overflow-hidden rounded-md border border-hairline">
          {rows.map((r) => (
            <li key={r.id} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
              <span className="truncate text-ink">{r.display}</span>
              {isOwner && (
                <button
                  onClick={() => remove(r.id)}
                  disabled={busy}
                  aria-label="Remove"
                  className="rounded p-1 text-muted-foreground hover:text-rose-500 disabled:opacity-50"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {isOwner && (
        <div className="flex gap-2">
          <div className="flex flex-1 items-center gap-2 rounded-md border border-hairline bg-background px-3 py-2">
            <UserPlus className="h-4 w-4 text-muted-foreground" />
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="co-organizer@example.com"
              className="flex-1 bg-transparent text-sm text-ink outline-none placeholder:text-muted-foreground"
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  void add();
                }
              }}
            />
          </div>
          <button
            onClick={add}
            disabled={busy || !email.trim()}
            className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground transition hover:opacity-90 disabled:opacity-50"
          >
            <Plus className="h-3.5 w-3.5" /> Add
          </button>
        </div>
      )}
    </div>
  );
}

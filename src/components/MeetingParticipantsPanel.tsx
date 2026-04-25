import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { toast } from "sonner";
import { Plus, Trash2, Send, Users } from "lucide-react";

interface Props {
  eventId: string;
  teamId: string | null;
}

interface GroupRow {
  id: string;
  name: string;
}

export function MeetingParticipantsPanel({ eventId, teamId }: Props) {
  const { user } = useAuth();
  const [groups, setGroups] = useState<GroupRow[]>([]);
  const [includeBoard, setIncludeBoard] = useState(false);
  const [groupSel, setGroupSel] = useState<Record<string, string | undefined>>({}); // groupId -> audience row id
  const [invites, setInvites] = useState<{ id: string; email: string }[]>([]);
  const [drafts, setDrafts] = useState<string[]>([""]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void (async () => {
      if (teamId) {
        const { data: g } = await supabase
          .from("team_groups")
          .select("id, name")
          .eq("team_id", teamId)
          .order("name");
        setGroups((g as GroupRow[]) ?? []);
      }
      const { data: aud } = await supabase
        .from("meeting_audience")
        .select("id, include_board, group_id")
        .eq("event_id", eventId);
      const sel: Record<string, string> = {};
      let board = false;
      (aud ?? []).forEach((r: { id: string; include_board: boolean; group_id: string | null }) => {
        if (r.include_board) board = true;
        if (r.group_id) sel[r.group_id] = r.id;
      });
      setIncludeBoard(board);
      setGroupSel(sel);

      const { data: inv } = await supabase
        .from("meeting_invites")
        .select("id, email")
        .eq("event_id", eventId)
        .order("invited_at");
      setInvites((inv as { id: string; email: string }[]) ?? []);
    })();
  }, [eventId, teamId]);

  async function toggleBoard(next: boolean) {
    setIncludeBoard(next);
    if (next) {
      const { error } = await supabase
        .from("meeting_audience")
        .insert({ event_id: eventId, include_board: true } as never);
      if (error) {
        toast.error(error.message);
        setIncludeBoard(false);
      }
    } else {
      await supabase
        .from("meeting_audience")
        .delete()
        .eq("event_id", eventId)
        .eq("include_board", true)
        .is("group_id", null);
    }
  }

  async function toggleGroup(groupId: string, next: boolean) {
    if (next) {
      const { data, error } = await supabase
        .from("meeting_audience")
        .insert({ event_id: eventId, group_id: groupId } as never)
        .select("id")
        .single();
      if (error) return toast.error(error.message);
      setGroupSel((s) => ({ ...s, [groupId]: (data as { id: string }).id }));
    } else {
      const id = groupSel[groupId];
      if (id) await supabase.from("meeting_audience").delete().eq("id", id);
      setGroupSel((s) => {
        const { [groupId]: _, ...rest } = s;
        return rest;
      });
    }
  }

  async function sendInvites() {
    const clean = drafts.map((d) => d.trim()).filter((d) => d && /.+@.+\..+/.test(d));
    if (!clean.length) {
      toast.error("Add at least one email.");
      return;
    }
    setBusy(true);
    const rows = clean.map((email) => ({
      event_id: eventId,
      email,
      invited_by: user?.id ?? null,
    }));
    const { data, error } = await supabase
      .from("meeting_invites")
      .upsert(rows as never, { onConflict: "event_id,email" })
      .select("id, email");
    setBusy(false);
    if (error) return toast.error(error.message);
    const fresh = (data as { id: string; email: string }[]) ?? [];
    setInvites((cur) => {
      const map = new Map(cur.map((r) => [r.email, r]));
      fresh.forEach((r) => map.set(r.email, r));
      return Array.from(map.values());
    });
    setDrafts([""]);
    toast.success(`Invited ${fresh.length} ${fresh.length === 1 ? "person" : "people"}.`);
  }

  async function removeInvite(id: string) {
    const { error } = await supabase.from("meeting_invites").delete().eq("id", id);
    if (error) return toast.error(error.message);
    setInvites((arr) => arr.filter((r) => r.id !== id));
  }

  return (
    <div className="mt-5 space-y-6 rounded-lg border border-hairline bg-card p-5">
      <section>
        <header className="mb-3 flex items-center gap-2">
          <Users className="h-4 w-4 text-muted-foreground" />
          <h3 className="text-sm font-medium text-ink">Choose participants</h3>
        </header>

        {!teamId && (
          <p className="text-xs text-muted-foreground">
            This event isn't linked to an entity, so its board and groups can't be selected.
          </p>
        )}

        {teamId && (
          <div className="space-y-2">
            <label className="flex items-center gap-2 rounded-md border border-hairline bg-background px-3 py-2 text-sm text-ink">
              <input
                type="checkbox"
                checked={includeBoard}
                onChange={(e) => toggleBoard(e.target.checked)}
                className="h-4 w-4 accent-primary"
              />
              <span className="font-medium">Board</span>
              <span className="ml-auto text-xs text-muted-foreground">All board members</span>
            </label>

            {groups.length === 0 ? (
              <p className="text-xs text-muted-foreground">This entity has no groups yet.</p>
            ) : (
              groups.map((g) => {
                const checked = !!groupSel[g.id];
                return (
                  <label
                    key={g.id}
                    className="flex items-center gap-2 rounded-md border border-hairline bg-background px-3 py-2 text-sm text-ink"
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={(e) => toggleGroup(g.id, e.target.checked)}
                      className="h-4 w-4 accent-primary"
                    />
                    <span>{g.name}</span>
                  </label>
                );
              })
            )}
          </div>
        )}
      </section>

      <section>
        <header className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-medium text-ink">Invite by email</h3>
          <button
            type="button"
            onClick={() => setDrafts((d) => [...d, ""])}
            className="inline-flex items-center gap-1 rounded-md border border-hairline bg-card px-2.5 py-1 text-xs text-ink transition hover:bg-secondary"
          >
            <Plus className="h-3 w-3" />
            Invite new
          </button>
        </header>

        <div className="space-y-2">
          {drafts.map((d, i) => (
            <div key={i} className="flex items-center gap-2">
              <input
                type="email"
                value={d}
                onChange={(e) =>
                  setDrafts((arr) => arr.map((x, ix) => (ix === i ? e.target.value : x)))
                }
                placeholder="name@example.com"
                className="flex-1 rounded-md border border-hairline bg-background px-3 py-2 text-sm text-ink outline-none focus:border-primary"
              />
              {drafts.length > 1 && (
                <button
                  type="button"
                  onClick={() => setDrafts((arr) => arr.filter((_, ix) => ix !== i))}
                  className="rounded p-1 text-muted-foreground transition hover:text-destructive"
                  aria-label="Remove"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          ))}
          <button
            type="button"
            onClick={sendInvites}
            disabled={busy}
            className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground transition hover:opacity-90 disabled:opacity-50"
          >
            <Send className="h-3 w-3" />
            {busy ? "Inviting…" : "Invite"}
          </button>
        </div>

        {invites.length > 0 && (
          <ul className="mt-4 space-y-1.5">
            {invites.map((inv) => (
              <li
                key={inv.id}
                className="flex items-center justify-between rounded-md border border-hairline bg-background px-3 py-1.5 text-xs text-ink"
              >
                <span>{inv.email}</span>
                <button
                  onClick={() => removeInvite(inv.id)}
                  className="text-muted-foreground transition hover:text-destructive"
                  aria-label="Remove invite"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

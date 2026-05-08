import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";

export type CreateContainerKind = "meeting" | "note" | "files" | "media";

/**
 * Parent-level dialog for creating a Folder (meetings/notes/files) or Album
 * (media) from any Library tab. The user does NOT get navigated away — the
 * new container is inserted directly and the side nav refreshes via the
 * shared `library:refresh` event so it appears under its category immediately.
 */
export function CreateContainerDialog({
  kind,
  onClose,
}: {
  kind: CreateContainerKind;
  onClose: () => void;
}) {
  const { user, mode, activeEntityId } = useAuth();
  const isTeamMode = mode === "team" || mode === "organizer" || !!activeEntityId;
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [teamId, setTeamId] = useState<string | null>(null);

  const isAlbum = kind === "media";
  const title = isAlbum ? "New album" : "New folder";

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!user || !isTeamMode) { setTeamId(null); return; }
      let team: { id: string } | null = null;
      if (activeEntityId) {
        const { data } = await supabase.from("teams").select("id").eq("id", activeEntityId).maybeSingle();
        team = data ?? null;
      }
      if (!team) {
        const { data } = await supabase.from("teams").select("id").eq("owner_id", user.id)
          .order("created_at", { ascending: true }).limit(1).maybeSingle();
        team = data ?? null;
      }
      if (!cancelled) setTeamId(team?.id ?? null);
    })();
    return () => { cancelled = true; };
  }, [user, isTeamMode, activeEntityId]);

  const create = async () => {
    if (!user || !name.trim() || busy) return;
    setBusy(true);
    const userId = user.id;
    const tId = isTeamMode ? teamId : null;

    const tableMap = {
      meeting: "meeting_folders",
      note: "note_folders",
      files: "file_folders",
      media: "media_albums",
    } as const;
    const table = tableMap[kind];

    // Compute next sort_order in scope.
    const scopeQ = supabase.from(table).select("sort_order").order("sort_order", { ascending: false }).limit(1);
    const { data: maxRows } = tId
      ? await scopeQ.eq("team_id", tId)
      : await scopeQ.is("team_id", null).eq("user_id", userId);
    const nextOrder = ((maxRows?.[0]?.sort_order as number | undefined) ?? -1) + 1;

    const { error } = await supabase
      .from(table)
      .insert({ user_id: userId, team_id: tId, name: name.trim(), sort_order: nextOrder });
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    toast.success(isAlbum ? "Album created" : "Folder created");
    window.dispatchEvent(new Event("library:refresh"));
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 animate-in fade-in"
      onClick={onClose}
    >
      <div className="absolute inset-0 bg-black/60" />
      <div
        className="relative z-10 w-full max-w-md rounded-2xl border border-hairline bg-card p-6 shadow-2xl animate-in zoom-in-95 slide-in-from-bottom-2 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-sm font-medium text-ink">{title}</h2>
          <button onClick={onClose} className="rounded-full p-1.5 text-muted-foreground hover:bg-secondary">
            <X className="h-4 w-4" />
          </button>
        </div>
        <label className="block">
          <span className="mono text-[10px] uppercase tracking-widest text-muted-foreground">Name</span>
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void create(); } }}
            placeholder={isAlbum ? "Album name" : "Folder name"}
            className="mt-1 w-full rounded-xl border border-hairline bg-background px-4 py-2.5 text-sm text-ink outline-none focus:border-primary"
          />
        </label>
        <div className="mt-6 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="rounded-full border border-hairline bg-card px-4 py-2 text-xs text-muted-foreground hover:text-ink"
          >
            Cancel
          </button>
          <button
            onClick={create}
            disabled={busy || !name.trim()}
            className="rounded-full bg-primary px-5 py-2 text-xs text-primary-foreground hover:opacity-90 disabled:opacity-50"
          >
            {busy ? "Creating…" : "Create"}
          </button>
        </div>
      </div>
    </div>
  );
}

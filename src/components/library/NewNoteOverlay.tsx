import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { toast } from "sonner";
import { NewNoteDialog } from "@/components/library/NotesPage";

export function NewNoteOverlay({ onClose }: { onClose: () => void }) {
  const { user, mode, activeEntityId } = useAuth();
  const isTeamMode = mode === "team" || mode === "organizer" || !!activeEntityId;
  const nav = useNavigate();
  const [folders, setFolders] = useState<string[]>([]);
  const [teamId, setTeamId] = useState<string | null>(null);

  const loadCtx = useCallback(async () => {
    if (!user) return;
    if (isTeamMode) {
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
      if (!team) { setTeamId(null); setFolders([]); return; }
      setTeamId(team.id);
      const { data: f } = await supabase.from("note_folders").select("name").eq("team_id", team.id);
      setFolders(((f ?? []) as { name: string }[]).map((x) => x.name));
    } else {
      setTeamId(null);
      const { data: f } = await supabase.from("note_folders").select("name")
        .is("team_id", null).eq("user_id", user.id);
      setFolders(((f ?? []) as { name: string }[]).map((x) => x.name));
    }
  }, [user, isTeamMode, activeEntityId]);

  useEffect(() => { void loadCtx(); }, [loadCtx]);

  if (!user) return null;

  return (
    <NewNoteDialog
      folders={folders}
      onClose={onClose}
      onCreate={async (title, folder) => {
        const { data, error } = await supabase
          .from("notes")
          .insert({
            user_id: user.id,
            team_id: isTeamMode ? teamId : null,
            title: title || "Untitled note",
            folder: folder || null,
          })
          .select("id")
          .single();
        if (error) { toast.error(error.message); return; }
        toast.success("Note created");
        onClose();
        nav({ to: "/media", search: { tab: "notes", open: data!.id } });
      }}
      onCreateFolder={async (name) => {
        const { error } = await supabase
          .from("note_folders")
          .insert({ user_id: user.id, team_id: isTeamMode ? teamId : null, name });
        if (error) { toast.error(error.message); return false; }
        await loadCtx();
        return true;
      }}
    />
  );
}

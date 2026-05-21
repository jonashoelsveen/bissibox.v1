/**
 * useLibraryAlbums — fetches media albums for the active profile (individual
 * or team/organizer). Used by the "Me" / "We" hover menu in the top tab bar
 * to list albums that can be opened as tabs on the Library page.
 */
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";

export interface AlbumLite {
  id: string;
  name: string;
  pinned: boolean | null;
  color: string | null;
}

export function useLibraryAlbums(enabled: boolean = true): {
  albums: AlbumLite[];
  loading: boolean;
} {
  const { user, mode, activeEntityId } = useAuth();
  const isTeamMode = mode === "team" || mode === "organizer" || !!activeEntityId;
  const [albums, setAlbums] = useState<AlbumLite[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!user) {
      setAlbums([]);
      return;
    }
    setLoading(true);
    try {
      let teamId: string | null = null;
      if (isTeamMode) {
        if (activeEntityId) {
          teamId = activeEntityId;
        } else {
          const { data } = await supabase
            .from("teams")
            .select("id")
            .eq("owner_id", user.id)
            .order("created_at", { ascending: true })
            .limit(1)
            .maybeSingle();
          teamId = data?.id ?? null;
        }
      }
      const q = supabase
        .from("media_albums")
        .select("id,name,pinned,color,member_user_id")
        .order("pinned", { ascending: false })
        .order("sort_order", { ascending: true });
      const { data } = await (isTeamMode && teamId
        ? q.eq("team_id", teamId)
        : q.is("team_id", null).eq("user_id", user.id));
      const rows = (data ?? []) as Array<AlbumLite & { member_user_id: string | null }>;
      setAlbums(
        rows
          .filter((a) => !a.member_user_id)
          .map(({ id, name, pinned, color }) => ({ id, name, pinned, color })),
      );
    } finally {
      setLoading(false);
    }
  }, [user, isTeamMode, activeEntityId]);

  useEffect(() => {
    if (!enabled) return;
    void load();
    const onLocal = () => void load();
    window.addEventListener("library:refresh", onLocal);
    return () => window.removeEventListener("library:refresh", onLocal);
  }, [enabled, load]);

  return { albums, loading };
}

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { StickyNote, FolderClosed, Image as ImageIcon } from "lucide-react";

type PreviousItem = {
  id: string;
  kind: "note" | "file" | "media";
  title: string;
  updated_at: string;
};

export function PreviousPage({
  onOpenNote,
  onOpenTab,
}: {
  onOpenNote: (id: string) => void;
  onOpenTab: (tab: "files" | "media") => void;
}) {
  const { user, mode, activeEntityId } = useAuth();
  const isTeamMode = mode === "team" || mode === "organizer" || !!activeEntityId;
  const [items, setItems] = useState<PreviousItem[] | null>(null);

  const load = useCallback(async () => {
    if (!user) return;
    let teamId: string | null = null;
    if (isTeamMode) {
      const q = activeEntityId
        ? supabase.from("teams").select("id").eq("id", activeEntityId).maybeSingle()
        : supabase
            .from("teams")
            .select("id")
            .eq("owner_id", user.id)
            .order("created_at", { ascending: true })
            .limit(1)
            .maybeSingle();
      const { data } = await q;
      teamId = data?.id ?? null;
    }
    const scope = <T,>(q: T): T =>
      (isTeamMode && teamId
        ? (q as any).eq("team_id", teamId)
        : (q as any).is("team_id", null).eq("user_id", user.id)) as T;

    const [{ data: notes }, { data: files }, { data: media }] = await Promise.all([
      scope(
        supabase
          .from("notes")
          .select("id,title,updated_at")
          .order("updated_at", { ascending: false })
          .limit(20),
      ),
      scope(
        supabase
          .from("files")
          .select("id,name,created_at")
          .order("created_at", { ascending: false })
          .limit(20),
      ),
      scope(
        supabase
          .from("media")
          .select("id,storage_path,created_at")
          .order("created_at", { ascending: false })
          .limit(20),
      ),
    ]);

    const merged: PreviousItem[] = [
      ...((notes ?? []) as any[]).map((n) => ({
        id: n.id,
        kind: "note" as const,
        title: n.title || "Untitled note",
        updated_at: n.updated_at,
      })),
      ...((files ?? []) as any[]).map((f) => ({
        id: f.id,
        kind: "file" as const,
        title: f.name || "Untitled file",
        updated_at: f.created_at,
      })),
      ...((media ?? []) as any[]).map((m) => ({
        id: m.id,
        kind: "media" as const,
        title: (m.storage_path as string).split("/").pop() || "Media",
        updated_at: m.created_at,
      })),
    ]
      .sort((a, b) => b.updated_at.localeCompare(a.updated_at))
      .slice(0, 30);

    setItems(merged);
  }, [user, isTeamMode, activeEntityId]);

  useEffect(() => {
    void load();
  }, [load]);

  if (items === null) {
    return <div className="px-2 py-12 text-center text-sm text-muted-foreground">Loading…</div>;
  }
  if (items.length === 0) {
    return (
      <div className="px-2 py-16 text-center text-sm text-muted-foreground">
        No items yet. Create your first note, file or album.
      </div>
    );
  }

  return (
    <div className="pt-4">
      <h2 className="mb-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">
        Recently edited
      </h2>
      <ul className="flex flex-col divide-y divide-hairline rounded-md border border-hairline">
        {items.map((it) => {
          const Icon =
            it.kind === "note" ? StickyNote : it.kind === "file" ? FolderClosed : ImageIcon;
          return (
            <li key={`${it.kind}:${it.id}`}>
              <button
                onClick={() => {
                  if (it.kind === "note") onOpenNote(it.id);
                  else onOpenTab(it.kind);
                }}
                className="flex w-full items-center gap-3 px-3 py-2.5 text-left text-sm transition hover:bg-secondary/60"
              >
                <Icon className="h-4 w-4 shrink-0 text-muted-foreground" strokeWidth={2.25} />
                <span className="min-w-0 flex-1 truncate text-ink">{it.title}</span>
                <span className="shrink-0 text-xs text-muted-foreground mono">
                  {new Date(it.updated_at).toLocaleDateString()}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

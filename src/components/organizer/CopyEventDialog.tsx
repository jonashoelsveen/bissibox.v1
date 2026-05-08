import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";

interface FolderOption {
  id: string;
  name: string;
}

/**
 * Centered modal to copy an event. Shows a header (title) field with autofocus,
 * a folder selector, and Save / Cancel actions. The copied event is always
 * created as unpublished, regardless of the source event's published state.
 */
export function CopyEventDialog({
  sourceId,
  sourceTitle,
  initialFolder,
  onClose,
  onCopied,
}: {
  sourceId: string;
  sourceTitle: string;
  initialFolder: string | null;
  onClose: () => void;
  onCopied?: (newId: string) => void;
}) {
  const { user, mode, activeEntityId } = useAuth();
  const isTeamMode = mode === "team" || mode === "organizer" || !!activeEntityId;
  const [title, setTitle] = useState(`${sourceTitle} (copy)`);
  const [folder, setFolder] = useState<string>(initialFolder ?? "");
  const [folders, setFolders] = useState<FolderOption[]>([]);
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    // Auto-focus & select for quick edit (intersection at the field).
    const t = setTimeout(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    }, 30);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!user) return;
      let teamId: string | null = null;
      if (isTeamMode) {
        if (activeEntityId) {
          const { data } = await supabase.from("teams").select("id").eq("id", activeEntityId).maybeSingle();
          teamId = data?.id ?? null;
        }
        if (!teamId) {
          const { data } = await supabase.from("teams").select("id").eq("owner_id", user.id)
            .order("created_at", { ascending: true }).limit(1).maybeSingle();
          teamId = data?.id ?? null;
        }
      }
      const q = supabase.from("event_folders").select("id,name")
        .order("pinned", { ascending: false })
        .order("sort_order", { ascending: true });
      const { data } = isTeamMode && teamId
        ? await q.eq("team_id", teamId)
        : await q.is("team_id", null).eq("user_id", user.id);
      if (!cancelled) setFolders((data ?? []) as FolderOption[]);
    })();
    return () => { cancelled = true; };
  }, [user, isTeamMode, activeEntityId]);

  const save = async () => {
    if (!user || !title.trim() || busy) return;
    setBusy(true);
    try {
      const { data: src } = await supabase.from("events").select("*").eq("id", sourceId).single();
      if (!src) throw new Error("Source event not found");
      const { id: _id, created_at: _c, updated_at: _u, ...rest } = src as Record<string, unknown>;
      const insert = {
        ...rest,
        title: title.trim(),
        folder: folder || null,
        owner_id: user.id,
        team_id: activeEntityId ?? null,
        featured: false,
        published: false, // Always unpublished, regardless of source state.
      };
      const { data: inserted, error } = await supabase
        .from("events")
        .insert(insert as never)
        .select("id")
        .single();
      if (error) throw error;

      const [{ data: classes }, { data: subs }] = await Promise.all([
        supabase.from("event_classes").select("code,label,sort_order").eq("event_id", sourceId),
        supabase.from("event_subevents").select(
          "name,starts_at,distance_km,bib_from,bib_to,max_participants,class_codes,sort_order,course_path,split_points",
        ).eq("event_id", sourceId),
      ]);
      if (classes?.length) {
        await supabase.from("event_classes").insert(
          classes.map((c) => ({ ...c, event_id: inserted!.id })) as never,
        );
      }
      if (subs?.length) {
        await supabase.from("event_subevents").insert(
          subs.map((s) => ({ ...s, event_id: inserted!.id })) as never,
        );
      }

      toast.success("Event copied");
      window.dispatchEvent(new Event("events:refresh"));
      onCopied?.(inserted!.id as string);
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not copy event");
    } finally {
      setBusy(false);
    }
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
          <h2 className="text-sm font-medium text-ink">Copy event</h2>
          <button onClick={onClose} className="rounded-full p-1.5 text-muted-foreground hover:bg-secondary">
            <X className="h-4 w-4" />
          </button>
        </div>

        <label className="block">
          <span className="mono text-[10px] uppercase tracking-widest text-muted-foreground">Title</span>
          <input
            ref={inputRef}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void save(); } }}
            placeholder="Event title"
            className="mt-1 w-full rounded-xl border border-hairline bg-background px-4 py-2.5 text-sm text-ink outline-none focus:border-primary"
          />
        </label>

        <label className="mt-4 block">
          <span className="mono text-[10px] uppercase tracking-widest text-muted-foreground">Folder</span>
          <select
            value={folder}
            onChange={(e) => setFolder(e.target.value)}
            className="mt-1 w-full rounded-xl border border-hairline bg-background px-4 py-2.5 text-sm text-ink outline-none focus:border-primary"
          >
            <option value="">Unsorted</option>
            {folders.map((f) => (
              <option key={f.id} value={f.name}>{f.name}</option>
            ))}
          </select>
        </label>

        <div className="mt-6 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="rounded-full border border-hairline bg-card px-4 py-2 text-xs text-muted-foreground hover:text-ink"
          >
            Cancel
          </button>
          <button
            onClick={save}
            disabled={busy || !title.trim()}
            className="rounded-full bg-primary px-5 py-2 text-xs text-primary-foreground hover:opacity-90 disabled:opacity-50"
          >
            {busy ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}

import { useCallback, useEffect, useState } from "react";
import { ChevronRight, CalendarRange, MoreHorizontal, Pencil, Trash2, Pin, PinOff } from "lucide-react";
import { motion } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { toast } from "sonner";

export interface EventsSideNavValue {
  /** "" = all events, "__unsorted__" = events without folder, otherwise folder name */
  folder: string;
}

interface FolderLite {
  id: string;
  name: string;
  pinned: boolean;
}

export function EventsSideNav({
  value,
  onChange,
}: {
  value: EventsSideNavValue;
  onChange: (v: EventsSideNavValue) => void;
}) {
  const { user, mode, activeEntityId } = useAuth();
  const isTeamMode = mode === "team" || mode === "organizer" || !!activeEntityId;
  const [folders, setFolders] = useState<FolderLite[]>([]);
  const [open, setOpen] = useState(true);
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");

  const load = useCallback(async () => {
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
    const q = supabase.from("event_folders").select("id,name,pinned")
      .order("pinned", { ascending: false })
      .order("sort_order", { ascending: true });
    const { data } = isTeamMode && teamId
      ? await q.eq("team_id", teamId)
      : await q.is("team_id", null).eq("user_id", user.id);
    setFolders((data ?? []) as FolderLite[]);
  }, [user, isTeamMode, activeEntityId]);

  useEffect(() => {
    void load();
    const ch = supabase
      .channel(`events-side-nav-${user?.id ?? "anon"}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "event_folders" }, () => load())
      .subscribe();
    const onLocal = () => void load();
    window.addEventListener("events:refresh", onLocal);
    return () => {
      void supabase.removeChannel(ch);
      window.removeEventListener("events:refresh", onLocal);
    };
  }, [load, user?.id]);

  const isAllActive = value.folder === "";
  const isUnsortedActive = value.folder === "__unsorted__";

  const togglePin = async (f: FolderLite) => {
    setMenuFor(null);
    const { error } = await supabase.from("event_folders").update({ pinned: !f.pinned }).eq("id", f.id);
    if (error) toast.error(error.message);
    else void load();
  };

  const commitRename = async (f: FolderLite) => {
    const newName = renameValue.trim();
    setRenamingId(null);
    if (!newName || newName === f.name) return;
    const { error } = await supabase.from("event_folders").update({ name: newName }).eq("id", f.id);
    if (error) { toast.error(error.message); return; }
    // Cascade to events using old folder name
    await supabase.from("events").update({ folder: newName }).eq("folder", f.name);
    toast.success("Renamed");
    void load();
    window.dispatchEvent(new Event("events:refresh"));
  };

  const doDelete = async (f: FolderLite) => {
    setMenuFor(null);
    if (!window.confirm(`Delete folder "${f.name}"? Events inside will be moved to Unsorted.`)) return;
    await supabase.from("events").update({ folder: null }).eq("folder", f.name);
    const { error } = await supabase.from("event_folders").delete().eq("id", f.id);
    if (error) toast.error(error.message);
    else { toast.success("Deleted"); void load(); window.dispatchEvent(new Event("events:refresh")); }
  };

  return (
    <nav className="flex flex-col gap-1">
      <button
        onClick={() => isAllActive ? setOpen((o) => !o) : onChange({ folder: "" })}
        className={`group flex w-full items-center rounded-md px-3 py-2 text-left text-sm transition ${
          isAllActive ? "bg-secondary font-medium text-ink" : "text-ink hover:bg-secondary/60"
        }`}
      >
        <span className="grid h-5 w-5 shrink-0 place-items-center text-muted-foreground">
          <CalendarRange className="h-3.5 w-3.5" strokeWidth={2.25} />
        </span>
        <span className="ml-2 min-w-0 flex-1 truncate">Events</span>
        <ChevronRight
          className={`h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform duration-200 ${
            open ? "rotate-90" : "rotate-0"
          }`}
        />
      </button>

      <motion.div
        initial={false}
        animate={{ height: open ? "auto" : 0, opacity: open ? 1 : 0 }}
        transition={{ height: { duration: 0.24, ease: [0.22, 1, 0.36, 1] }, opacity: { duration: 0.18 } }}
        style={{ overflow: open ? "visible" : "hidden", pointerEvents: open ? "auto" : "none" }}
      >
        <div className="ml-5 mt-0.5 flex flex-col gap-0.5 border-l border-hairline pl-2">
          <button
            onClick={() => onChange({ folder: "__unsorted__" })}
            className={`rounded-md px-3 py-1 text-left text-xs transition ${
              isUnsortedActive ? "bg-secondary font-medium text-ink" : "text-muted-foreground hover:text-ink"
            }`}
          >
            Unsorted
          </button>

          {folders.map((f) => {
            const active = value.folder === f.name;
            const isRenaming = renamingId === f.id;
            return (
              <div key={f.id} className="group relative flex items-center">
                {isRenaming ? (
                  <input
                    autoFocus
                    value={renameValue}
                    onChange={(e) => setRenameValue(e.target.value)}
                    onBlur={() => void commitRename(f)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") void commitRename(f);
                      if (e.key === "Escape") setRenamingId(null);
                    }}
                    className="w-full rounded-md border border-primary bg-background px-3 py-1 text-xs text-ink outline-none"
                  />
                ) : (
                  <button
                    onClick={() => onChange({ folder: f.name })}
                    className={`flex flex-1 items-center gap-1 rounded-md px-3 py-1 text-left text-xs transition ${
                      active ? "bg-secondary font-medium text-ink" : "text-muted-foreground hover:text-ink"
                    }`}
                  >
                    {f.pinned && <Pin className="h-3 w-3 text-muted-foreground/70" />}
                    <span className="truncate">{f.name}</span>
                  </button>
                )}
                {!isRenaming && (
                  <div className="relative">
                    <button
                      onClick={() => setMenuFor(menuFor === f.id ? null : f.id)}
                      className="rounded p-1 text-muted-foreground/50 opacity-0 transition group-hover:opacity-100 hover:text-ink"
                      aria-label="Folder actions"
                    >
                      <MoreHorizontal className="h-3 w-3" />
                    </button>
                    {menuFor === f.id && (
                      <>
                        <div className="fixed inset-0 z-10" onClick={() => setMenuFor(null)} />
                        <div className="absolute right-0 top-full z-20 mt-1 w-36 overflow-hidden rounded-md border border-hairline bg-popover shadow-lg">
                          <button
                            onClick={() => void togglePin(f)}
                            className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-ink hover:bg-secondary"
                          >
                            {f.pinned ? <PinOff className="h-3 w-3" /> : <Pin className="h-3 w-3" />}
                            {f.pinned ? "Unpin" : "Pin"}
                          </button>
                          <button
                            onClick={() => { setMenuFor(null); setRenamingId(f.id); setRenameValue(f.name); }}
                            className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-ink hover:bg-secondary"
                          >
                            <Pencil className="h-3 w-3" /> Rename
                          </button>
                          <button
                            onClick={() => void doDelete(f)}
                            className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-destructive hover:bg-secondary"
                          >
                            <Trash2 className="h-3 w-3" /> Delete
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </motion.div>
    </nav>
  );
}

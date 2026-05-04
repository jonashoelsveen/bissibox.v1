import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { FolderClosed, FileText } from "lucide-react";

interface FolderLite {
  id: string;
  name: string;
}
interface FileLite {
  id: string;
  file_name: string;
  storage_path: string;
  mime_type: string | null;
  file_size: number | null;
}

const VALID_EXT = /\.(pdf|xlsx|xls|csv)$/i;

export function LibraryPickerStep({
  onPick,
}: {
  onPick: (file: { name: string; mime: string; bytes: Uint8Array }) => void;
}) {
  const { user, mode, activeEntityId } = useAuth();
  const isTeamMode = mode === "team" || mode === "organizer" || !!activeEntityId;
  const [folders, setFolders] = useState<FolderLite[]>([]);
  const [files, setFiles] = useState<FileLite[]>([]);
  const [folderId, setFolderId] = useState<string | "all">("all");
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    let teamId: string | null = null;
    if (isTeamMode) {
      const q = activeEntityId
        ? supabase.from("teams").select("id").eq("id", activeEntityId).maybeSingle()
        : supabase.from("teams").select("id").eq("owner_id", user.id).limit(1).maybeSingle();
      const { data } = await q;
      teamId = data?.id ?? null;
    }
    const folderQ = isTeamMode && teamId
      ? supabase.from("file_folders").select("id,name").eq("team_id", teamId)
      : supabase.from("file_folders").select("id,name").is("team_id", null).eq("user_id", user.id);
    const fileQ = isTeamMode && teamId
      ? supabase.from("files").select("id,file_name,storage_path,mime_type,file_size").eq("team_id", teamId)
      : supabase.from("files").select("id,file_name,storage_path,mime_type,file_size").is("team_id", null).eq("user_id", user.id);
    const [{ data: f }, { data: rows }] = await Promise.all([
      folderQ.order("pinned", { ascending: false }).order("sort_order", { ascending: true }),
      fileQ.order("created_at", { ascending: false }),
    ]);
    setFolders((f ?? []) as FolderLite[]);
    setFiles(((rows ?? []) as FileLite[]).filter((r) => VALID_EXT.test(r.file_name)));
    setLoading(false);
  }, [user, isTeamMode, activeEntityId]);

  useEffect(() => {
    void load();
  }, [load]);

  const visible = folderId === "all" ? files : files.filter(() => true); // file_folder_links not joined for simplicity

  const handlePick = async (f: FileLite) => {
    setDownloading(f.id);
    try {
      const { data, error } = await supabase.storage.from("documents").download(f.storage_path);
      if (error || !data) throw error ?? new Error("Download failed");
      const buf = new Uint8Array(await data.arrayBuffer());
      onPick({ name: f.file_name, mime: f.mime_type ?? "", bytes: buf });
    } finally {
      setDownloading(null);
    }
  };

  return (
    <div className="grid h-[360px] grid-cols-[180px_1fr] gap-3 overflow-hidden rounded-lg border border-hairline">
      {/* Sidebar — mirrors Library page folders for files */}
      <div className="overflow-y-auto border-r border-hairline bg-secondary/20 p-2 text-xs">
        <div className="mb-1 px-2 pt-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
          Files
        </div>
        <button
          onClick={() => setFolderId("all")}
          className={`flex w-full items-center gap-1.5 rounded px-2 py-1.5 text-left ${
            folderId === "all" ? "bg-card text-ink" : "text-muted-foreground hover:bg-card/70"
          }`}
        >
          <FolderClosed className="h-3.5 w-3.5" /> All files
        </button>
        {folders.map((f) => (
          <button
            key={f.id}
            onClick={() => setFolderId(f.id)}
            className={`flex w-full items-center gap-1.5 rounded px-2 py-1.5 text-left ${
              folderId === f.id ? "bg-card text-ink" : "text-muted-foreground hover:bg-card/70"
            }`}
          >
            <FolderClosed className="h-3.5 w-3.5" />
            <span className="truncate">{f.name}</span>
          </button>
        ))}
      </div>
      {/* Files — only valid types */}
      <div className="overflow-y-auto p-2">
        {loading ? (
          <div className="p-6 text-center text-xs text-muted-foreground">Loading…</div>
        ) : visible.length === 0 ? (
          <div className="p-6 text-center text-xs text-muted-foreground">
            No .pdf, .xlsx, .xls or .csv files found here.
          </div>
        ) : (
          <ul className="flex flex-col">
            {visible.map((f) => (
              <li key={f.id}>
                <button
                  onClick={() => handlePick(f)}
                  disabled={downloading === f.id}
                  className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs text-ink hover:bg-secondary/60 disabled:opacity-50"
                >
                  <FileText className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="flex-1 truncate">{f.file_name}</span>
                  {downloading === f.id && (
                    <span className="text-[10px] text-muted-foreground">Loading…</span>
                  )}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

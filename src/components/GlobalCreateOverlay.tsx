import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { toast } from "sonner";
import { X, Plus } from "lucide-react";
import { useNavigate } from "@tanstack/react-router";
import * as tus from "tus-js-client";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";

export type OpenTabPayload =
  | { type: "note"; id: string; title: string; folder: string | null }
  | { type: "meeting"; id: string; title: string; folder: string | null }
  | { type: "media"; id: string; title: string }
  | { type: "file"; id: string; title: string };

/* ------------------------------------------------------------------ */
/* Types                                                               */
/* ------------------------------------------------------------------ */

type Kind =
  | "meeting"
  | "note"
  | "file"
  | "media"
  | "map-location"
  | "map-course"
  | "event";

interface KindConfig {
  modalTitle: string;
  namePlaceholder: string;
  containerLabel: "Folder" | "Album";
  /** Skip name field: pure file upload (file/media). */
  upload?: "files" | "media";
  /** Item only valid in entity mode. */
  entityOnly?: boolean;
  /** No folder/album concept — only Name (used by map). */
  noContainer?: boolean;
}

const CONFIG: Record<Kind, KindConfig> = {
  note: { modalTitle: "New note", namePlaceholder: "Note title", containerLabel: "Folder" },
  meeting: { modalTitle: "New meeting", namePlaceholder: "Meeting title", containerLabel: "Folder", entityOnly: true },
  event: { modalTitle: "New event", namePlaceholder: "Event title", containerLabel: "Folder", entityOnly: true },
  file: { modalTitle: "New file", namePlaceholder: "Pick a file…", containerLabel: "Folder", upload: "files" },
  media: { modalTitle: "New media", namePlaceholder: "Pick photos or videos…", containerLabel: "Album", upload: "media" },
  "map-location": { modalTitle: "New location", namePlaceholder: "Location name", containerLabel: "Folder", noContainer: true },
  "map-course": { modalTitle: "New course", namePlaceholder: "Course name", containerLabel: "Folder", noContainer: true },
};

/* ------------------------------------------------------------------ */
/* Component                                                           */
/* ------------------------------------------------------------------ */

export function GlobalCreateOverlay() {
  const { user, mode, activeEntityId } = useAuth();
  const isEntity = mode === "team" || mode === "organizer" || !!activeEntityId;
  const teamId = isEntity ? activeEntityId : null;

  const [active, setActive] = useState<Kind | null>(null);

  useEffect(() => {
    const onItem = (e: Event) => {
      const detail = (e as CustomEvent<{ kind: Kind }>).detail;
      if (detail?.kind) setActive(detail.kind);
    };
    window.addEventListener("global-create", onItem);
    return () => window.removeEventListener("global-create", onItem);
  }, []);

  if (!user || !active) return null;

  const cfg = CONFIG[active];
  const close = () => setActive(null);

  return createPortal(
    <Modal title={cfg.modalTitle} onClose={close}>
      <CreateBody
        kind={active}
        cfg={cfg}
        userId={user.id}
        teamId={teamId}
        isEntity={isEntity}
        onClose={close}
      />
    </Modal>,
    document.body,
  );
}

/* ------------------------------------------------------------------ */
/* Body                                                                */
/* ------------------------------------------------------------------ */

interface FolderOpt {
  id?: string;
  name: string;
}

function CreateBody({
  kind,
  cfg,
  userId,
  teamId,
  isEntity,
  onClose,
}: {
  kind: Kind;
  cfg: KindConfig;
  userId: string;
  teamId: string | null;
  isEntity: boolean;
  onClose: () => void;
}) {
  const navigate = useNavigate();
  const { session } = useAuth();
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [files, setFiles] = useState<File[]>([]);
  const [fileProgress, setFileProgress] = useState<Record<number, number>>({});
  const fileInputRef = useRef<HTMLInputElement>(null);
  const doneCount = Object.values(fileProgress).filter((p) => p >= 100).length;

  const [folders, setFolders] = useState<FolderOpt[]>([]);
  const [folder, setFolder] = useState(""); // stores name OR id depending on kind
  const [creatingFolder, setCreatingFolder] = useState(false);
  const [draftFolder, setDraftFolder] = useState("");

  // Block when item requires entity mode.
  const blocked = cfg.entityOnly && !isEntity;

  // Load folders list
  useEffect(() => {
    if (cfg.noContainer || blocked) return;
    void loadFolders(kind, { userId, teamId }).then(setFolders);
  }, [kind, userId, teamId, cfg.noContainer, blocked]);

  if (blocked) {
    return (
      <div className="text-sm text-muted-foreground">
        This is only available in entity mode.
        <div className="mt-6 flex justify-end">
          <button
            onClick={onClose}
            className="rounded-full bg-primary px-5 py-2 text-xs text-primary-foreground"
          >
            OK
          </button>
        </div>
      </div>
    );
  }

  const commitFolder = async () => {
    const fname = draftFolder.trim();
    if (!fname) { toast.error(`${cfg.containerLabel} name is required`); return; }
    if (folders.some((f) => f.name.toLowerCase() === fname.toLowerCase())) {
      toast.error(`A ${cfg.containerLabel.toLowerCase()} with that name already exists`); return;
    }
    try {
      const created = await createContainer(kind, fname, { userId, teamId });
      const next = await loadFolders(kind, { userId, teamId });
      setFolders(next);
      setFolder(created.id ?? created.name);
      setDraftFolder("");
      setCreatingFolder(false);
      window.dispatchEvent(new Event("library:refresh"));
      toast.success(`${cfg.containerLabel} "${fname}" created`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to create");
    }
  };

  const submit = async () => {
    if (busy) return;
    setBusy(true);
    setFileProgress({});
    try {
      // Map / notes / meetings / files surfaces were removed from the library.
      // Only media items have a landing surface; everything else still creates
      // the record but skips navigation.
      if (kind === "map-location" || kind === "map-course") {
        onClose();
        return;
      }
      let payload: OpenTabPayload | null = null;
      if (kind === "media") {
        const accessToken = session?.access_token;
        if (!accessToken) throw new Error("Not signed in");
        payload = await uploadMediaParallel(files, folder, { userId, teamId }, accessToken, setFileProgress);
      } else if (cfg.upload) {
        payload = await uploadItems(kind, files, folder, { userId, teamId });
      } else {
        payload = await createItem(kind, name.trim(), folder, { userId, teamId });
      }
      toast.success("Created");
      dispatchRefresh(kind);
      onClose();
      if (payload && payload.type === "media") {
        await navigate({ to: "/media", search: { tab: "media" } });
        setTimeout(() => {
          window.dispatchEvent(new CustomEvent("library:open-tab", { detail: payload }));
        }, 50);
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setBusy(false);
      setFileProgress({});
    }
  };

  const canSubmit = cfg.upload ? files.length > 0 : name.trim().length > 0;

  return (
    <div>
      {/* Name / upload field */}
      <label className="block">
        <span className="mono text-[10px] uppercase tracking-widest text-muted-foreground">
          Name
        </span>
        {cfg.upload ? (
          <>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="mt-1 w-full rounded-xl border border-dashed border-hairline bg-background px-4 py-3 text-left text-sm text-muted-foreground hover:border-ink hover:text-ink"
            >
              {files.length === 0
                ? cfg.namePlaceholder
                : `${files.length} file${files.length === 1 ? "" : "s"} selected`}
            </button>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept={cfg.upload === "media" ? "image/*,video/*" : undefined}
              className="hidden"
              onChange={(e) => setFiles(Array.from(e.target.files ?? []))}
            />
          </>
        ) : (
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && canSubmit) void submit(); }}
            placeholder={cfg.namePlaceholder}
            className="mt-1 w-full rounded-xl border border-hairline bg-background px-4 py-2.5 text-sm text-ink outline-none focus:border-primary"
          />
        )}
      </label>

      {cfg.upload && busy && files.length > 0 && (
        <div className="mt-3 space-y-2 rounded-xl border border-hairline bg-background/60 p-3">
          {files.map((f, i) => {
            const pct = fileProgress[i] ?? 0;
            return (
              <div key={i}>
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-xs text-ink" title={f.name}>{f.name}</span>
                  <span className="shrink-0 mono text-[10px] tabular-nums text-muted-foreground">{pct}%</span>
                </div>
                <div className="mt-1 h-0.5 w-full overflow-hidden rounded-full bg-secondary">
                  <div
                    className={`h-full transition-all duration-150 ${pct >= 100 ? "bg-primary" : "bg-ink"}`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Folder / album picker */}
      {!cfg.noContainer && (
        <div className="mt-4">
          <span className="mono text-[10px] uppercase tracking-widest text-muted-foreground">
            {cfg.containerLabel}
          </span>
          {creatingFolder ? (
            <div className="mt-1 flex items-center gap-2 rounded-xl border border-hairline bg-background pr-1 focus-within:border-primary">
              <input
                autoFocus
                value={draftFolder}
                onChange={(e) => setDraftFolder(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") { e.preventDefault(); void commitFolder(); }
                  else if (e.key === "Escape") { setDraftFolder(""); setCreatingFolder(false); }
                }}
                placeholder={`New ${cfg.containerLabel.toLowerCase()} name`}
                className="flex-1 bg-transparent px-4 py-2.5 text-sm text-ink outline-none"
              />
              <button
                type="button"
                onClick={() => void commitFolder()}
                className="rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:opacity-90"
              >
                Add {cfg.containerLabel.toLowerCase()}
              </button>
            </div>
          ) : (
            <div className="mt-1 flex items-center gap-2">
              <select
                value={folder}
                onChange={(e) => setFolder(e.target.value)}
                className="flex-1 rounded-xl border border-hairline bg-background px-4 py-2.5 text-sm text-ink outline-none focus:border-primary"
              >
                <option value="">None</option>
                {folders.map((f) => (
                  <option key={f.id ?? f.name} value={f.id ?? f.name}>{f.name}</option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => { setDraftFolder(""); setCreatingFolder(true); }}
                title={`Add ${cfg.containerLabel.toLowerCase()}`}
                aria-label={`Add ${cfg.containerLabel.toLowerCase()}`}
                className="flex h-10 w-10 items-center justify-center rounded-xl border border-hairline bg-background text-ink hover:bg-muted"
              >
                <Plus className="h-4 w-4" />
              </button>
            </div>
          )}
        </div>
      )}

      <div className="mt-6 flex justify-end gap-2">
        <button
          onClick={onClose}
          className="rounded-full border border-hairline bg-card px-4 py-2 text-xs text-muted-foreground hover:text-ink"
        >
          Cancel
        </button>
        <button
          onClick={() => void submit()}
          disabled={!canSubmit || busy}
          className="rounded-full bg-primary px-5 py-2 text-xs font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
        >
          {cfg.upload
            ? busy
              ? `Uploading ${doneCount}/${files.length}…`
              : files.length > 1
                ? `Upload ${files.length} files`
                : "Upload"
            : busy ? "Creating…" : "Create"}
        </button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* DB helpers                                                          */
/* ------------------------------------------------------------------ */

interface Ctx {
  userId: string;
  teamId: string | null;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sb = supabase as any;

async function loadFolders(kind: Kind, ctx: Ctx): Promise<FolderOpt[]> {
  switch (kind) {
    case "note": {
      const q = sb.from("note_folders").select("id,name");
      const { data } = ctx.teamId
        ? await q.eq("team_id", ctx.teamId)
        : await q.is("team_id", null).eq("user_id", ctx.userId);
      return (data ?? []) as FolderOpt[];
    }
    case "file": {
      const q = sb.from("file_folders").select("id,name");
      const { data } = ctx.teamId
        ? await q.eq("team_id", ctx.teamId)
        : await q.is("team_id", null).eq("user_id", ctx.userId);
      return (data ?? []) as FolderOpt[];
    }
    case "media": {
      const q = sb.from("media_albums").select("id,name");
      const { data } = ctx.teamId
        ? await q.eq("team_id", ctx.teamId)
        : await q.is("team_id", null).eq("user_id", ctx.userId);
      return (data ?? []) as FolderOpt[];
    }
    case "event": {
      const q = sb.from("event_folders").select("id,name");
      const { data } = ctx.teamId
        ? await q.eq("team_id", ctx.teamId)
        : await q.is("team_id", null).eq("user_id", ctx.userId);
      return (data ?? []) as FolderOpt[];
    }
    case "meeting": {
      if (!ctx.teamId) return [];
      const { data } = await sb
        .from("team_group_meeting_folders")
        .select("id,name")
        .eq("team_id", ctx.teamId);
      return (data ?? []) as FolderOpt[];
    }
    default:
      return [];
  }
}

async function createContainer(
  kind: Kind,
  name: string,
  ctx: Ctx,
): Promise<FolderOpt> {
  switch (kind) {
    case "note": {
      const { data, error } = await sb
        .from("note_folders")
        .insert({ user_id: ctx.userId, team_id: ctx.teamId, name })
        .select("id,name")
        .single();
      if (error) throw error;
      return data;
    }
    case "file": {
      const { data, error } = await sb
        .from("file_folders")
        .insert({ user_id: ctx.userId, team_id: ctx.teamId, name })
        .select("id,name")
        .single();
      if (error) throw error;
      return data;
    }
    case "media": {
      const { data, error } = await sb
        .from("media_albums")
        .insert({ user_id: ctx.userId, team_id: ctx.teamId, name })
        .select("id,name")
        .single();
      if (error) throw error;
      return data;
    }
    case "event": {
      const { data, error } = await sb
        .from("event_folders")
        .insert({ user_id: ctx.userId, team_id: ctx.teamId, name })
        .select("id,name")
        .single();
      if (error) throw error;
      return data;
    }
    case "meeting": {
      if (!ctx.teamId) throw new Error("Switch to an entity to create meeting folders.");
      const { data, error } = await sb
        .from("team_group_meeting_folders")
        .insert({ team_id: ctx.teamId, name })
        .select("id,name")
        .single();
      if (error) throw error;
      return data;
    }
    default:
      throw new Error("Folders not supported for this type.");
  }
}

async function createItem(
  kind: Kind,
  name: string,
  folder: string,
  ctx: Ctx,
): Promise<OpenTabPayload | null> {
  if (!name) throw new Error("Title is required");
  switch (kind) {
    case "note": {
      const folderName = folder
        ? (await resolveFolderName(kind, folder, ctx))
        : null;
      const { data, error } = await sb.from("notes").insert({
        user_id: ctx.userId,
        team_id: ctx.teamId,
        title: name,
        folder: folderName,
      }).select("id,title,folder").single();
      if (error) throw error;
      return { type: "note", id: data.id, title: data.title, folder: data.folder };
    }
    case "event": {
      let organizer = "";
      if (ctx.teamId) {
        const { data } = await sb.from("app_teams").select("name").eq("id", ctx.teamId).maybeSingle();
        organizer = data?.name ?? "Organizer";
      } else {
        const { data } = await sb
          .from("profiles")
          .select("first_name,last_name")
          .eq("id", ctx.userId)
          .maybeSingle();
        organizer = `${data?.first_name ?? ""} ${data?.last_name ?? ""}`.trim() || "Organizer";
      }
      const folderName = folder
        ? await resolveFolderName(kind, folder, ctx)
        : null;
      const startsAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
      // owner_id must be the signed-in user (RLS); team_id scopes to app_teams entity.
      const { error } = await sb.from("events").insert({
        title: name,
        organizer,
        starts_at: startsAt,
        owner_id: ctx.userId,
        team_id: ctx.teamId,
        folder: folderName,
        event_type: "event",
        published: false,
      });
      if (error) throw error;
      return null;
    }
    case "meeting": {
      if (!ctx.teamId) throw new Error("Switch to an entity to create meetings.");
      const { data: group } = await sb
        .from("team_groups")
        .select("id")
        .eq("team_id", ctx.teamId)
        .order("sort_order", { ascending: true })
        .limit(1)
        .maybeSingle();
      const folderName = folder
        ? await resolveFolderName(kind, folder, ctx)
        : null;
      const { data, error } = await sb.from("team_group_meetings").insert({
        team_id: ctx.teamId,
        title: name,
        created_by: ctx.userId,
        group_id: group?.id ?? null,
        meeting_date: new Date().toISOString().slice(0, 10),
        folder: folderName,
      }).select("id,title,folder").single();
      if (error) throw error;
      return { type: "meeting", id: data.id, title: data.title, folder: data.folder };
    }
    case "map-location":
    case "map-course":
      throw new Error("Open the Map page to draw locations and courses.");
    case "file":
    case "media":
      throw new Error("Use the upload picker.");
  }
  return null;
}

async function resolveFolderName(kind: Kind, value: string, ctx: Ctx): Promise<string> {
  // value may be id or already-name; if uuid-like, look up name.
  const looksLikeUuid = /^[0-9a-f-]{36}$/i.test(value);
  if (!looksLikeUuid) return value;
  const folders = await loadFolders(kind, ctx);
  return folders.find((f) => f.id === value)?.name ?? value;
}

async function uploadItems(
  kind: Kind,
  files: File[],
  folderValue: string,
  ctx: Ctx,
): Promise<OpenTabPayload | null> {
  if (files.length === 0) throw new Error("Select at least one file");
  if (kind === "file") {
    const folderId = folderValue || null;
    let lastFile: { id: string; title: string } | null = null;
    for (const file of files) {
      const path = `${ctx.userId}/${crypto.randomUUID()}-${file.name}`;
      const { error: upErr } = await supabase.storage
        .from("documents")
        .upload(path, file, { contentType: file.type });
      if (upErr) throw upErr;
      const { data, error } = await sb.from("files").insert({
        user_id: ctx.userId,
        team_id: ctx.teamId,
        folder_id: folderId,
        file_name: file.name,
        storage_path: path,
        mime_type: file.type,
        file_size: file.size,
      }).select("id,file_name").single();
      if (error) throw error;
      lastFile = { id: data.id, title: data.file_name };
    }
    return lastFile ? { type: "file", id: lastFile.id, title: lastFile.title } : null;
  }
  if (kind === "media") {
    const albumId = folderValue || null;
    let lastMedia: { id: string; title: string } | null = null;
    for (const file of files) {
      const ext = file.name.split(".").pop();
      const path = `${ctx.userId}/${crypto.randomUUID()}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from("media")
        .upload(path, file, { contentType: file.type });
      if (upErr) throw upErr;
      const isVideo = file.type.startsWith("video");
      const { data: mi, error } = await sb
        .from("media_items")
        .insert({
          user_id: ctx.userId,
          team_id: ctx.teamId,
          album_id: albumId,
          storage_path: path,
          media_type: isVideo ? "video" : "photo",
          mime_type: file.type,
          file_size: file.size,
          uploaded_in_mode: ctx.teamId ? "team" : "participant",
        })
        .select("id")
        .single();
      if (error) throw error;
      if (albumId && mi?.id) {
        await sb.from("media_item_albums").insert({ media_item_id: mi.id, album_id: albumId });
      }
      if (mi?.id) lastMedia = { id: mi.id, title: file.name };
    }
    return lastMedia ? { type: "media", id: lastMedia.id, title: lastMedia.title } : null;
  }
  return null;
}

async function uploadMediaParallel(
  files: File[],
  folderValue: string,
  ctx: Ctx,
  accessToken: string,
  setFileProgress: (updater: (p: Record<number, number>) => Record<number, number>) => void,
): Promise<OpenTabPayload | null> {
  if (files.length === 0) throw new Error("Select at least one file");
  const albumId = folderValue || null;

  const parallelChunks = 1;

  const uploadOne = (file: File, path: string, idx: number) =>
    new Promise<void>((resolve, reject) => {
      const upload = new tus.Upload(file, {
        endpoint: `${import.meta.env.VITE_SUPABASE_URL}/storage/v1/upload/resumable`,
        headers: {
          authorization: `Bearer ${accessToken}`,
          "x-upsert": "true",
        },
        uploadDataDuringCreation: true,
        removeFingerprintOnSuccess: true,
        chunkSize: 6 * 1024 * 1024,
        parallelUploads: parallelChunks,
        metadata: {
          bucketName: "media",
          objectName: path,
          contentType: file.type || "application/octet-stream",
          cacheControl: "3600",
        },
        onError: (err) => reject(err),
        onProgress: (bytesUploaded, bytesTotal) => {
          const pct = Math.round((bytesUploaded / bytesTotal) * 100);
          setFileProgress((p) => ({ ...p, [idx]: pct }));
        },
        onSuccess: () => {
          setFileProgress((p) => ({ ...p, [idx]: 100 }));
          resolve();
        },
      });
      upload.start();
    });

  const inserted: { id: string; title: string }[] = [];
  const failures: { name: string; error: Error }[] = [];

  let next = 0;
  const runOne = async (): Promise<void> => {
    while (true) {
      const i = next++;
      if (i >= files.length) return;
      const file = files[i];
      try {
        const ext = file.name.split(".").pop();
        const path = `${ctx.userId}/${crypto.randomUUID()}.${ext}`;
        await uploadOne(file, path, i);
        const isVideo = file.type.startsWith("video");
        const { data: mi, error } = await sb
          .from("media_items")
          .insert({
            user_id: ctx.userId,
            team_id: ctx.teamId,
            album_id: albumId,
            storage_path: path,
            media_type: isVideo ? "video" : "photo",
            mime_type: file.type,
            file_size: file.size,
            uploaded_in_mode: ctx.teamId ? "team" : "participant",
          })
          .select("id")
          .single();
        if (error) throw error;
        if (albumId && mi?.id) {
          await sb.from("media_item_albums").insert({ media_item_id: mi.id, album_id: albumId });
        }
        if (mi?.id) inserted.push({ id: mi.id, title: file.name });
      } catch (e) {
        failures.push({ name: file.name, error: e as Error });
      }
    }
  };
  const FILE_CONCURRENCY = 3;
  await Promise.all(
    Array.from({ length: Math.min(FILE_CONCURRENCY, files.length) }, runOne),
  );

  if (failures.length === files.length) {
    throw failures[0].error;
  }
  if (failures.length > 0) {
    toast.error(`${failures.length} of ${files.length} failed: ${failures[0].error.message}`);
  }
  const last = inserted[inserted.length - 1];
  return last ? { type: "media", id: last.id, title: last.title } : null;
}

function dispatchRefresh(kind: Kind) {
  const events: string[] = ["library:refresh"];
  if (kind === "event") events.push("events:refresh");
  if (kind === "meeting") events.push("meetings:refresh");
  if (kind === "map-location" || kind === "map-course") events.push("map:refresh");
  for (const name of events) window.dispatchEvent(new Event(name));
}

/* ------------------------------------------------------------------ */
/* Modal — same style as NewNoteDialog                                 */
/* ------------------------------------------------------------------ */

function Modal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4 animate-in fade-in"
      onClick={onClose}
    >
      <div className="absolute inset-0 bg-black/60" />
      <div
        className="relative z-10 w-full max-w-md rounded-2xl border border-hairline bg-card p-6 shadow-2xl animate-in zoom-in-95 slide-in-from-bottom-2 duration-200 max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-sm font-medium text-ink">{title}</h2>
          <button
            onClick={onClose}
            aria-label="Close"
            className="rounded-full p-1.5 text-muted-foreground hover:bg-secondary"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

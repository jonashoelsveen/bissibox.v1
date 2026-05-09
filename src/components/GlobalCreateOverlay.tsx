import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { toast } from "sonner";
import { X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";

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

type Mode = "item" | "container";

interface Active {
  kind: Kind;
  mode: Mode;
}

/* ------------------------------------------------------------------ */
/* Configuration per kind                                              */
/* ------------------------------------------------------------------ */

interface KindConfig {
  itemLabel: string;
  containerLabel: string; // "Folder" or "Album"
  itemPlaceholder: string;
  containerPlaceholder: string;
  /** When true, item creation requires a file picker rather than a name. */
  itemIsUpload?: "files" | "media";
  /** When true, item creation requires entity (team) mode. */
  entityOnly?: boolean;
}

const CONFIG: Record<Kind, KindConfig> = {
  meeting: {
    itemLabel: "New meeting",
    containerLabel: "New meeting folder",
    itemPlaceholder: "Meeting title",
    containerPlaceholder: "Folder name",
    entityOnly: true,
  },
  note: {
    itemLabel: "New note",
    containerLabel: "New note folder",
    itemPlaceholder: "Note title",
    containerPlaceholder: "Folder name",
  },
  file: {
    itemLabel: "Upload file",
    containerLabel: "New files folder",
    itemPlaceholder: "Pick a file…",
    containerPlaceholder: "Folder name",
    itemIsUpload: "files",
  },
  media: {
    itemLabel: "Upload media",
    containerLabel: "New album",
    itemPlaceholder: "Pick photos or videos…",
    containerPlaceholder: "Album name",
    itemIsUpload: "media",
  },
  "map-location": {
    itemLabel: "New location",
    containerLabel: "New location folder",
    itemPlaceholder: "Location name",
    containerPlaceholder: "Folder name",
  },
  "map-course": {
    itemLabel: "New course",
    containerLabel: "New course folder",
    itemPlaceholder: "Course name",
    containerPlaceholder: "Folder name",
  },
  event: {
    itemLabel: "New event",
    containerLabel: "New event folder",
    itemPlaceholder: "Event title",
    containerPlaceholder: "Folder name",
  },
};

/* ------------------------------------------------------------------ */
/* Component                                                           */
/* ------------------------------------------------------------------ */

export function GlobalCreateOverlay() {
  const { user, mode, activeEntityId } = useAuth();
  const isEntity = mode === "team" || mode === "organizer" || !!activeEntityId;
  const teamId = isEntity ? activeEntityId : null;

  const [active, setActive] = useState<Active | null>(null);

  useEffect(() => {
    const onItem = (e: Event) => {
      const detail = (e as CustomEvent<{ kind: Kind }>).detail;
      if (detail?.kind) setActive({ kind: detail.kind, mode: "item" });
    };
    const onContainer = (e: Event) => {
      const detail = (e as CustomEvent<{ kind: Kind }>).detail;
      if (detail?.kind) setActive({ kind: detail.kind, mode: "container" });
    };
    window.addEventListener("global-create", onItem);
    window.addEventListener("global-create-container", onContainer);
    return () => {
      window.removeEventListener("global-create", onItem);
      window.removeEventListener("global-create-container", onContainer);
    };
  }, []);

  if (!user || !active) return null;

  const cfg = CONFIG[active.kind];
  const close = () => setActive(null);

  return createPortal(
    <Modal
      title={active.mode === "container" ? cfg.containerLabel : cfg.itemLabel}
      onClose={close}
    >
      <CreateBody
        kind={active.kind}
        mode={active.mode}
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

function CreateBody({
  kind,
  mode,
  cfg,
  userId,
  teamId,
  isEntity,
  onClose,
}: {
  kind: Kind;
  mode: Mode;
  cfg: KindConfig;
  userId: string;
  teamId: string | null;
  isEntity: boolean;
  onClose: () => void;
}) {
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [files, setFiles] = useState<File[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Block when item requires entity mode but user is in individual mode.
  if (mode === "item" && cfg.entityOnly && !isEntity) {
    return (
      <div className="text-sm text-muted-foreground">
        This is only available in entity mode.
        <div className="mt-4 flex justify-end">
          <button
            onClick={onClose}
            className="rounded-full bg-primary px-4 py-1.5 text-xs text-primary-foreground"
          >
            OK
          </button>
        </div>
      </div>
    );
  }

  const submit = async () => {
    if (busy) return;
    setBusy(true);
    try {
      if (mode === "container") {
        await createContainer(kind, name.trim(), { userId, teamId });
      } else if (cfg.itemIsUpload) {
        await uploadItems(kind, files, { userId, teamId });
      } else {
        await createItem(kind, name.trim(), { userId, teamId });
      }
      toast.success(`${mode === "container" ? "Created" : "Created"} successfully`);
      dispatchRefresh(kind);
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  };

  const canSubmit =
    mode === "container"
      ? name.trim().length > 0
      : cfg.itemIsUpload
        ? files.length > 0
        : name.trim().length > 0;

  return (
    <div className="flex flex-col gap-4">
      {mode === "item" && cfg.itemIsUpload ? (
        <>
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="rounded-md border border-dashed border-hairline bg-background px-3 py-6 text-sm text-muted-foreground hover:border-ink hover:text-ink"
          >
            {files.length === 0
              ? cfg.itemPlaceholder
              : `${files.length} file${files.length === 1 ? "" : "s"} selected`}
          </button>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept={cfg.itemIsUpload === "media" ? "image/*,video/*" : undefined}
            className="hidden"
            onChange={(e) => setFiles(Array.from(e.target.files ?? []))}
          />
        </>
      ) : (
        <input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && canSubmit) void submit();
          }}
          placeholder={
            mode === "container" ? cfg.containerPlaceholder : cfg.itemPlaceholder
          }
          className="w-full rounded-md border border-hairline bg-background px-3 py-2 text-sm text-ink outline-none focus:border-ink"
        />
      )}

      <div className="flex justify-end gap-2">
        <button
          onClick={onClose}
          className="rounded-md border border-hairline bg-card px-3 py-1.5 text-xs text-muted-foreground hover:text-ink"
        >
          Cancel
        </button>
        <button
          onClick={submit}
          disabled={!canSubmit || busy}
          className="rounded-md bg-primary px-4 py-1.5 text-xs font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
        >
          {busy ? "Creating…" : "Create"}
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

async function createContainer(kind: Kind, name: string, ctx: Ctx) {
  if (!name) throw new Error("Name is required");
  switch (kind) {
    case "note": {
      const { error } = await sb
        .from("note_folders")
        .insert({ user_id: ctx.userId, team_id: ctx.teamId, name });
      if (error) throw error;
      return;
    }
    case "file": {
      const { error } = await sb
        .from("file_folders")
        .insert({ user_id: ctx.userId, team_id: ctx.teamId, name });
      if (error) throw error;
      return;
    }
    case "media": {
      const { error } = await sb
        .from("media_albums")
        .insert({ user_id: ctx.userId, team_id: ctx.teamId, name });
      if (error) throw error;
      return;
    }
    case "event": {
      const { error } = await sb
        .from("event_folders")
        .insert({ user_id: ctx.userId, team_id: ctx.teamId, name });
      if (error) throw error;
      return;
    }
    case "meeting": {
      if (!ctx.teamId) throw new Error("Switch to an entity to create meeting folders.");
      const { error } = await sb
        .from("team_group_meeting_folders")
        .insert({ team_id: ctx.teamId, name });
      if (error) throw error;
      return;
    }
    case "map-location":
    case "map-course":
      throw new Error("Map folders are managed inside the Map page.");
  }
}

async function createItem(kind: Kind, name: string, ctx: Ctx) {
  if (!name) throw new Error("Title is required");
  switch (kind) {
    case "note": {
      const { error } = await sb
        .from("notes")
        .insert({ user_id: ctx.userId, team_id: ctx.teamId, title: name });
      if (error) throw error;
      return;
    }
    case "event": {
      // Resolve organizer name from team or profile.
      let organizer = "";
      if (ctx.teamId) {
        const { data } = await sb.from("teams").select("name").eq("id", ctx.teamId).maybeSingle();
        organizer = data?.name ?? "Organizer";
      } else {
        const { data } = await sb
          .from("profiles")
          .select("first_name,last_name")
          .eq("id", ctx.userId)
          .maybeSingle();
        organizer = `${data?.first_name ?? ""} ${data?.last_name ?? ""}`.trim() || "Organizer";
      }
      const startsAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
      const { error } = await sb.from("events").insert({
        title: name,
        organizer,
        starts_at: startsAt,
        owner_id: ctx.teamId ? null : ctx.userId,
        team_id: ctx.teamId,
      });
      if (error) throw error;
      return;
    }
    case "meeting": {
      if (!ctx.teamId) throw new Error("Switch to an entity to create meetings.");
      // Pick an arbitrary group for the team, falling back to null.
      const { data: group } = await sb
        .from("team_groups")
        .select("id")
        .eq("team_id", ctx.teamId)
        .order("sort_order", { ascending: true })
        .limit(1)
        .maybeSingle();
      const { error } = await sb.from("team_group_meetings").insert({
        team_id: ctx.teamId,
        title: name,
        created_by: ctx.userId,
        group_id: group?.id ?? null,
        meeting_date: new Date().toISOString().slice(0, 10),
      });
      if (error) throw error;
      return;
    }
    case "map-location":
    case "map-course":
      throw new Error("Open the Map page to create locations and courses.");
    case "file":
    case "media":
      throw new Error("Use the upload picker.");
  }
}

async function uploadItems(kind: Kind, files: File[], ctx: Ctx) {
  if (files.length === 0) throw new Error("Select at least one file");
  if (kind === "file") {
    for (const file of files) {
      const path = `${ctx.userId}/${crypto.randomUUID()}-${file.name}`;
      const { error: upErr } = await supabase.storage
        .from("documents")
        .upload(path, file, { contentType: file.type });
      if (upErr) throw upErr;
      const { error } = await sb.from("files").insert({
        user_id: ctx.userId,
        team_id: ctx.teamId,
        file_name: file.name,
        storage_path: path,
        mime_type: file.type,
        file_size: file.size,
      });
      if (error) throw error;
    }
    return;
  }
  if (kind === "media") {
    for (const file of files) {
      const ext = file.name.split(".").pop();
      const path = `${ctx.userId}/${crypto.randomUUID()}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from("media")
        .upload(path, file, { contentType: file.type });
      if (upErr) throw upErr;
      const isVideo = file.type.startsWith("video");
      const { error } = await sb.from("media_items").insert({
        user_id: ctx.userId,
        team_id: ctx.teamId,
        storage_path: path,
        media_type: isVideo ? "video" : "photo",
        mime_type: file.type,
        file_size: file.size,
        uploaded_in_mode: ctx.teamId ? "team" : "participant",
      });
      if (error) throw error;
    }
    return;
  }
}

function dispatchRefresh(kind: Kind) {
  // Pages listen for these and reload their data.
  const events: string[] = ["library:refresh"];
  if (kind === "event") events.push("events:refresh");
  if (kind === "meeting") events.push("meetings:refresh");
  if (kind === "media" || kind === "file" || kind === "note") events.push("library:refresh");
  if (kind === "map-location" || kind === "map-course") events.push("map:refresh");
  for (const name of events) window.dispatchEvent(new Event(name));
}

/* ------------------------------------------------------------------ */
/* Modal                                                               */
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
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 p-4 animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm rounded-2xl border border-hairline bg-popover p-5 shadow-xl animate-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-start justify-between gap-4">
          <h2 className="text-base font-medium text-ink">{title}</h2>
          <button
            onClick={onClose}
            aria-label="Close"
            className="rounded-md p-1 text-muted-foreground transition hover:bg-secondary hover:text-ink"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

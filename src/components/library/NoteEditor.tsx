import { useEffect, useMemo, useRef, useState } from "react";

import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { toast } from "sonner";
import {
  Folder as FolderIcon,
  Paperclip,
  Plus,
  Save,
  Trash2,
  X,
} from "lucide-react";
import { useLibrarySetting, notesAutosaveKey, registerUnsaved } from "@/lib/library-settings";

interface NoteRow {
  id: string;
  user_id: string;
  team_id: string | null;
  title: string;
  folder: string | null;
  body: string | null;
  updated_at: string;
}

interface NoteAttachment {
  id: string;
  file_name: string;
  storage_path: string;
  file_size: number | null;
  mime_type: string | null;
}

export function NoteEditor({
  noteId,
  actionsMount: _actionsMount,
  onChanged,
}: {
  noteId: string;
  actionsMount?: HTMLDivElement | null;
  onChanged?: (patch: { id: string; title?: string; folder?: string | null }) => void;
}) {
  const { user, activeEntityId } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const bodyRef = useRef<HTMLTextAreaElement>(null);

  const [note, setNote] = useState<NoteRow | null>(null);
  const [body, setBody] = useState("");
  const [savedBody, setSavedBody] = useState("");
  const [attachments, setAttachments] = useState<NoteAttachment[]>([]);
  const [folders, setFolders] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [editTitle, setEditTitle] = useState("");
  const [editFolder, setEditFolder] = useState("");

  const isDirty = body !== savedBody;
  const scopeKey = activeEntityId
    ? `entity:${activeEntityId}`
    : user
      ? `user:${user.id}`
      : "user:anon";
  const [autosave] = useLibrarySetting<boolean>(notesAutosaveKey(scopeKey), false);

  useEffect(() => {
    if (!user) return;
    void (async () => {
      const { data, error } = await supabase
        .from("notes").select("*").eq("id", noteId).maybeSingle();
      if (error || !data) { toast.error("Note not found"); return; }
      const row = data as NoteRow;
      setNote(row);
      setBody(row.body ?? "");
      setSavedBody(row.body ?? "");

      const { data: atts } = await supabase
        .from("note_attachments")
        .select("id,file_name,storage_path,file_size,mime_type")
        .eq("note_id", noteId)
        .order("created_at", { ascending: true });
      setAttachments((atts ?? []) as NoteAttachment[]);

      const folderQuery = row.team_id
        ? supabase.from("note_folders").select("name").eq("team_id", row.team_id)
        : supabase.from("note_folders").select("name").is("team_id", null).eq("user_id", user.id);
      const { data: f } = await folderQuery;
      setFolders((f ?? []).map((x) => (x as { name: string }).name));

      // Auto-focus the writing area when the note opens
      requestAnimationFrame(() => {
        const el = bodyRef.current;
        if (el) {
          el.focus();
          const len = el.value.length;
          el.setSelectionRange(len, len);
        }
      });
    })();
  }, [user, noteId]);

  const saveBody = async () => {
    if (!note || body === savedBody) return;
    setSaving(true);
    const { error } = await supabase
      .from("notes")
      .update({ body, updated_at: new Date().toISOString() })
      .eq("id", note.id);
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    setSavedBody(body);
  };

  // Autosave (debounced) when enabled
  useEffect(() => {
    if (!autosave || !isDirty || !note) return;
    const t = setTimeout(() => { void saveBody(); }, 800);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autosave, body, isDirty, note?.id]);

  // Register dirty-state so the host can prompt before closing the tab.
  useEffect(() => {
    if (!note) return;
    return registerUnsaved(note.id, {
      isDirty: () => body !== savedBody,
      isNew: () => false,
      title: () => note.title || "Untitled note",
      save: async () => { await saveBody(); },
      discard: async () => {
        // revert to saved body without writing
        setBody(savedBody);
      },
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [note?.id, body, savedBody]);

  const uploadAttachments = async (files: FileList) => {
    if (!note || !user) return;
    for (const file of Array.from(files)) {
      const safe = file.name.replace(/[^\w.\-]/g, "_");
      const path = `${user.id}/${note.id}/${Date.now()}-${safe}`;
      const { error: upErr } = await supabase.storage
        .from("note-attachments")
        .upload(path, file, { contentType: file.type || "application/octet-stream" });
      if (upErr) { toast.error(upErr.message); continue; }
      const { data, error } = await supabase
        .from("note_attachments")
        .insert({
          note_id: note.id,
          user_id: user.id,
          team_id: note.team_id,
          file_name: file.name,
          storage_path: path,
          mime_type: file.type || null,
          file_size: file.size,
          uploaded_by: user.id,
        })
        .select("id,file_name,storage_path,file_size,mime_type")
        .single();
      if (error) { toast.error(error.message); continue; }
      setAttachments((prev) => [...prev, data as NoteAttachment]);
    }
    toast.success("Attached");
  };

  const removeAttachment = async (a: NoteAttachment) => {
    await supabase.storage.from("note-attachments").remove([a.storage_path]);
    await supabase.from("note_attachments").delete().eq("id", a.id);
    setAttachments((prev) => prev.filter((x) => x.id !== a.id));
  };

  const downloadAttachment = async (a: NoteAttachment) => {
    const { data, error } = await supabase.storage
      .from("note-attachments")
      .createSignedUrl(a.storage_path, 60, { download: a.file_name });
    if (error || !data?.signedUrl) { toast.error("Could not get download link"); return; }
    window.open(data.signedUrl, "_blank");
  };

  const openEdit = () => {
    if (!note) return;
    setEditTitle(note.title);
    setEditFolder(note.folder ?? "");
    setEditOpen(true);
  };

  const saveEdit = async () => {
    if (!note) return;
    const title = editTitle.trim() || "Untitled note";
    const folder = editFolder.trim() || null;
    const { error } = await supabase
      .from("notes").update({ title, folder, updated_at: new Date().toISOString() }).eq("id", note.id);
    if (error) { toast.error(error.message); return; }
    setNote({ ...note, title, folder });
    onChanged?.({ id: note.id, title, folder });
    setEditOpen(false);
    toast.success("Saved");
  };

  const headerLabel = useMemo(() => {
    if (!note) return "";
    return note.folder ? `${note.folder} · ${note.title}` : note.title;
  }, [note]);

  if (!user || !note) return null;

  return (
    <div>
      {/* Top-level save button removed; the document toolbar below owns it. */}

      <section className="mt-5 rounded-lg border border-hairline bg-card shadow-sm">
        {/* Document toolbar */}
        <div className="flex items-center gap-2 border-b border-hairline px-4 py-2">
          <button
            onClick={() => fileInputRef.current?.click()}
            title="Attach documents"
            className="inline-flex items-center gap-1.5 rounded-md px-2 py-1.5 text-xs text-muted-foreground transition hover:bg-secondary hover:text-ink"
          >
            <Paperclip className="h-4 w-4" />
            <span>Attach</span>
          </button>
          <span className="ml-3 mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground truncate">
            {headerLabel}
          </span>
          <button
            onClick={openEdit}
            title="Edit name and folder"
            className="ml-auto rounded-md p-2 text-muted-foreground transition hover:bg-secondary hover:text-ink"
          >
            <FolderIcon className="h-4 w-4" />
          </button>
          {autosave ? (
            <span
              title="Autosave is on. Edits are saved automatically."
              className="inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs text-emerald-600 dark:text-emerald-400"
            >
              <Save className="h-3.5 w-3.5" />
              {saving ? "Saving…" : "Autosave"}
            </span>
          ) : (
            <button
              onClick={() => void saveBody()}
              disabled={!isDirty || saving}
              className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs transition ${
                isDirty && !saving
                  ? "text-ink hover:bg-secondary"
                  : "cursor-default text-muted-foreground/50"
              }`}
            >
              <Save className="h-3.5 w-3.5" />
              {saving ? "Saving…" : isDirty ? "Save" : "Saved"}
            </button>
          )}
        </div>

        <div className="mx-auto my-6 flex min-h-[700px] w-full max-w-3xl flex-col rounded-md border border-hairline bg-background p-10 shadow-inner">
          {attachments.length > 0 && (
            <div className="mb-6 border-b border-hairline pb-4">
              <div className="space-y-2">
                {attachments.map((a) => (
                  <div key={a.id} className="flex items-center gap-3 rounded-md border border-hairline bg-card p-2.5">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-secondary">
                      <Paperclip className="h-4 w-4 text-muted-foreground" />
                    </div>
                    <button
                      onClick={() => void downloadAttachment(a)}
                      className="min-w-0 flex-1 truncate text-left text-sm font-medium text-ink hover:underline"
                    >
                      {a.file_name}
                    </button>
                    {a.file_size != null && (
                      <span className="mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                        {(a.file_size / 1024).toFixed(0)} KB
                      </span>
                    )}
                    <button
                      onClick={() => void removeAttachment(a)}
                      className="rounded p-1 text-muted-foreground hover:text-destructive"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          <textarea
            ref={bodyRef}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            onBlur={() => void saveBody()}
            placeholder="Write your note here…"
            className="flex-1 resize-none border-0 bg-transparent text-base leading-relaxed text-ink outline-none placeholder:text-muted-foreground/60"
          />
        </div>
      </section>

      <input
        ref={fileInputRef}
        type="file"
        multiple
        className="hidden"
        onChange={(e) => {
          const fs = e.target.files;
          if (fs && fs.length) void uploadAttachments(fs);
          e.target.value = "";
        }}
      />

      {editOpen && note && (
        <EditNoteDialog
          name={editTitle}
          folder={editFolder}
          folders={folders}
          onName={setEditTitle}
          onFolder={setEditFolder}
          onCreateFolder={async (name) => {
            const { error } = await supabase
              .from("note_folders")
              .insert({ user_id: user.id, team_id: note.team_id, name });
            if (error) { toast.error(error.message); return false; }
            setFolders((prev) => (prev.includes(name) ? prev : [...prev, name]));
            setEditFolder(name);
            toast.success(`Folder "${name}" created`);
            return true;
          }}
          onClose={() => setEditOpen(false)}
          onConfirm={() => void saveEdit()}
        />
      )}
    </div>
  );
}

function EditNoteDialog({
  name, folder, folders, onName, onFolder, onCreateFolder, onClose, onConfirm,
}: {
  name: string;
  folder: string;
  folders: string[];
  onName: (v: string) => void;
  onFolder: (v: string) => void;
  onCreateFolder: (name: string) => Promise<boolean>;
  onClose: () => void;
  onConfirm: () => void;
}) {
  const [creating, setCreating] = useState(false);
  const [draft, setDraft] = useState("");

  const commitAdd = async () => {
    const n = draft.trim();
    if (!n) { toast.error("Folder name is required"); return; }
    if (folders.includes(n)) { toast.error("A folder with that name already exists"); return; }
    const ok = await onCreateFolder(n);
    if (ok) { setDraft(""); setCreating(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 animate-in fade-in" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60" />
      <div
        className="relative z-10 w-full max-w-md rounded-2xl border border-hairline bg-card p-6 shadow-2xl animate-in zoom-in-95 slide-in-from-bottom-2 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg text-ink">Edit note</h2>
          <button onClick={onClose} className="rounded-full p-1.5 text-muted-foreground hover:bg-secondary">
            <X className="h-4 w-4" />
          </button>
        </div>
        <label className="block">
          <span className="mono text-[10px] uppercase tracking-widest text-muted-foreground">Name</span>
          <input
            autoFocus value={name} onChange={(e) => onName(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") onConfirm(); }}
            className="mt-1 w-full rounded-xl border border-hairline bg-background px-4 py-2.5 text-sm text-ink outline-none focus:border-primary"
          />
        </label>
        <div className="mt-4">
          <span className="mono text-[10px] uppercase tracking-widest text-muted-foreground">Folder</span>
          {creating ? (
            <div className="mt-1 flex items-center gap-2 rounded-xl border border-hairline bg-background pr-1 focus-within:border-primary">
              <input
                autoFocus value={draft} onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") { e.preventDefault(); void commitAdd(); }
                  else if (e.key === "Escape") { setDraft(""); setCreating(false); }
                }}
                placeholder="New folder name"
                className="flex-1 bg-transparent px-4 py-2.5 text-sm text-ink outline-none"
              />
              <button type="button" onClick={() => void commitAdd()} className="rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:opacity-90">
                Add folder
              </button>
            </div>
          ) : (
            <div className="mt-1 flex items-center gap-2">
              <select
                value={folder} onChange={(e) => onFolder(e.target.value)}
                className="flex-1 rounded-xl border border-hairline bg-background px-4 py-2.5 text-sm text-ink outline-none focus:border-primary"
              >
                <option value="">None</option>
                {folders.map((f) => <option key={f} value={f}>{f}</option>)}
              </select>
              <button
                type="button" onClick={() => { setDraft(""); setCreating(true); }}
                title="Add folder" aria-label="Add folder"
                className="flex h-10 w-10 items-center justify-center rounded-xl border border-hairline bg-background text-ink hover:bg-muted"
              >
                <Plus className="h-4 w-4" />
              </button>
            </div>
          )}
        </div>
        <div className="mt-6 flex justify-end gap-2">
          <button onClick={onClose} className="rounded-full border border-hairline bg-card px-4 py-2 text-xs text-muted-foreground hover:text-ink">Cancel</button>
          <button
            onClick={onConfirm}
            disabled={!name.trim()}
            className="rounded-full bg-primary px-5 py-2 text-xs text-primary-foreground hover:opacity-90 disabled:opacity-50"
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}

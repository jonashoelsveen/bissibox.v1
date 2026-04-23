import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { toast } from "sonner";
import {
  ChevronDown,
  ChevronRight,
  Plus,
  Upload,
  CheckSquare,
  Square,
  X,
  Trash2,
  Eye,
} from "lucide-react";

export const Route = createFileRoute("/media")({
  component: MediaPage,
  head: () => ({ meta: [{ title: "Media · Raceline" }] }),
});

interface Album {
  id: string;
  name: string;
}

interface MediaItem {
  id: string;
  storage_path: string;
  media_type: "photo" | "video";
  album_id: string | null;
  event_id: string | null;
  organizer: string | null;
  photographer: string | null;
  subject: string | null;
  visible_world: boolean;
  visible_media: boolean;
  visible_friends: boolean;
  allowed_media_houses: string[];
  created_at: string;
}

const MEDIA_HOUSES = ["VG", "NRK", "TV2", "Dagbladet", "Aftenposten"];

function MediaPage() {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [albums, setAlbums] = useState<Album[]>([]);
  const [items, setItems] = useState<MediaItem[]>([]);
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [view, setView] = useState<{ type: "all" } | { type: "album"; id: string | null }>({
    type: "all",
  });
  const [albumsOpen, setAlbumsOpen] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [openItem, setOpenItem] = useState<MediaItem | null>(null);

  useEffect(() => {
    if (!authLoading && !user) navigate({ to: "/auth" });
  }, [authLoading, user, navigate]);

  const load = useCallback(async () => {
    if (!user) return;
    const [{ data: a }, { data: m }] = await Promise.all([
      supabase.from("media_albums").select("id,name").order("created_at", { ascending: false }),
      supabase.from("media_items").select("*").order("created_at", { ascending: false }),
    ]);
    setAlbums(a ?? []);
    setItems((m as MediaItem[]) ?? []);
  }, [user]);

  useEffect(() => {
    void load();
  }, [load]);

  // sign URLs
  useEffect(() => {
    let cancel = false;
    (async () => {
      const next: Record<string, string> = {};
      for (const it of items) {
        if (urls[it.id]) {
          next[it.id] = urls[it.id];
          continue;
        }
        const { data } = await supabase.storage
          .from("media")
          .createSignedUrl(it.storage_path, 3600);
        if (data?.signedUrl) next[it.id] = data.signedUrl;
      }
      if (!cancel) setUrls(next);
    })();
    return () => {
      cancel = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items]);

  const filtered = useMemo(() => {
    if (view.type === "all") return items;
    return items.filter((i) => i.album_id === view.id);
  }, [items, view]);

  const toggleSel = (id: string) => {
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  };

  const exitSelect = () => {
    setSelectMode(false);
    setSelected(new Set());
  };

  const handleDelete = async () => {
    if (selected.size === 0) return;
    if (!confirm(`Delete ${selected.size} item(s)? This cannot be undone.`)) return;
    const ids = Array.from(selected);
    const paths = items.filter((i) => ids.includes(i.id)).map((i) => i.storage_path);
    await supabase.storage.from("media").remove(paths);
    await supabase.from("media_items").delete().in("id", ids);
    toast.success("Deleted");
    exitSelect();
    void load();
  };

  if (authLoading || !user) return null;

  return (
    <div className="px-4 md:px-6">
      <div className="flex justify-end gap-2 pt-4">
        {selectMode ? (
          <div className="flex items-center gap-2 rounded-full border border-hairline bg-card p-1 pr-2">
            <button
              onClick={() => {
                if (selected.size === 1) {
                  const it = items.find((i) => i.id === Array.from(selected)[0]);
                  if (it) setOpenItem(it);
                }
              }}
              disabled={selected.size !== 1}
              className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs text-ink hover:bg-secondary disabled:opacity-40"
            >
              <Eye className="h-3.5 w-3.5" /> Open
            </button>
            <button
              onClick={handleDelete}
              disabled={selected.size === 0}
              className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs text-destructive hover:bg-destructive/10 disabled:opacity-40"
            >
              <Trash2 className="h-3.5 w-3.5" /> Delete
            </button>
            <button
              onClick={exitSelect}
              className="ml-1 rounded-full p-1.5 text-muted-foreground hover:bg-secondary"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        ) : (
          <button
            onClick={() => setSelectMode(true)}
            className="flex items-center gap-1.5 rounded-full border border-hairline bg-card px-4 py-2 text-xs text-muted-foreground hover:text-ink"
          >
            <CheckSquare className="h-3.5 w-3.5" /> Select
          </button>
        )}
        <button
          onClick={() => setCreateOpen(true)}
          className="flex items-center gap-1.5 rounded-full border border-hairline bg-card px-4 py-2 text-xs text-ink hover:bg-secondary"
        >
          <Plus className="h-3.5 w-3.5" /> New album
        </button>
        <button
          onClick={() => setUploadOpen(true)}
          className="flex items-center gap-1.5 rounded-full bg-primary px-4 py-2 text-xs text-primary-foreground hover:opacity-90"
        >
          <Upload className="h-3.5 w-3.5" /> Upload
        </button>
      </div>

      <div className="mt-8 grid gap-8 md:grid-cols-[200px_1fr]">
        <nav className="-ml-2 flex flex-col gap-0.5">
          <NavBtn active={view.type === "all"} onClick={() => setView({ type: "all" })}>
            All
          </NavBtn>
          <button
            onClick={() => setAlbumsOpen((o) => !o)}
            className="flex items-center justify-between rounded-md px-3 py-2 text-left text-sm text-muted-foreground transition hover:text-ink"
          >
            <span>Albums</span>
            {albumsOpen ? (
              <ChevronDown className="h-3.5 w-3.5" />
            ) : (
              <ChevronRight className="h-3.5 w-3.5" />
            )}
          </button>
          {albumsOpen && (
            <div className="ml-3 flex flex-col gap-0.5 border-l border-hairline pl-2">
              <NavBtn
                small
                active={view.type === "album" && view.id === null}
                onClick={() => setView({ type: "album", id: null })}
              >
                Unsorted
              </NavBtn>
              {albums.map((a) => (
                <NavBtn
                  key={a.id}
                  small
                  active={view.type === "album" && view.id === a.id}
                  onClick={() => setView({ type: "album", id: a.id })}
                >
                  {a.name}
                </NavBtn>
              ))}
              {albums.length === 0 && (
                <span className="px-3 py-1.5 text-xs text-muted-foreground">No albums yet</span>
              )}
            </div>
          )}
        </nav>

        <section>
          {filtered.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-hairline bg-card/40 py-20 text-center text-sm text-muted-foreground">
              No content yet. Upload your first photo or video.
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-1 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
              {filtered.map((it) => {
                const isSel = selected.has(it.id);
                return (
                  <button
                    key={it.id}
                    onClick={() => {
                      if (selectMode) toggleSel(it.id);
                      else setOpenItem(it);
                    }}
                    className="group relative aspect-square overflow-hidden rounded-sm bg-secondary"
                  >
                    {it.media_type === "photo" ? (
                      urls[it.id] && (
                        <img
                          src={urls[it.id]}
                          alt=""
                          className="h-full w-full object-cover transition group-hover:scale-[1.02]"
                        />
                      )
                    ) : (
                      <video
                        src={urls[it.id]}
                        className="h-full w-full object-cover"
                        muted
                      />
                    )}
                    {selectMode && (
                      <div className="absolute left-2 top-2 rounded-full bg-background/80 p-0.5">
                        {isSel ? (
                          <CheckSquare className="h-4 w-4 text-primary" />
                        ) : (
                          <Square className="h-4 w-4 text-muted-foreground" />
                        )}
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </section>
      </div>

      {createOpen && (
        <CreateAlbumDialog
          onClose={() => setCreateOpen(false)}
          onCreated={() => {
            setCreateOpen(false);
            void load();
          }}
          userId={user.id}
        />
      )}
      {uploadOpen && (
        <UploadDialog
          albums={albums}
          userId={user.id}
          onClose={() => setUploadOpen(false)}
          onUploaded={() => {
            setUploadOpen(false);
            void load();
          }}
        />
      )}
      {openItem && (
        <Lightbox
          item={openItem}
          url={urls[openItem.id]}
          albums={albums}
          onClose={() => setOpenItem(null)}
          onChanged={() => void load()}
        />
      )}
    </div>
  );
}

function NavBtn({
  active,
  onClick,
  children,
  small,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
  small?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className={`rounded-md px-3 ${small ? "py-1.5 text-xs" : "py-2 text-sm"} text-left transition ${
        active ? "bg-secondary font-medium text-ink" : "text-muted-foreground hover:text-ink"
      }`}
    >
      {children}
    </button>
  );
}

function CreateAlbumDialog({
  onClose,
  onCreated,
  userId,
}: {
  onClose: () => void;
  onCreated: () => void;
  userId: string;
}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);

  const create = async () => {
    if (!name.trim()) return;
    setBusy(true);
    const { error } = await supabase
      .from("media_albums")
      .insert({ user_id: userId, name: name.trim(), description: description.trim() || null });
    setBusy(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Album created");
    onCreated();
  };

  return (
    <Modal title="New album" onClose={onClose}>
      <Field label="Name" value={name} onChange={setName} autoFocus />
      <Field label="Description" value={description} onChange={setDescription} />
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
    </Modal>
  );
}

function UploadDialog({
  albums,
  userId,
  onClose,
  onUploaded,
}: {
  albums: Album[];
  userId: string;
  onClose: () => void;
  onUploaded: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [albumId, setAlbumId] = useState<string>("");
  const [organizer, setOrganizer] = useState("");
  const [photographer, setPhotographer] = useState("");
  const [subject, setSubject] = useState("");
  const [busy, setBusy] = useState(false);

  const upload = async () => {
    if (!file) return;
    setBusy(true);
    try {
      const ext = file.name.split(".").pop();
      const path = `${userId}/${crypto.randomUUID()}.${ext}`;
      const { error: upErr } = await supabase.storage.from("media").upload(path, file, {
        contentType: file.type,
      });
      if (upErr) throw upErr;
      const isVideo = file.type.startsWith("video");
      const { error: insErr } = await supabase.from("media_items").insert({
        user_id: userId,
        storage_path: path,
        media_type: isVideo ? "video" : "photo",
        mime_type: file.type,
        file_size: file.size,
        album_id: albumId || null,
        organizer: organizer || null,
        photographer: photographer || null,
        subject: subject || null,
      });
      if (insErr) throw insErr;
      toast.success("Uploaded");
      onUploaded();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title="Upload content" onClose={onClose}>
      <div>
        <button
          onClick={() => inputRef.current?.click()}
          className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-hairline bg-background px-4 py-8 text-sm text-muted-foreground hover:text-ink"
        >
          <Upload className="h-4 w-4" />
          {file ? file.name : "Choose a photo or video"}
        </button>
        <input
          ref={inputRef}
          type="file"
          accept="image/*,video/*"
          className="hidden"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
        />
      </div>
      <div className="mt-4">
        <Label>Album</Label>
        <select
          value={albumId}
          onChange={(e) => setAlbumId(e.target.value)}
          className="mt-1 w-full rounded-xl border border-hairline bg-background px-4 py-2.5 text-sm text-ink outline-none focus:border-primary"
        >
          <option value="">No album</option>
          {albums.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </select>
      </div>
      <p className="mt-6 mono text-[10px] uppercase tracking-widest text-muted-foreground">
        About
      </p>
      <div className="mt-2 grid grid-cols-2 gap-3">
        <Field label="Organizer" value={organizer} onChange={setOrganizer} />
        <Field label="Photographer" value={photographer} onChange={setPhotographer} />
        <Field label="Subject" value={subject} onChange={setSubject} />
      </div>
      <div className="mt-6 flex justify-end gap-2">
        <button
          onClick={onClose}
          className="rounded-full border border-hairline bg-card px-4 py-2 text-xs text-muted-foreground hover:text-ink"
        >
          Cancel
        </button>
        <button
          onClick={upload}
          disabled={busy || !file}
          className="rounded-full bg-primary px-5 py-2 text-xs text-primary-foreground hover:opacity-90 disabled:opacity-50"
        >
          {busy ? "Uploading…" : "Save"}
        </button>
      </div>
    </Modal>
  );
}

function Lightbox({
  item,
  url,
  albums,
  onClose,
  onChanged,
}: {
  item: MediaItem;
  url?: string;
  albums: Album[];
  onClose: () => void;
  onChanged: () => void;
}) {
  const [tab, setTab] = useState<"about" | "access" | "share">("about");
  const [data, setData] = useState<MediaItem>(item);

  useEffect(() => setData(item), [item]);

  const update = async (patch: Partial<MediaItem>) => {
    const next = { ...data, ...patch };
    setData(next);
    await supabase.from("media_items").update(patch).eq("id", item.id);
    onChanged();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex animate-in fade-in"
      onClick={onClose}
    >
      <div className="absolute inset-0 bg-black/85" />
      <div
        className="relative z-10 flex h-full w-full"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex flex-1 items-center justify-center p-8">
          {data.media_type === "photo" ? (
            url && <img src={url} alt="" className="max-h-full max-w-full object-contain" />
          ) : (
            <video src={url} controls className="max-h-full max-w-full" />
          )}
        </div>
        <aside className="flex w-96 flex-col border-l border-hairline bg-background">
          <div className="flex items-center justify-between border-b border-hairline px-5 py-3">
            <div className="flex gap-1">
              {(["about", "access", "share"] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => setTab(t)}
                  className={`rounded-full px-3 py-1.5 text-xs capitalize transition ${
                    tab === t ? "bg-secondary text-ink" : "text-muted-foreground hover:text-ink"
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>
            <button
              onClick={onClose}
              className="rounded-full p-1.5 text-muted-foreground hover:bg-secondary"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-5">
            {tab === "about" && (
              <div className="space-y-3">
                <Field
                  label="Organizer"
                  value={data.organizer ?? ""}
                  onChange={(v) => update({ organizer: v })}
                />
                <Field
                  label="Photographer"
                  value={data.photographer ?? ""}
                  onChange={(v) => update({ photographer: v })}
                />
                <Field
                  label="Subject"
                  value={data.subject ?? ""}
                  onChange={(v) => update({ subject: v })}
                />
                <div>
                  <Label>Current album</Label>
                  <p className="mt-1 text-sm text-ink">
                    {albums.find((a) => a.id === data.album_id)?.name ?? "No album"}
                  </p>
                </div>
                <div>
                  <Label>Move to album</Label>
                  <select
                    value={data.album_id ?? ""}
                    onChange={(e) => update({ album_id: e.target.value || null })}
                    className="mt-1 w-full rounded-xl border border-hairline bg-background px-4 py-2.5 text-sm text-ink outline-none focus:border-primary"
                  >
                    <option value="">No album</option>
                    {albums.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            )}

            {tab === "access" && (
              <div className="space-y-4">
                <Toggle
                  label="World — anyone can view"
                  value={data.visible_world}
                  onChange={(v) => update({ visible_world: v })}
                />
                <Toggle
                  label="Media — registered media houses"
                  value={data.visible_media}
                  onChange={(v) => update({ visible_media: v })}
                />
                <Toggle
                  label="Friends"
                  value={data.visible_friends}
                  onChange={(v) => update({ visible_friends: v })}
                />
                <div>
                  <Label>Specific media houses</Label>
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    Sample list. Verified houses get badged. Others can register a media profile (paid).
                  </p>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {MEDIA_HOUSES.map((h) => {
                      const on = data.allowed_media_houses.includes(h);
                      return (
                        <button
                          key={h}
                          onClick={() => {
                            const next = on
                              ? data.allowed_media_houses.filter((x) => x !== h)
                              : [...data.allowed_media_houses, h];
                            update({ allowed_media_houses: next });
                          }}
                          className={`rounded-full px-3 py-1 text-xs transition ${
                            on
                              ? "bg-primary text-primary-foreground"
                              : "border border-hairline text-muted-foreground hover:text-ink"
                          }`}
                        >
                          {h}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}

            {tab === "share" && <ShareTab url={url} />}
          </div>
        </aside>
      </div>
    </div>
  );
}

function ShareTab({ url }: { url?: string }) {
  const targets = [
    { name: "Instagram", href: "https://www.instagram.com/" },
    { name: "Facebook", href: "https://www.facebook.com/" },
    { name: "Snapchat", href: "https://www.snapchat.com/" },
    { name: "Strava", href: "https://www.strava.com/upload/select" },
  ];

  const nativeShare = async () => {
    if (!url) return;
    if (navigator.share) {
      try {
        await navigator.share({ url });
      } catch {
        /* cancelled */
      }
    } else {
      await navigator.clipboard.writeText(url);
      toast.success("Link copied");
    }
  };

  return (
    <div className="space-y-3">
      <button
        onClick={nativeShare}
        className="w-full rounded-full bg-primary px-5 py-2.5 text-sm text-primary-foreground hover:opacity-90"
      >
        Share / copy link
      </button>
      <div className="grid grid-cols-2 gap-2">
        {targets.map((t) => (
          <a
            key={t.name}
            href={t.href}
            target="_blank"
            rel="noreferrer"
            className="rounded-xl border border-hairline bg-card px-4 py-3 text-center text-sm text-ink hover:bg-secondary"
          >
            {t.name}
          </a>
        ))}
      </div>
      <p className="text-[11px] text-muted-foreground">
        Opens the platform in a new tab. Direct API publishing will be added later.
      </p>
    </div>
  );
}

function Modal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
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
          <h2 className="text-lg text-ink">{title}</h2>
          <button
            onClick={onClose}
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

function Field({
  label,
  value,
  onChange,
  autoFocus,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  autoFocus?: boolean;
}) {
  return (
    <label className="mt-3 block first:mt-0">
      <Label>{label}</Label>
      <input
        autoFocus={autoFocus}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 w-full rounded-xl border border-hairline bg-background px-4 py-2.5 text-sm text-ink outline-none focus:border-primary"
      />
    </label>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <span className="mono text-[10px] uppercase tracking-widest text-muted-foreground">
      {children}
    </span>
  );
}

function Toggle({
  label,
  value,
  onChange,
}: {
  label: string;
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex items-center justify-between gap-3 text-sm text-ink">
      <span>{label}</span>
      <input
        type="checkbox"
        checked={value}
        onChange={(e) => onChange(e.target.checked)}
        className="h-4 w-4 accent-primary"
      />
    </label>
  );
}

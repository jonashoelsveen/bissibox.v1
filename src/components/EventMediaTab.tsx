import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { CheckSquare, Square, Search, X, Trash2, FolderPlus, Hand, Eye } from "lucide-react";

interface Album {
  id: string;
  name: string;
}

interface MediaItem {
  id: string;
  storage_path: string;
  media_type: "photo" | "video";
  album_id: string | null;
  photographer: string | null;
  subject: string | null;
  created_at: string;
}

interface Props {
  eventId: string;
  ownerUserId: string;
  currentUserId: string;
  /** When true, show organizer controls (folder/handpick buttons). When false, read-only viewer mode. */
  organizerMode: boolean;
}

export function EventMediaTab({ eventId, ownerUserId, currentUserId, organizerMode }: Props) {
  const [linked, setLinked] = useState<MediaItem[]>([]);
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [albums, setAlbums] = useState<Album[]>([]);
  const [sortBy, setSortBy] = useState<"date_desc" | "date_asc">("date_desc");
  const [q, setQ] = useState("");
  const [folderOpen, setFolderOpen] = useState(false);
  const [handpickOpen, setHandpickOpen] = useState(false);
  const [lightbox, setLightbox] = useState<MediaItem | null>(null);

  const loadLinked = useCallback(async () => {
    const { data: links } = await supabase
      .from("event_media")
      .select("media_item_id")
      .eq("event_id", eventId);
    const ids = (links ?? []).map((r) => r.media_item_id);
    if (ids.length === 0) {
      setLinked([]);
      return;
    }
    const { data: items } = await supabase
      .from("media_items")
      .select("id,storage_path,media_type,album_id,photographer,subject,created_at")
      .in("id", ids);
    setLinked((items as MediaItem[]) ?? []);
  }, [eventId]);

  const loadAlbums = useCallback(async () => {
    if (!organizerMode) return;
    const { data } = await supabase
      .from("media_albums")
      .select("id,name")
      .eq("user_id", ownerUserId)
      .order("created_at", { ascending: false });
    setAlbums(data ?? []);
  }, [ownerUserId, organizerMode]);

  useEffect(() => {
    void loadLinked();
    void loadAlbums();
  }, [loadLinked, loadAlbums]);

  // Resolve signed URLs for thumbnails
  useEffect(() => {
    let cancel = false;
    (async () => {
      const next: Record<string, string> = { ...urls };
      for (const it of linked) {
        if (next[it.id]) continue;
        const { data } = await supabase.storage.from("media").createSignedUrl(it.storage_path, 3600);
        if (data?.signedUrl) next[it.id] = data.signedUrl;
      }
      if (!cancel) setUrls(next);
    })();
    return () => {
      cancel = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [linked]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const arr = needle
      ? linked.filter(
          (i) =>
            (i.photographer ?? "").toLowerCase().includes(needle) ||
            (i.subject ?? "").toLowerCase().includes(needle),
        )
      : linked;
    return [...arr].sort((a, b) => {
      const ta = +new Date(a.created_at);
      const tb = +new Date(b.created_at);
      return sortBy === "date_desc" ? tb - ta : ta - tb;
    });
  }, [linked, q, sortBy]);

  const detach = async (id: string) => {
    if (!confirm("Remove this item from the event gallery?")) return;
    const { error } = await supabase
      .from("event_media")
      .delete()
      .eq("event_id", eventId)
      .eq("media_item_id", id);
    if (error) return toast.error(error.message);
    toast.success("Removed");
    void loadLinked();
  };

  const attachIds = async (ids: string[]) => {
    if (ids.length === 0) return;
    const existing = new Set(linked.map((i) => i.id));
    const rows = ids
      .filter((id) => !existing.has(id))
      .map((media_item_id) => ({ event_id: eventId, media_item_id, added_by: currentUserId }));
    if (rows.length === 0) {
      toast.info("Already in gallery");
      return;
    }
    const { error } = await supabase.from("event_media").insert(rows as never);
    if (error) return toast.error(error.message);
    toast.success(`Added ${rows.length} item${rows.length === 1 ? "" : "s"}`);
    void loadLinked();
  };

  const attachFolder = async (albumId: string) => {
    const { data } = await supabase
      .from("media_items")
      .select("id")
      .eq("user_id", ownerUserId)
      .eq("album_id", albumId);
    await attachIds((data ?? []).map((d) => d.id));
    setFolderOpen(false);
  };

  return (
    <section className="mt-5 rounded-lg border border-hairline bg-card p-6 md:p-8">
      {organizerMode && (
        <p className="rounded-md border border-hairline bg-secondary/40 px-3 py-2 text-xs text-muted-foreground">
          All content selected here is visible on the event page.
        </p>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search photographer or subject…"
            className="w-full rounded-md border border-hairline bg-background py-2 pl-9 pr-3 text-sm text-ink outline-none focus:border-primary"
          />
        </div>
        <select
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
          className="rounded-md border border-hairline bg-background px-3 py-2 text-sm text-ink outline-none focus:border-primary"
        >
          <option value="date_desc">Newest first</option>
          <option value="date_asc">Oldest first</option>
        </select>
        {organizerMode && (
          <>
            <button
              onClick={() => setFolderOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-md border border-hairline bg-background px-3 py-2 text-sm text-ink hover:bg-secondary"
            >
              <FolderPlus className="h-3.5 w-3.5" /> Select folders
            </button>
            <button
              onClick={() => setHandpickOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-2 text-sm text-primary-foreground hover:opacity-90"
            >
              <Hand className="h-3.5 w-3.5" /> Handpick content
            </button>
          </>
        )}
      </div>

      <div className="mt-5">
        {filtered.length === 0 ? (
          <div className="rounded-md border border-dashed border-hairline bg-background py-12 text-center text-sm text-muted-foreground">
            {organizerMode
              ? "No content selected for this event yet."
              : "No photos or videos for this event yet."}
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-1 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
            {filtered.map((it) => (
              <div
                key={it.id}
                className="group relative aspect-square overflow-hidden rounded-sm bg-secondary"
              >
                <button
                  onClick={() => setLightbox(it)}
                  className="block h-full w-full"
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
                    <video src={urls[it.id]} className="h-full w-full object-cover" muted />
                  )}
                </button>
                {organizerMode && (
                  <button
                    onClick={() => detach(it.id)}
                    title="Remove from event"
                    className="absolute right-1.5 top-1.5 rounded-full bg-background/85 p-1 text-muted-foreground opacity-0 transition group-hover:opacity-100 hover:text-destructive"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {folderOpen && (
        <FolderPickerDialog
          albums={albums}
          onClose={() => setFolderOpen(false)}
          onPick={(id) => void attachFolder(id)}
        />
      )}

      {handpickOpen && (
        <HandpickDialog
          ownerUserId={ownerUserId}
          albums={albums}
          alreadyLinked={new Set(linked.map((l) => l.id))}
          onClose={() => setHandpickOpen(false)}
          onConfirm={async (ids) => {
            await attachIds(ids);
            setHandpickOpen(false);
          }}
        />
      )}

      {lightbox && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-6"
          onClick={() => setLightbox(null)}
        >
          <button
            onClick={() => setLightbox(null)}
            className="absolute right-5 top-5 rounded-full bg-background/20 p-2 text-white hover:bg-background/30"
          >
            <X className="h-4 w-4" />
          </button>
          <div className="max-h-full max-w-full" onClick={(e) => e.stopPropagation()}>
            {lightbox.media_type === "photo" ? (
              <img src={urls[lightbox.id]} alt="" className="max-h-[88vh] max-w-[90vw] object-contain" />
            ) : (
              <video src={urls[lightbox.id]} controls className="max-h-[88vh] max-w-[90vw]" />
            )}
          </div>
        </div>
      )}
    </section>
  );
}

function FolderPickerDialog({
  albums,
  onClose,
  onPick,
}: {
  albums: Album[];
  onClose: () => void;
  onPick: (id: string) => void;
}) {
  const [selected, setSelected] = useState<string>("");
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div
        className="w-full max-w-md rounded-xl border border-hairline bg-card p-5 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-base font-semibold text-ink">Select a folder</h3>
        <p className="mt-1 text-xs text-muted-foreground">
          All content in the chosen folder will be added to this event.
        </p>
        <select
          value={selected}
          onChange={(e) => setSelected(e.target.value)}
          className="mt-4 w-full rounded-md border border-hairline bg-background px-3 py-2 text-sm text-ink outline-none focus:border-primary"
        >
          <option value="">— Choose folder —</option>
          {albums.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </select>
        <div className="mt-5 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="rounded-md border border-hairline bg-background px-3 py-1.5 text-sm text-ink hover:bg-secondary"
          >
            Cancel
          </button>
          <button
            disabled={!selected}
            onClick={() => onPick(selected)}
            className="rounded-md bg-primary px-4 py-1.5 text-sm text-primary-foreground hover:opacity-90 disabled:opacity-50"
          >
            Add folder
          </button>
        </div>
      </div>
    </div>
  );
}

function HandpickDialog({
  ownerUserId,
  albums,
  alreadyLinked,
  onClose,
  onConfirm,
}: {
  ownerUserId: string;
  albums: Album[];
  alreadyLinked: Set<string>;
  onClose: () => void;
  onConfirm: (ids: string[]) => Promise<void> | void;
}) {
  const [activeAlbum, setActiveAlbum] = useState<string | "all" | "unsorted">("all");
  const [items, setItems] = useState<MediaItem[]>([]);
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [marking, setMarking] = useState(false);
  const [marked, setMarked] = useState<Set<string>>(new Set());
  const [picked, setPicked] = useState<MediaItem[]>([]);
  // Track ids that are mid-flight animating to the right side
  const [flying, setFlying] = useState<{ id: string; from: DOMRect; to: DOMRect; url: string }[]>([]);
  const sidebarRef = useRef<HTMLDivElement>(null);
  const tileRefs = useRef<Record<string, HTMLButtonElement | null>>({});

  useEffect(() => {
    (async () => {
      let q = supabase
        .from("media_items")
        .select("id,storage_path,media_type,album_id,photographer,subject,created_at")
        .eq("user_id", ownerUserId)
        .order("created_at", { ascending: false });
      if (activeAlbum === "unsorted") q = q.is("album_id", null);
      else if (activeAlbum !== "all") q = q.eq("album_id", activeAlbum);
      const { data } = await q;
      setItems((data as MediaItem[]) ?? []);
    })();
  }, [activeAlbum, ownerUserId]);

  useEffect(() => {
    let cancel = false;
    (async () => {
      const next: Record<string, string> = { ...urls };
      for (const it of items) {
        if (next[it.id]) continue;
        const { data } = await supabase.storage.from("media").createSignedUrl(it.storage_path, 3600);
        if (data?.signedUrl) next[it.id] = data.signedUrl;
      }
      if (!cancel) setUrls(next);
    })();
    return () => {
      cancel = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items]);

  const toggleMark = (id: string) => {
    setMarked((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  };

  const confirmSelection = () => {
    const newOnes = items.filter((it) => marked.has(it.id) && !picked.some((p) => p.id === it.id));
    if (newOnes.length === 0) {
      setMarking(false);
      setMarked(new Set());
      return;
    }
    // Animate them flying to the right
    const target = sidebarRef.current?.getBoundingClientRect();
    const fly = newOnes
      .map((it) => {
        const el = tileRefs.current[it.id];
        if (!el || !target) return null;
        return {
          id: it.id,
          from: el.getBoundingClientRect(),
          to: target,
          url: urls[it.id] ?? "",
        };
      })
      .filter(Boolean) as { id: string; from: DOMRect; to: DOMRect; url: string }[];
    setFlying((f) => [...f, ...fly]);

    // After animation, commit to picked list and clear flying
    setTimeout(() => {
      setPicked((p) => [...p, ...newOnes]);
      setFlying((f) => f.filter((x) => !newOnes.some((n) => n.id === x.id)));
    }, 650);

    setMarking(false);
    setMarked(new Set());
  };

  const removePicked = (id: string) => setPicked((p) => p.filter((x) => x.id !== id));

  return (
    <div className="fixed inset-0 z-50 flex bg-black/70" onClick={onClose}>
      <div
        className="m-auto flex h-[88vh] w-[94vw] max-w-6xl overflow-hidden rounded-xl border border-hairline bg-card shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Left: albums nav */}
        <nav className="w-48 shrink-0 border-r border-hairline bg-background px-2 py-3">
          <p className="mono px-2 pb-2 text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
            Albums
          </p>
          <button
            onClick={() => setActiveAlbum("all")}
            className={`w-full rounded-md px-3 py-1.5 text-left text-sm transition ${
              activeAlbum === "all" ? "bg-secondary text-ink" : "text-muted-foreground hover:text-ink"
            }`}
          >
            All
          </button>
          <button
            onClick={() => setActiveAlbum("unsorted")}
            className={`w-full rounded-md px-3 py-1.5 text-left text-sm transition ${
              activeAlbum === "unsorted" ? "bg-secondary text-ink" : "text-muted-foreground hover:text-ink"
            }`}
          >
            Unsorted
          </button>
          {albums.map((a) => (
            <button
              key={a.id}
              onClick={() => setActiveAlbum(a.id)}
              className={`w-full truncate rounded-md px-3 py-1.5 text-left text-sm transition ${
                activeAlbum === a.id ? "bg-secondary text-ink" : "text-muted-foreground hover:text-ink"
              }`}
            >
              {a.name}
            </button>
          ))}
        </nav>

        {/* Middle: browser */}
        <div className="flex min-w-0 flex-1 flex-col">
          <header className="flex items-center justify-between border-b border-hairline px-5 py-3">
            <h3 className="text-base font-semibold text-ink">Handpick content</h3>
            <div className="flex items-center gap-2">
              {marking ? (
                <>
                  <button
                    onClick={confirmSelection}
                    disabled={marked.size === 0}
                    className="rounded-full bg-primary px-3 py-1.5 text-xs text-primary-foreground hover:opacity-90 disabled:opacity-50"
                  >
                    Choose ({marked.size}) for this event
                  </button>
                  <button
                    onClick={() => {
                      setMarking(false);
                      setMarked(new Set());
                    }}
                    className="rounded-full border border-hairline bg-background px-3 py-1.5 text-xs text-muted-foreground hover:text-ink"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </>
              ) : (
                <button
                  onClick={() => setMarking(true)}
                  className="inline-flex items-center gap-1.5 rounded-full border border-hairline bg-background px-3 py-1.5 text-xs text-ink hover:bg-secondary"
                >
                  <CheckSquare className="h-3.5 w-3.5" /> Mark
                </button>
              )}
            </div>
          </header>
          <div className="flex-1 overflow-y-auto p-4">
            {items.length === 0 ? (
              <p className="py-12 text-center text-sm text-muted-foreground">No content here.</p>
            ) : (
              <div className="grid grid-cols-3 gap-1 md:grid-cols-4 lg:grid-cols-5">
                {items.map((it) => {
                  const isMarked = marked.has(it.id);
                  const isPicked = picked.some((p) => p.id === it.id);
                  const isLinked = alreadyLinked.has(it.id);
                  return (
                    <button
                      key={it.id}
                      ref={(el) => {
                        tileRefs.current[it.id] = el;
                      }}
                      onClick={() => {
                        if (marking) toggleMark(it.id);
                      }}
                      className={`group relative aspect-square overflow-hidden rounded-sm bg-secondary ${
                        isPicked || isLinked ? "opacity-50" : ""
                      }`}
                    >
                      {it.media_type === "photo" ? (
                        urls[it.id] && (
                          <img src={urls[it.id]} alt="" className="h-full w-full object-cover" />
                        )
                      ) : (
                        <video src={urls[it.id]} className="h-full w-full object-cover" muted />
                      )}
                      {marking && (
                        <div className="absolute left-1.5 top-1.5 rounded-full bg-background/80 p-0.5">
                          {isMarked ? (
                            <CheckSquare className="h-4 w-4 text-primary" />
                          ) : (
                            <Square className="h-4 w-4 text-muted-foreground" />
                          )}
                        </div>
                      )}
                      {(isPicked || isLinked) && (
                        <div className="absolute inset-0 flex items-center justify-center bg-black/30">
                          <span className="rounded-full bg-primary px-2 py-0.5 text-[10px] text-primary-foreground">
                            {isLinked ? "In gallery" : "Picked"}
                          </span>
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Right: picked sidebar */}
        <aside
          ref={sidebarRef}
          className="flex w-72 shrink-0 flex-col border-l border-hairline bg-background"
        >
          <header className="border-b border-hairline px-4 py-3">
            <p className="mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
              Selected
            </p>
            <p className="mt-0.5 text-sm text-ink">{picked.length} item(s)</p>
          </header>
          <div className="flex-1 overflow-y-auto p-3">
            {picked.length === 0 ? (
              <p className="py-8 text-center text-xs text-muted-foreground">
                Nothing yet. Click "Mark" then choose items.
              </p>
            ) : (
              <ul className="grid grid-cols-3 gap-1">
                {picked.map((it) => (
                  <li
                    key={it.id}
                    className="group relative aspect-square overflow-hidden rounded-sm bg-secondary"
                  >
                    {it.media_type === "photo" ? (
                      urls[it.id] && (
                        <img src={urls[it.id]} alt="" className="h-full w-full object-cover" />
                      )
                    ) : (
                      <video src={urls[it.id]} className="h-full w-full object-cover" muted />
                    )}
                    <button
                      onClick={() => removePicked(it.id)}
                      className="absolute right-0.5 top-0.5 rounded-full bg-background/85 p-0.5 text-muted-foreground opacity-0 transition group-hover:opacity-100 hover:text-destructive"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <footer className="border-t border-hairline p-3">
            <button
              onClick={() => onConfirm(picked.map((p) => p.id))}
              disabled={picked.length === 0}
              className="w-full rounded-md bg-primary py-2 text-sm text-primary-foreground hover:opacity-90 disabled:opacity-50"
            >
              Done · Add {picked.length} to event
            </button>
            <button
              onClick={onClose}
              className="mt-2 w-full rounded-md border border-hairline bg-background py-1.5 text-xs text-muted-foreground hover:text-ink"
            >
              Cancel
            </button>
          </footer>
        </aside>
      </div>

      {/* Flying thumbnails animation layer */}
      {flying.map((f) => (
        <FlyingThumb key={f.id + f.from.left} fly={f} />
      ))}
    </div>
  );
}

function FlyingThumb({ fly }: { fly: { id: string; from: DOMRect; to: DOMRect; url: string } }) {
  const [pos, setPos] = useState({ left: fly.from.left, top: fly.from.top, scale: 1, opacity: 1 });
  useEffect(() => {
    const t = requestAnimationFrame(() => {
      setPos({
        left: fly.to.left + 24,
        top: fly.to.top + 24,
        scale: 0.2,
        opacity: 0,
      });
    });
    return () => cancelAnimationFrame(t);
  }, [fly]);
  return (
    <div
      className="pointer-events-none fixed z-[60] overflow-hidden rounded-sm shadow-lg transition-all duration-[600ms] ease-[cubic-bezier(0.65,-0.05,0.35,1)]"
      style={{
        left: pos.left,
        top: pos.top,
        width: fly.from.width,
        height: fly.from.height,
        transform: `scale(${pos.scale})`,
        opacity: pos.opacity,
        transformOrigin: "top left",
      }}
    >
      {fly.url && <img src={fly.url} alt="" className="h-full w-full object-cover" />}
    </div>
  );
}

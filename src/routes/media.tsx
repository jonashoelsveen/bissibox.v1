import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
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
  Search,
  Instagram,
  Facebook,
  Share2,
  Link2,
  Activity,
  Ghost,
  ArrowUp,
  MoreVertical,
  User as UserIcon,
  Camera,
  Users as UsersIcon,
  Building2,
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
  user_id: string;
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

interface AttendedEvent {
  id: string;
  title: string;
  organizer: string;
  starts_at: string;
}

const MEDIA_HOUSES = ["VG", "NRK", "TV2", "Dagbladet", "Aftenposten"];

function MediaPage() {
  const { user, mode, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const isTeamMode = mode === "team" || mode === "organizer";
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
  const [openItems, setOpenItems] = useState<MediaItem[] | null>(null);
  const [attended, setAttended] = useState<AttendedEvent[]>([]);
  const [userName, setUserName] = useState<string>("");
  const [revealed, setRevealed] = useState<Set<string>>(new Set());
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const [itemAlbums, setItemAlbums] = useState<Record<string, string[]>>({});

  const setAsCover = async (
    mediaId: string,
    target: "athlete" | "photographer" | "team" | "company",
  ) => {
    if (!user) return;
    if (target === "athlete") {
      const { error } = await supabase
        .from("profiles")
        .update({ athlete_cover_media_id: mediaId })
        .eq("id", user.id);
      if (error) toast.error(error.message);
      else toast.success("Set as athlete profile image");
    } else if (target === "photographer") {
      const { error } = await supabase
        .from("profiles")
        .update({ photographer_cover_media_id: mediaId })
        .eq("id", user.id);
      if (error) toast.error(error.message);
      else toast.success("Set as photographer profile image");
    } else if (target === "team") {
      const { data: team } = await supabase
        .from("teams")
        .select("id")
        .eq("owner_id", user.id)
        .maybeSingle();
      if (!team) {
        toast.error("No team found");
        return;
      }
      const { error } = await supabase
        .from("teams")
        .update({ cover_media_id: mediaId })
        .eq("id", team.id);
      if (error) toast.error(error.message);
      else toast.success("Set as team profile image");
    }
    setMenuFor(null);
  };

  useEffect(() => {
    if (!authLoading && !user) navigate({ to: "/auth" });
  }, [authLoading, user, navigate]);

  const load = useCallback(async () => {
    if (!user) return;
    const [{ data: a }, { data: r }, { data: p }] = await Promise.all([
      supabase.from("media_albums").select("id,name").order("created_at", { ascending: false }),
      supabase
        .from("registrations")
        .select("event_id, events(id,title,organizer,starts_at)")
        .eq("user_id", user.id),
      supabase.from("profiles").select("first_name,last_name,email").eq("id", user.id).maybeSingle(),
    ]);
    setAlbums(a ?? []);
    const name =
      [p?.first_name, p?.last_name].filter(Boolean).join(" ").trim() ||
      p?.email ||
      user.email ||
      "";
    setUserName(name);

    if (isTeamMode) {
      const { data: team } = await supabase
        .from("teams")
        .select("id,name")
        .eq("owner_id", user.id)
        .maybeSingle();
      if (!team) {
        setItems([]);
        setAttended([]);
        return;
      }
      const { data: members } = await supabase
        .from("team_members")
        .select("user_id")
        .eq("team_id", team.id)
        .eq("accepted", true);
      const memberIds = Array.from(
        new Set([user.id, ...((members ?? []).map((m) => m.user_id))]),
      );
      const { data: orgEvents } = await supabase
        .from("events")
        .select("id,title,organizer,starts_at")
        .eq("organizer", team.name);
      const orgEventIds = (orgEvents ?? []).map((e) => e.id);
      const orFilter: string[] = [`user_id.in.(${memberIds.join(",")})`];
      if (orgEventIds.length > 0) orFilter.push(`event_id.in.(${orgEventIds.join(",")})`);
      const { data: m } = await supabase
        .from("media_items")
        .select("*")
        .or(orFilter.join(","))
        .order("created_at", { ascending: false });
      setItems((m as MediaItem[]) ?? []);
      setAttended((orgEvents as AttendedEvent[]) ?? []);
    } else {
      const { data: m } = await supabase
        .from("media_items")
        .select("*")
        .order("created_at", { ascending: false });
      const subjectName = name.toLowerCase();
      const filteredItems = ((m as MediaItem[]) ?? []).filter(
        (it) =>
          it.user_id === user.id ||
          (subjectName && (it.subject ?? "").toLowerCase().includes(subjectName)),
      );
      setItems(filteredItems);
      const ev: AttendedEvent[] = [];
      const seen = new Set<string>();
      type Reg = { events: AttendedEvent | null };
      for (const row of (r as unknown as Reg[]) ?? []) {
        const e = row.events;
        if (e && !seen.has(e.id)) {
          seen.add(e.id);
          ev.push(e);
        }
      }
      setAttended(ev);
    }

    // Load many-to-many album links for the visible items
    const itemIds = (isTeamMode ? [] : []).concat(); // placeholder, refilled below
    // We re-derive after setItems; query separately using user.id-owned items + linked items
    const { data: links } = await supabase
      .from("media_item_albums")
      .select("media_item_id,album_id");
    const map: Record<string, string[]> = {};
    for (const row of (links as { media_item_id: string; album_id: string }[] | null) ?? []) {
      (map[row.media_item_id] ??= []).push(row.album_id);
    }
    setItemAlbums(map);
    void itemIds;
  }, [user, isTeamMode]);

  useEffect(() => {
    void load();
  }, [load]);

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
    if (view.id === null) {
      // Unsorted = items with zero album links
      return items.filter((i) => (itemAlbums[i.id]?.length ?? 0) === 0 && !i.album_id);
    }
    return items.filter(
      (i) => itemAlbums[i.id]?.includes(view.id as string) || i.album_id === view.id,
    );
  }, [items, view, itemAlbums]);

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

  const openSelected = () => {
    if (selected.size === 0) return;
    const list = items.filter((i) => selected.has(i.id));
    setOpenItems(list);
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
      <div className="flex justify-end gap-2 pt-4 pr-14">
        {selectMode ? (
          <div className="flex items-center gap-2 rounded-full border border-hairline bg-card p-1 pr-2">
            <button
              onClick={openSelected}
              disabled={selected.size === 0}
              className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs text-ink hover:bg-secondary disabled:opacity-40"
            >
              <Eye className="h-3.5 w-3.5" /> Open ({selected.size})
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
                const isRevealed = revealed.has(it.id);
                const eventTitle = attended.find((e) => e.id === it.event_id)?.title;
                return (
                  <div
                    key={it.id}
                    onClick={() => {
                      if (selectMode) toggleSel(it.id);
                      else setOpenItems([it]);
                    }}
                    className="group relative aspect-square cursor-default overflow-hidden rounded-sm bg-secondary"
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
                    {selectMode && (
                      <div className="absolute left-2 top-2 rounded-full bg-background/80 p-0.5">
                        {isSel ? (
                          <CheckSquare className="h-4 w-4 text-primary" />
                        ) : (
                          <Square className="h-4 w-4 text-muted-foreground" />
                        )}
                      </div>
                    )}
                    <div
                      className={`pointer-events-none absolute inset-0 bg-black/55 transition-opacity duration-300 ${
                        isRevealed ? "opacity-100" : "opacity-0"
                      }`}
                    />
                    <div
                      className={`absolute inset-x-0 top-0 space-y-1 p-3 text-[11px] leading-tight text-white transition-all duration-300 ${
                        isRevealed ? "pointer-events-auto translate-y-0 opacity-100" : "pointer-events-none -translate-y-1 opacity-0"
                      }`}
                    >
                      <InfoLine label="Subject" value={it.subject} />
                      <InfoLine
                        label="Event"
                        value={eventTitle ?? null}
                        to={it.event_id ? "/events/$eventId" : undefined}
                        params={it.event_id ? { eventId: it.event_id } : undefined}
                      />
                      <InfoLine
                        label="Photograph"
                        value={
                          it.organizer
                            ? `${it.photographer ?? "—"} (${it.organizer})`
                            : it.photographer
                        }
                        to={it.user_id ? "/u/$userId" : undefined}
                        params={it.user_id ? { userId: it.user_id } : undefined}
                      />
                    </div>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setRevealed((s) => {
                          const n = new Set(s);
                          if (n.has(it.id)) n.delete(it.id);
                          else n.add(it.id);
                          return n;
                        });
                      }}
                      className="absolute bottom-2 left-2 z-10 cursor-pointer rounded-full bg-black/50 p-1.5 text-white transition hover:bg-black/70"
                      aria-label="Show details"
                    >
                      <ArrowUp className="h-3.5 w-3.5" />
                    </button>

                    {it.user_id === user.id && (
                      <div className="absolute right-2 top-2 z-10">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setMenuFor((c) => (c === it.id ? null : it.id));
                          }}
                          className="rounded-full bg-black/50 p-1.5 text-white transition hover:bg-black/70"
                          aria-label="More"
                        >
                          <MoreVertical className="h-3.5 w-3.5" />
                        </button>
                        {menuFor === it.id && (
                          <div
                            onClick={(e) => e.stopPropagation()}
                            className="absolute right-0 top-9 z-20 w-56 overflow-hidden rounded-lg border border-hairline bg-card text-xs shadow-xl"
                          >
                            <p className="mono px-3 pt-2 pb-1 text-[9px] uppercase tracking-widest text-muted-foreground">
                              Use as profile image
                            </p>
                            <button
                              onClick={() => void setAsCover(it.id, "athlete")}
                              className="flex w-full items-center gap-2 px-3 py-2 text-left text-ink hover:bg-secondary"
                            >
                              <UserIcon className="h-3.5 w-3.5" /> Athlete
                            </button>
                            <button
                              onClick={() => void setAsCover(it.id, "photographer")}
                              className="flex w-full items-center gap-2 px-3 py-2 text-left text-ink hover:bg-secondary"
                            >
                              <Camera className="h-3.5 w-3.5" /> Photographer
                            </button>
                            <button
                              onClick={() => void setAsCover(it.id, "team")}
                              className="flex w-full items-center gap-2 px-3 py-2 text-left text-ink hover:bg-secondary"
                            >
                              <UsersIcon className="h-3.5 w-3.5" /> Team
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
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
          attended={attended}
          userId={user.id}
          userName={userName}
          onClose={() => setUploadOpen(false)}
          onUploaded={() => {
            setUploadOpen(false);
            void load();
          }}
        />
      )}
      {openItems && (
        <Lightbox
          items={openItems}
          urls={urls}
          albums={albums}
          attended={attended}
          userName={userName}
          itemAlbums={itemAlbums}
          onClose={() => {
            setOpenItems(null);
            exitSelect();
          }}
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

function InfoLine({
  label,
  value,
  to,
  params,
}: {
  label: string;
  value: string | null | undefined;
  to?: "/events/$eventId" | "/u/$userId";
  params?: { eventId: string } | { userId: string };
}) {
  const text = value && value.trim() ? value : "—";
  const linkable = !!to && !!params && text !== "—";
  return (
    <div onClick={(e) => e.stopPropagation()}>
      <span className="mono text-[9px] uppercase tracking-widest text-white/60">{label}: </span>
      {linkable ? (
        <Link to={to} params={params as never} className="text-white underline-offset-2 hover:underline">
          {text}
        </Link>
      ) : (
        <span className="text-white/90">{text}</span>
      )}
    </div>
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
  attended,
  userId,
  userName,
  onClose,
  onUploaded,
}: {
  albums: Album[];
  attended: AttendedEvent[];
  userId: string;
  userName: string;
  onClose: () => void;
  onUploaded: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [albumIds, setAlbumIds] = useState<string[]>([]);
  const [eventId, setEventId] = useState<string | null>(null);
  const [eventName, setEventName] = useState("");
  const [organizer, setOrganizer] = useState("");
  const [subject, setSubject] = useState("");
  const [busy, setBusy] = useState(false);

  // Photographer is locked to user (team logic later)
  const photographer = userName || "You";

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
      const { data: inserted, error: insErr } = await supabase
        .from("media_items")
        .insert({
          user_id: userId,
          storage_path: path,
          media_type: isVideo ? "video" : "photo",
          mime_type: file.type,
          file_size: file.size,
          album_id: albumIds[0] ?? null,
          event_id: eventId,
          organizer: organizer || null,
          photographer,
          subject: subject || null,
        })
        .select("id")
        .single();
      if (insErr) throw insErr;
      if (inserted && albumIds.length > 0) {
        await syncMediaAlbums([inserted.id], albumIds, "replace");
      }
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
        <Label>Albums</Label>
        <div className="mt-1">
          <AlbumMultiSelect
            albums={albums}
            value={albumIds}
            onChange={setAlbumIds}
            placeholder="No album"
          />
        </div>
        <p className="mt-1 text-[11px] text-muted-foreground">
          Add this content to one or more albums.
        </p>
      </div>

      <p className="mt-6 mono text-[10px] uppercase tracking-widest text-muted-foreground">
        About
      </p>
      <div className="mt-2 space-y-3">
        <EventPicker
          attended={attended}
          eventId={eventId}
          eventName={eventName}
          onChange={(id, name, org) => {
            setEventId(id);
            setEventName(name);
            if (org) setOrganizer(org);
          }}
        />
        <Field label="Organizer" value={organizer} onChange={setOrganizer} />
        <div>
          <Label>Photographer</Label>
          <div className="mt-1 flex items-center justify-between rounded-xl border border-hairline bg-secondary/40 px-4 py-2.5 text-sm text-ink">
            <span>{photographer}</span>
            <span className="mono text-[10px] uppercase tracking-widest text-muted-foreground">
              Locked
            </span>
          </div>
          <p className="mt-1 text-[11px] text-muted-foreground">
            You're not part of a team yet. Teams will let you assign photographers later.
          </p>
        </div>
        <SubjectPicker
          eventId={eventId}
          subject={subject}
          onChange={setSubject}
        />
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

function EventPicker({
  attended,
  eventId,
  eventName,
  onChange,
}: {
  attended: AttendedEvent[];
  eventId: string | null;
  eventName: string;
  onChange: (id: string | null, name: string, organizer: string | null) => void;
}) {
  const [q, setQ] = useState(eventName);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    setQ(eventName);
  }, [eventName]);

  const matches = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return attended.slice(0, 8);
    return attended
      .filter((e) => e.title.toLowerCase().includes(needle))
      .slice(0, 8);
  }, [attended, q]);

  const ownDefined = !eventId && q.trim().length > 0;

  return (
    <div>
      <Label>Event</Label>
      <div className="relative mt-1">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
        <input
          value={q}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          onChange={(e) => {
            setQ(e.target.value);
            onChange(null, e.target.value, null);
            setOpen(true);
          }}
          placeholder="Search attended events or type your own…"
          className="w-full rounded-xl border border-hairline bg-background pl-9 pr-3 py-2.5 text-sm text-ink outline-none focus:border-primary"
        />
        {open && (matches.length > 0 || ownDefined) && (
          <div className="absolute left-0 right-0 top-full z-20 mt-1 max-h-56 overflow-y-auto rounded-xl border border-hairline bg-popover p-1 shadow-lg">
            {matches.map((e) => (
              <button
                key={e.id}
                onMouseDown={(ev) => {
                  ev.preventDefault();
                  onChange(e.id, e.title, e.organizer);
                  setQ(e.title);
                  setOpen(false);
                }}
                className="block w-full rounded-md px-3 py-2 text-left text-sm text-ink hover:bg-secondary"
              >
                <div>{e.title}</div>
                <div className="text-[11px] text-muted-foreground">{e.organizer}</div>
              </button>
            ))}
            {ownDefined && (
              <div className="border-t border-hairline px-3 py-2 text-[11px] text-muted-foreground">
                Use "{q}" as own-defined event
              </div>
            )}
          </div>
        )}
      </div>
      {ownDefined && (
        <p className="mt-1 text-[11px] text-muted-foreground">
          Own-defined event — subject must be entered manually.
        </p>
      )}
    </div>
  );
}

function SubjectPicker({
  eventId,
  subject,
  onChange,
}: {
  eventId: string | null;
  subject: string;
  onChange: (v: string) => void;
}) {
  const [participants, setParticipants] = useState<string[]>([]);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!eventId) {
      setParticipants([]);
      return;
    }
    (async () => {
      const { data } = await supabase
        .from("registrations")
        .select("user_id, profiles:user_id(first_name,last_name)")
        .eq("event_id", eventId);
      type Row = { profiles: { first_name: string | null; last_name: string | null } | null };
      const names = ((data as unknown as Row[]) ?? [])
        .map((r) =>
          [r.profiles?.first_name, r.profiles?.last_name].filter(Boolean).join(" ").trim(),
        )
        .filter((n) => n.length > 0);
      setParticipants(Array.from(new Set(names)));
    })();
  }, [eventId]);

  const matches = useMemo(() => {
    const needle = subject.trim().toLowerCase();
    if (!needle) return participants.slice(0, 8);
    return participants.filter((n) => n.toLowerCase().includes(needle)).slice(0, 8);
  }, [participants, subject]);

  return (
    <div>
      <Label>Subject</Label>
      <div className="relative mt-1">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
        <input
          value={subject}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          onChange={(e) => {
            onChange(e.target.value);
            setOpen(true);
          }}
          placeholder={
            eventId ? "Pick from participants…" : "Type subject (own-defined event)…"
          }
          className="w-full rounded-xl border border-hairline bg-background pl-9 pr-3 py-2.5 text-sm text-ink outline-none focus:border-primary"
        />
        {open && eventId && matches.length > 0 && (
          <div className="absolute left-0 right-0 top-full z-20 mt-1 max-h-56 overflow-y-auto rounded-xl border border-hairline bg-popover p-1 shadow-lg">
            {matches.map((n) => (
              <button
                key={n}
                onMouseDown={(ev) => {
                  ev.preventDefault();
                  onChange(n);
                  setOpen(false);
                }}
                className="block w-full rounded-md px-3 py-2 text-left text-sm text-ink hover:bg-secondary"
              >
                {n}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function Lightbox({
  items,
  urls,
  albums,
  attended,
  userName,
  itemAlbums,
  onClose,
  onChanged,
}: {
  items: MediaItem[];
  urls: Record<string, string>;
  albums: Album[];
  attended: AttendedEvent[];
  userName: string;
  itemAlbums: Record<string, string[]>;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [tab, setTab] = useState<"about" | "access" | "share">("about");
  const [idx, setIdx] = useState(0);
  const isMulti = items.length > 1;
  const current = items[idx];
  const url = current ? urls[current.id] : undefined;

  return (
    <div className="fixed inset-0 z-50 flex animate-in fade-in" onClick={onClose}>
      <div className="absolute inset-0 bg-black/85" />
      <div
        className="relative z-10 flex h-full w-full"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex flex-1 flex-col items-center justify-center p-8">
          <div className="flex flex-1 items-center justify-center">
            {current?.media_type === "photo" ? (
              url && <img src={url} alt="" className="max-h-full max-w-full object-contain" />
            ) : (
              <video src={url} controls className="max-h-full max-w-full" />
            )}
          </div>
          {isMulti && (
            <div className="mt-4 flex flex-wrap items-center justify-center gap-1.5">
              {items.map((it, i) => (
                <button
                  key={it.id}
                  onClick={() => setIdx(i)}
                  className={`h-12 w-12 overflow-hidden rounded ${
                    i === idx ? "ring-2 ring-primary" : "opacity-60 hover:opacity-100"
                  }`}
                >
                  {it.media_type === "photo" && urls[it.id] && (
                    <img src={urls[it.id]} alt="" className="h-full w-full object-cover" />
                  )}
                </button>
              ))}
            </div>
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
              <AboutPanel
                items={items}
                albums={albums}
                attended={attended}
                userName={userName}
                itemAlbums={itemAlbums}
                onSaved={onChanged}
              />
            )}
            {tab === "access" && (
              <AccessPanel items={items} onSaved={onChanged} />
            )}
            {tab === "share" && <SharePanel url={url} disabled={isMulti} />}
          </div>
        </aside>
      </div>
    </div>
  );
}

function AboutPanel({
  items,
  albums,
  attended,
  userName,
  itemAlbums,
  onSaved,
}: {
  items: MediaItem[];
  albums: Album[];
  attended: AttendedEvent[];
  userName: string;
  itemAlbums: Record<string, string[]>;
  onSaved: () => void;
}) {
  const isMulti = items.length > 1;
  const single = items[0];

  // Single-edit state
  const [eventId, setEventId] = useState<string | null>(single.event_id);
  const [eventName, setEventName] = useState<string>(
    attended.find((e) => e.id === single.event_id)?.title ?? "",
  );
  const [organizer, setOrganizer] = useState(single.organizer ?? "");
  const [subject, setSubject] = useState(single.subject ?? "");
  const initialAlbums = useMemo(() => {
    const fromMap = itemAlbums[single.id] ?? [];
    if (fromMap.length > 0) return fromMap;
    return single.album_id ? [single.album_id] : [];
  }, [itemAlbums, single]);
  const [albumIds, setAlbumIds] = useState<string[]>(initialAlbums);

  // Multi-edit state — show albums shared by ALL selected
  const sharedAlbums = useMemo(() => {
    if (items.length === 0) return [] as string[];
    const sets = items.map((i) => new Set(itemAlbums[i.id] ?? (i.album_id ? [i.album_id] : [])));
    return [...sets[0]].filter((id) => sets.every((s) => s.has(id)));
  }, [items, itemAlbums]);
  const [moveAlbumIds, setMoveAlbumIds] = useState<string[]>(sharedAlbums);

  const [busy, setBusy] = useState(false);
  const photographer = userName || "You";

  const saveSingle = async () => {
    setBusy(true);
    const { error } = await supabase
      .from("media_items")
      .update({
        event_id: eventId,
        organizer: organizer || null,
        subject: subject || null,
        album_id: albumIds[0] ?? null,
        photographer,
      })
      .eq("id", single.id);
    if (!error) {
      await syncMediaAlbums([single.id], albumIds, "replace");
    }
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("Saved");
    onSaved();
  };

  const saveMove = async () => {
    setBusy(true);
    const ids = items.map((i) => i.id);
    const { error } = await supabase
      .from("media_items")
      .update({ album_id: moveAlbumIds[0] ?? null })
      .in("id", ids);
    if (!error) {
      await syncMediaAlbums(ids, moveAlbumIds, "replace");
    }
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success(`Updated ${items.length} items`);
    onSaved();
  };

  if (isMulti) {
    return (
      <div className="space-y-4">
        <p className="rounded-lg border border-hairline bg-secondary/40 px-3 py-2 text-[11px] text-muted-foreground">
          {items.length} items selected. Choose one or more albums to assign them all to.
        </p>
        <div>
          <Label>Move to albums</Label>
          <div className="mt-1">
            <AlbumMultiSelect
              albums={albums}
              value={moveAlbumIds}
              onChange={setMoveAlbumIds}
              placeholder="No album (Unsorted)"
            />
          </div>
          <p className="mt-1 text-[11px] text-muted-foreground">
            Selected albums will replace each item's existing album set.
          </p>
        </div>
        <button
          onClick={saveMove}
          disabled={busy}
          className="w-full rounded-full bg-primary px-5 py-2.5 text-sm text-primary-foreground hover:opacity-90 disabled:opacity-50"
        >
          {busy ? "Saving…" : "Save"}
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <EventPicker
        attended={attended}
        eventId={eventId}
        eventName={eventName}
        onChange={(id, name, org) => {
          setEventId(id);
          setEventName(name);
          if (org && !organizer) setOrganizer(org);
        }}
      />
      <Field label="Organizer" value={organizer} onChange={setOrganizer} />
      <div>
        <Label>Photographer</Label>
        <div className="mt-1 flex items-center justify-between rounded-xl border border-hairline bg-secondary/40 px-4 py-2.5 text-sm text-ink">
          <span>{photographer}</span>
          <span className="mono text-[10px] uppercase tracking-widest text-muted-foreground">
            Locked
          </span>
        </div>
      </div>
      <SubjectPicker eventId={eventId} subject={subject} onChange={setSubject} />
      <div>
        <Label>Albums</Label>
        <div className="mt-1">
          <AlbumMultiSelect
            albums={albums}
            value={albumIds}
            onChange={setAlbumIds}
            placeholder="No album"
          />
        </div>
        <p className="mt-1 text-[11px] text-muted-foreground">
          This content can live in more than one album.
        </p>
      </div>
      <button
        onClick={saveSingle}
        disabled={busy}
        className="w-full rounded-full bg-primary px-5 py-2.5 text-sm text-primary-foreground hover:opacity-90 disabled:opacity-50"
      >
        {busy ? "Saving…" : "Save"}
      </button>
    </div>
  );
}

function AccessPanel({ items, onSaved }: { items: MediaItem[]; onSaved: () => void }) {
  const isMulti = items.length > 1;
  const first = items[0];
  const [world, setWorld] = useState(first.visible_world);
  const [media, setMedia] = useState(first.visible_media);
  const [friends, setFriends] = useState(first.visible_friends);
  const [houses, setHouses] = useState<string[]>(first.allowed_media_houses);
  const [busy, setBusy] = useState(false);

  const save = async () => {
    setBusy(true);
    const ids = items.map((i) => i.id);
    const { error } = await supabase
      .from("media_items")
      .update({
        visible_world: world,
        visible_media: media,
        visible_friends: friends,
        allowed_media_houses: houses,
      })
      .in("id", ids);
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success(isMulti ? `Updated access for ${items.length} items` : "Saved");
    onSaved();
  };

  return (
    <div className="space-y-3">
      {isMulti && (
        <p className="rounded-lg border border-hairline bg-secondary/40 px-3 py-2 text-[11px] text-muted-foreground">
          Update access for all {items.length} selected items.
        </p>
      )}
      <AccessGroup
        title="World"
        checked={world}
        onChange={setWorld}
        searchPlaceholder="Search registered users…"
        items={[]}
        emptyHint="When checked, anyone on the platform can view."
      />
      <AccessGroup
        title="Media"
        checked={media}
        onChange={setMedia}
        searchPlaceholder="Search media houses…"
        items={MEDIA_HOUSES}
        selected={houses}
        onToggleItem={(name) =>
          setHouses((cur) =>
            cur.includes(name) ? cur.filter((x) => x !== name) : [...cur, name],
          )
        }
      />
      <AccessGroup
        title="Friends"
        checked={friends}
        onChange={setFriends}
        searchPlaceholder="Search friends…"
        items={[]}
        emptyHint="Friends list will appear here once you add friends."
      />
      <button
        onClick={save}
        disabled={busy}
        className="mt-2 w-full rounded-full bg-primary px-5 py-2.5 text-sm text-primary-foreground hover:opacity-90 disabled:opacity-50"
      >
        {busy ? "Saving…" : "Save"}
      </button>
    </div>
  );
}

function AccessGroup({
  title,
  checked,
  onChange,
  searchPlaceholder,
  items,
  selected,
  onToggleItem,
  emptyHint,
}: {
  title: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  searchPlaceholder: string;
  items: string[];
  selected?: string[];
  onToggleItem?: (name: string) => void;
  emptyHint?: string;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return items;
    return items.filter((i) => i.toLowerCase().includes(needle));
  }, [items, q]);

  return (
    <div className="rounded-xl border border-hairline bg-card">
      <div className="flex items-center justify-between gap-2 px-3 py-2.5">
        <button
          onClick={() => setOpen((o) => !o)}
          className="flex flex-1 items-center gap-2 text-left text-sm text-ink"
        >
          {open ? (
            <ChevronDown className="h-3.5 w-3.5" />
          ) : (
            <ChevronRight className="h-3.5 w-3.5" />
          )}
          {title}
        </button>
        <label
          className="flex items-center gap-2 text-[11px] text-muted-foreground"
          onClick={(e) => e.stopPropagation()}
        >
          <span>Select all</span>
          <input
            type="checkbox"
            checked={checked}
            onChange={(e) => onChange(e.target.checked)}
            className="h-4 w-4 accent-primary"
          />
        </label>
      </div>
      {open && (
        <div className="border-t border-hairline p-3">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={searchPlaceholder}
              className="w-full rounded-lg border border-hairline bg-background pl-9 pr-3 py-2 text-xs text-ink outline-none focus:border-primary"
            />
          </div>
          <div className="mt-2 max-h-40 overflow-y-auto">
            {filtered.length === 0 ? (
              <p className="px-1 py-2 text-[11px] text-muted-foreground">
                {emptyHint ?? "No matches."}
              </p>
            ) : (
              <ul className="space-y-0.5">
                {filtered.map((name) => {
                  const on = selected?.includes(name) ?? false;
                  return (
                    <li key={name}>
                      <button
                        onClick={() => onToggleItem?.(name)}
                        className={`flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left text-xs transition ${
                          on
                            ? "bg-primary/10 text-ink"
                            : "text-muted-foreground hover:bg-secondary hover:text-ink"
                        }`}
                      >
                        <span>{name}</span>
                        {on ? (
                          <CheckSquare className="h-3.5 w-3.5 text-primary" />
                        ) : (
                          <Square className="h-3.5 w-3.5" />
                        )}
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function SharePanel({ url, disabled }: { url?: string; disabled?: boolean }) {
  const targets = [
    { name: "Instagram", href: "https://www.instagram.com/", Icon: Instagram },
    { name: "Facebook", href: "https://www.facebook.com/", Icon: Facebook },
    { name: "Snapchat", href: "https://www.snapchat.com/", Icon: Ghost },
    { name: "Strava", href: "https://www.strava.com/upload/select", Icon: Activity },
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

  if (disabled) {
    return (
      <p className="rounded-lg border border-hairline bg-secondary/40 px-3 py-3 text-[11px] text-muted-foreground">
        Share is available for one item at a time. Select a single item to share.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      <button
        onClick={nativeShare}
        className="flex w-full items-center gap-3 rounded-xl border border-hairline bg-card px-4 py-3 text-sm text-ink hover:bg-secondary"
      >
        <Share2 className="h-4 w-4" />
        Share via device
      </button>
      <button
        onClick={async () => {
          if (!url) return;
          await navigator.clipboard.writeText(url);
          toast.success("Link copied");
        }}
        className="flex w-full items-center gap-3 rounded-xl border border-hairline bg-card px-4 py-3 text-sm text-ink hover:bg-secondary"
      >
        <Link2 className="h-4 w-4" />
        Copy link
      </button>
      {targets.map(({ name, href, Icon }) => (
        <a
          key={name}
          href={href}
          target="_blank"
          rel="noreferrer"
          className="flex w-full items-center gap-3 rounded-xl border border-hairline bg-card px-4 py-3 text-sm text-ink hover:bg-secondary"
        >
          <Icon className="h-4 w-4" />
          {name}
        </a>
      ))}
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
        className="relative z-10 w-full max-w-md rounded-2xl border border-hairline bg-card p-6 shadow-2xl animate-in zoom-in-95 slide-in-from-bottom-2 duration-200 max-h-[90vh] overflow-y-auto"
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
    <label className="block">
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

export function AlbumMultiSelect({
  albums,
  value,
  onChange,
  placeholder = "Select albums…",
}: {
  albums: Album[];
  value: string[];
  onChange: (next: string[]) => void;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const filtered = useMemo(() => {
    const n = q.trim().toLowerCase();
    if (!n) return albums;
    return albums.filter((a) => a.name.toLowerCase().includes(n));
  }, [albums, q]);

  const toggle = (id: string) => {
    onChange(value.includes(id) ? value.filter((v) => v !== id) : [...value, id]);
  };

  const summary =
    value.length === 0
      ? placeholder
      : value.length === 1
        ? (albums.find((a) => a.id === value[0])?.name ?? "1 album")
        : `${value.length} albums`;

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        className="flex w-full items-center justify-between rounded-xl border border-hairline bg-background px-4 py-2.5 text-left text-sm text-ink outline-none focus:border-primary"
      >
        <span className={value.length === 0 ? "text-muted-foreground" : ""}>{summary}</span>
        <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
      </button>
      {open && (
        <div className="absolute left-0 right-0 top-full z-30 mt-1 rounded-xl border border-hairline bg-popover p-2 shadow-lg">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onMouseDown={(e) => e.stopPropagation()}
              placeholder="Search albums…"
              className="w-full rounded-lg border border-hairline bg-background pl-9 pr-3 py-2 text-xs text-ink outline-none focus:border-primary"
            />
          </div>
          <ul className="mt-2 max-h-56 overflow-y-auto">
            {filtered.length === 0 ? (
              <li className="px-2 py-2 text-[11px] text-muted-foreground">No albums.</li>
            ) : (
              filtered.map((a) => {
                const on = value.includes(a.id);
                return (
                  <li key={a.id}>
                    <button
                      type="button"
                      onMouseDown={(e) => {
                        e.preventDefault();
                        toggle(a.id);
                      }}
                      className={`flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left text-xs transition ${
                        on ? "bg-primary/10 text-ink" : "text-muted-foreground hover:bg-secondary hover:text-ink"
                      }`}
                    >
                      <span>{a.name}</span>
                      {on ? (
                        <CheckSquare className="h-3.5 w-3.5 text-primary" />
                      ) : (
                        <Square className="h-3.5 w-3.5" />
                      )}
                    </button>
                  </li>
                );
              })
            )}
          </ul>
        </div>
      )}
    </div>
  );
}

async function syncMediaAlbums(mediaItemIds: string[], albumIds: string[], mode: "replace" | "add") {
  if (mediaItemIds.length === 0) return;
  if (mode === "replace") {
    await supabase.from("media_item_albums").delete().in("media_item_id", mediaItemIds);
  }
  if (albumIds.length === 0) return;
  const rows = mediaItemIds.flatMap((mid) =>
    albumIds.map((aid) => ({ media_item_id: mid, album_id: aid })),
  );
  await supabase.from("media_item_albums").upsert(rows, {
    onConflict: "media_item_id,album_id",
    ignoreDuplicates: true,
  });
}


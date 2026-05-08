import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, ChevronRight, Pause, Play, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { YearCalendarView } from "@/components/calendar/YearCalendarView";
import type { DateRange } from "@/components/calendar/MiniCalendar";
import type { ViewMode } from "@/components/calendar/UnifiedElasticGrid";
import type { CategoryKey } from "@/components/calendar/CalendarSideNav";
import type { MemberSubTab } from "./MemberDataPanel";

interface Props {
  userId: string;
  name: string;
  subTab: MemberSubTab;
}

export function MemberContentView({ userId, subTab }: Props) {
  if (subTab === "calendar") {
    return <CalendarLike userId={userId} appKind="calendar" />;
  }
  if (subTab === "diary") {
    return <CalendarLike userId={userId} appKind="diary" />;
  }
  return <MemberLibrary userId={userId} />;
}

function CalendarLike({ userId, appKind }: { userId: string; appKind: "calendar" | "diary" }) {
  const calId = appKind === "diary" ? `diary:${userId}` : `user:${userId}`;
  const title = appKind === "diary" ? "Diary" : "Calendar";

  const [currentDate, setCurrentDate] = useState<Date>(() => new Date());
  const [currentRange, setCurrentRange] = useState<DateRange>(() => {
    const t = new Date();
    return { start: t, end: t };
  });
  const [viewMode, setViewMode] = useState<ViewMode>(appKind === "diary" ? "week" : "month");
  const visibleCategories = useMemo<Set<CategoryKey>>(
    () => new Set<CategoryKey>(["ind:training"]),
    [],
  );

  return (
    <YearCalendarView
      calId={calId}
      defaultTitle={title}
      seat="individual"
      appKind={appKind}
      currentDate={currentDate}
      currentRange={currentRange}
      onCurrentDateChange={(d, r) => {
        setCurrentDate(d);
        setCurrentRange(r ?? { start: d, end: d });
      }}
      viewMode={viewMode}
      onViewModeChange={(v) => setViewMode(appKind === "diary" && v === "day" ? "week" : v)}
      visibleCategories={visibleCategories}
    />
  );
}

/* ------------------------------- Library ------------------------------- */

interface MediaItem {
  id: string;
  storage_path: string;
  media_type: "photo" | "video";
  album_id: string | null;
}
interface Album {
  id: string;
  name: string;
  pinned: boolean;
}

type View = { type: "all" } | { type: "album"; id: string | null };

function MemberLibrary({ userId }: { userId: string }) {
  const [albums, setAlbums] = useState<Album[]>([]);
  const [items, setItems] = useState<MediaItem[]>([]);
  const [itemAlbums, setItemAlbums] = useState<Record<string, string[]>>({});
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [view, setView] = useState<View>({ type: "all" });
  const [open, setOpen] = useState<MediaItem | null>(null);
  const [albumsOpen, setAlbumsOpen] = useState(true);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const [{ data: a }, { data: m }] = await Promise.all([
        supabase
          .from("media_albums")
          .select("id,name,pinned,sort_order")
          .is("team_id", null)
          .eq("user_id", userId)
          .order("pinned", { ascending: false })
          .order("sort_order", { ascending: true }),
        supabase
          .from("media_items")
          .select("id,storage_path,media_type,album_id,user_id,team_id")
          .eq("user_id", userId)
          .is("team_id", null)
          .order("created_at", { ascending: false }),
      ]);
      if (cancelled) return;
      setAlbums((a ?? []) as Album[]);
      setItems((m ?? []) as MediaItem[]);
      const ids = ((m ?? []) as MediaItem[]).map((x) => x.id);
      if (ids.length) {
        const { data: links } = await supabase
          .from("media_item_albums")
          .select("media_item_id,album_id")
          .in("media_item_id", ids);
        const map: Record<string, string[]> = {};
        for (const r of (links as { media_item_id: string; album_id: string }[] | null) ?? []) {
          (map[r.media_item_id] ??= []).push(r.album_id);
        }
        if (!cancelled) setItemAlbums(map);
      }
    })();
    return () => { cancelled = true; };
  }, [userId]);

  useEffect(() => {
    let cancel = false;
    void (async () => {
      const next: Record<string, string> = { ...urls };
      for (const it of items) {
        if (next[it.id]) continue;
        const { data } = await supabase.storage.from("media").createSignedUrl(it.storage_path, 3600);
        if (data?.signedUrl) next[it.id] = data.signedUrl;
      }
      if (!cancel) setUrls(next);
    })();
    return () => { cancel = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items]);

  const filtered = useMemo(() => {
    if (view.type === "all") return items;
    if (view.id === null) return items.filter((i) => (itemAlbums[i.id]?.length ?? 0) === 0 && !i.album_id);
    return items.filter((i) => itemAlbums[i.id]?.includes(view.id as string) || i.album_id === view.id);
  }, [items, view, itemAlbums]);

  return (
    <div className="mt-2">
      {/* Media header tab */}
      <div className="mb-3 flex items-end gap-3 border-b border-hairline">
        <div className="-mb-px border-b-2 border-primary px-1 py-2 text-sm font-medium text-ink">
          Media
        </div>
      </div>
      <div className="grid gap-6 md:grid-cols-[180px_1fr]">
        <nav className="-ml-2 flex flex-col gap-0.5">
          <NavBtn active={view.type === "all"} onClick={() => setView({ type: "all" })}>All</NavBtn>
          <button
            onClick={() => setAlbumsOpen((o) => !o)}
            className="flex items-center justify-between rounded-md px-3 py-1.5 text-left text-xs text-muted-foreground transition hover:text-ink"
          >
            <span>Folders</span>
            {albumsOpen ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
          </button>
          {albumsOpen && (
            <div className="ml-3 flex flex-col gap-0.5 border-l border-hairline pl-2">
              <NavBtn small active={view.type === "album" && view.id === null} onClick={() => setView({ type: "album", id: null })}>
                Unsorted
              </NavBtn>
              {albums.map((a) => (
                <NavBtn key={a.id} small active={view.type === "album" && view.id === a.id} onClick={() => setView({ type: "album", id: a.id })}>
                  {a.name}
                </NavBtn>
              ))}
              {albums.length === 0 && (
                <span className="px-3 py-1 text-[11px] text-muted-foreground">No folders</span>
              )}
            </div>
          )}
        </nav>

        <section>
          {filtered.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-hairline bg-card/40 py-20 text-center text-sm text-muted-foreground">
              No media.
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-1 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
              {filtered.map((it) => (
                <button
                  key={it.id}
                  onClick={() => setOpen(it)}
                  className="group relative aspect-square overflow-hidden rounded-sm bg-secondary"
                >
                  {it.media_type === "photo"
                    ? urls[it.id] && (
                        <img src={urls[it.id]} alt="" className="h-full w-full object-cover transition group-hover:scale-[1.02]" />
                      )
                    : (
                      <video
                        src={urls[it.id]}
                        muted
                        playsInline
                        preload="metadata"
                        className="h-full w-full object-cover"
                      />
                    )}
                </button>
              ))}
            </div>
          )}
        </section>
      </div>

      {open && <MediaViewer item={open} url={urls[open.id]} onClose={() => setOpen(null)} />}
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
      className={`rounded-md px-3 py-1.5 text-left transition ${
        small ? "text-xs" : "text-sm"
      } ${active ? "bg-secondary font-medium text-ink" : "text-muted-foreground hover:bg-secondary/60 hover:text-ink"}`}
    >
      {children}
    </button>
  );
}

function MediaViewer({ item, url, onClose }: { item: MediaItem; url?: string; onClose: () => void }) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [playing, setPlaying] = useState(true);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const togglePlay = () => {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) { void v.play(); setPlaying(true); } else { v.pause(); setPlaying(false); }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/90">
      <button
        onClick={onClose}
        aria-label="Close"
        className="absolute right-4 top-4 z-10 grid h-9 w-9 place-items-center rounded-full bg-black/60 text-white hover:bg-black/80"
      >
        <X className="h-5 w-5" />
      </button>
      {item.media_type === "photo" ? (
        url && <img src={url} alt="" className="max-h-[90vh] max-w-[92vw] object-contain" />
      ) : (
        <div className="flex max-h-[90vh] max-w-[92vw] flex-col items-center gap-3">
          <video
            ref={videoRef}
            src={url}
            autoPlay
            playsInline
            onTimeUpdate={(e) => setProgress(e.currentTarget.currentTime)}
            onLoadedMetadata={(e) => setDuration(e.currentTarget.duration)}
            onPlay={() => setPlaying(true)}
            onPause={() => setPlaying(false)}
            className="max-h-[80vh] max-w-[92vw]"
          />
          <div className="flex w-full max-w-2xl items-center gap-3 px-3 text-white">
            <button onClick={togglePlay} className="grid h-9 w-9 place-items-center rounded-full bg-white/15 hover:bg-white/25">
              {playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
            </button>
            <input
              type="range"
              min={0}
              max={duration || 0}
              step={0.1}
              value={progress}
              onChange={(e) => {
                const v = videoRef.current;
                if (!v) return;
                v.currentTime = Number(e.target.value);
                setProgress(Number(e.target.value));
              }}
              className="flex-1 accent-white"
            />
            <span className="w-20 text-right text-xs tabular-nums">
              {fmt(progress)} / {fmt(duration)}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

function fmt(s: number) {
  if (!isFinite(s)) return "0:00";
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, "0")}`;
}

import { useEffect, useMemo, useRef, useState } from "react";
import { Pause, Play, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

export interface MediaItem {
  id: string;
  storage_path: string;
  media_type: "photo" | "video";
  album_id: string | null;
}
export interface Album {
  id: string;
  name: string;
  pinned: boolean;
}

export type LibraryView = { type: "all" } | { type: "album"; id: string | null };

export function MemberLibraryMain({
  userId,
  view,
}: {
  userId: string;
  albums: Album[];
  view: LibraryView;
}) {
  const [items, setItems] = useState<MediaItem[]>([]);
  const [itemAlbums, setItemAlbums] = useState<Record<string, string[]>>({});
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [open, setOpen] = useState<MediaItem | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const { data: m } = await supabase
        .from("media_items")
        .select("id,storage_path,media_type,album_id,user_id,team_id")
        .eq("user_id", userId)
        .is("team_id", null)
        .order("created_at", { ascending: false });
      if (cancelled) return;
      const list = (m ?? []) as MediaItem[];
      setItems(list);
      const ids = list.map((x) => x.id);
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

      {open && <MediaViewer item={open} url={urls[open.id]} onClose={() => setOpen(null)} />}
    </div>
  );
}

function MediaViewer({ item, url, onClose }: { item: MediaItem; url?: string; onClose: () => void }) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [playing, setPlaying] = useState(true);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
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

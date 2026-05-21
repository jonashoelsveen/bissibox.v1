/**
 * LibraryAlbumsHoverMenu — macOS-style hover menu anchored to the "Me" / "We"
 * button in the top tab bar. Lists the active profile's media albums; clicking
 * an entry dispatches the `library:open-album-tab` event so the Library page
 * can open it as a tab.
 */
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { FolderClosed } from "lucide-react";
import { useLibraryAlbums } from "@/hooks/useLibraryAlbums";

const CLOSE_DELAY_MS = 120;

export function LibraryAlbumsHoverMenu({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const { albums, loading } = useLibraryAlbums(open);
  const navigate = useNavigate();
  const closeTimer = useRef<number | null>(null);

  const cancelClose = () => {
    if (closeTimer.current !== null) {
      window.clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
  };
  const scheduleClose = () => {
    cancelClose();
    closeTimer.current = window.setTimeout(() => setOpen(false), CLOSE_DELAY_MS);
  };
  useEffect(() => () => cancelClose(), []);

  const openAlbum = (a: { id: string; name: string; color: string | null }) => {
    setOpen(false);
    if (typeof window !== "undefined") {
      window.dispatchEvent(
        new CustomEvent("library:open-album-tab", {
          detail: { folder: a.id, title: a.name, color: a.color },
        }),
      );
    }
    void navigate({
      to: "/media",
      search: { tab: "media", folder: a.id },
      replace: true,
    });
  };

  return (
    <div
      className="relative"
      onMouseEnter={() => { cancelClose(); setOpen(true); }}
      onMouseLeave={scheduleClose}
    >
      {children}
      {open && (
        <div
          role="menu"
          onMouseEnter={cancelClose}
          onMouseLeave={scheduleClose}
          className="mac-menu absolute left-0 top-full z-[100] mt-1.5 w-60 overflow-hidden rounded-lg p-1"
          style={{ transition: "none" }}
        >
          {loading && (
            <div className="px-2 py-1 text-[11px] text-muted-foreground">Loading…</div>
          )}
          {!loading && albums.length === 0 && (
            <div className="px-2 py-1 text-[11px] text-muted-foreground">No albums yet.</div>
          )}
          {albums.map((a) => (
            <button
              key={a.id}
              type="button"
              role="menuitem"
              onClick={() => openAlbum(a)}
              className="group flex w-full items-center gap-1.5 rounded-md px-2 py-1 text-left text-xs outline-none hover:bg-black/[0.06]"
              style={{ transition: "none", color: "#1d1d1f" }}
              title={a.name}
            >
              <FolderClosed
                className="h-3.5 w-3.5 shrink-0"
                style={a.color ? { color: a.color } : undefined}
              />
              <span className="min-w-0 flex-1 truncate">{a.name}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

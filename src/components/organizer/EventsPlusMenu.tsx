import { useEffect, useRef, useState } from "react";
import { X, FolderPlus, Plus } from "lucide-react";

/**
 * Compact "+" menu for the Events page top-bar. Mirrors the LibraryPlusMenu
 * pattern: a "New event" row, plus a "Folder" hint that fades in on hover and
 * triggers the new-folder dialog when clicked.
 */
export function EventsPlusMenu({
  onNewEvent,
  onNewFolder,
}: {
  onNewEvent: () => void;
  onNewFolder: () => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const close = () => setOpen(false);

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        aria-label="Create new"
        className="flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground transition-all hover:bg-secondary hover:text-ink"
      >
        <Plus className="h-[18px] w-[18px]" strokeWidth={2.25} />
      </button>
      {open && (
        <div
          role="menu"
          className="absolute right-0 top-full z-30 mt-2 w-52 origin-top-right overflow-hidden rounded-xl border border-hairline bg-popover p-1 shadow-xl animate-in fade-in zoom-in-95 slide-in-from-top-1 duration-150"
        >
          <div className="group flex w-full items-center gap-2 rounded-lg pl-3 pr-1 text-left text-sm text-ink transition hover:bg-secondary">
            <button
              type="button"
              onClick={() => { close(); onNewEvent(); }}
              className="flex flex-1 items-center gap-2 py-2 text-left"
            >
              <span className="text-muted-foreground"><Plus className="h-3.5 w-3.5" /></span>
              <span className="flex-1">Event</span>
            </button>
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); close(); onNewFolder(); }}
              aria-label="New folder"
              className="rounded-md px-2 py-1 text-sm text-muted-foreground/60 opacity-0 transition group-hover:opacity-100 hover:bg-secondary-foreground/5 hover:text-ink"
            >
              Folder
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Inline event-folder creator that doesn't need extra files. Used directly by
 * the page so the auth context is in scope.
 */
export function FolderCreatorDialog({
  onClose,
  onCreate,
  busy,
}: {
  onClose: () => void;
  onCreate: (name: string) => Promise<void> | void;
  busy: boolean;
}) {
  const [name, setName] = useState("");
  const ref = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    const t = setTimeout(() => ref.current?.focus(), 30);
    return () => clearTimeout(t);
  }, []);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 animate-in fade-in" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60" />
      <div
        className="relative z-10 w-full max-w-md rounded-2xl border border-hairline bg-card p-6 shadow-2xl animate-in zoom-in-95 slide-in-from-bottom-2 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-sm font-medium text-ink">New folder</h2>
          <button onClick={onClose} className="rounded-full p-1.5 text-muted-foreground hover:bg-secondary">
            <X className="h-4 w-4" />
          </button>
        </div>
        <label className="block">
          <span className="mono text-[10px] uppercase tracking-widest text-muted-foreground">Name</span>
          <input
            ref={ref}
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") { e.preventDefault(); if (name.trim()) void onCreate(name.trim()); }
            }}
            placeholder="Folder name"
            className="mt-1 w-full rounded-xl border border-hairline bg-background px-4 py-2.5 text-sm text-ink outline-none focus:border-primary"
          />
        </label>
        <div className="mt-6 flex justify-end gap-2">
          <button onClick={onClose} className="rounded-full border border-hairline bg-card px-4 py-2 text-xs text-muted-foreground hover:text-ink">
            Cancel
          </button>
          <button
            onClick={() => name.trim() && void onCreate(name.trim())}
            disabled={busy || !name.trim()}
            className="rounded-full bg-primary px-5 py-2 text-xs text-primary-foreground hover:opacity-90 disabled:opacity-50"
          >
            {busy ? "Creating…" : "Create"}
          </button>
        </div>
        <FolderPlus className="hidden" />
      </div>
    </div>
  );
}

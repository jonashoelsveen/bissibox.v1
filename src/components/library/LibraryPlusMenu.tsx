import { useEffect, useRef, useState } from "react";
import {
  Briefcase,
  FolderClosed,
  Image as ImageIcon,
  Plus,
  StickyNote,
} from "lucide-react";
import type { PreviousNewKind } from "./PreviousPage";

/**
 * The "+" dropdown menu used across all Library tabs (Previous, Meetings,
 * Notes, Files, Media). Identical visual logic to the Previous tab.
 *
 * Each menu item shows a hint on the right ("Folder" for Meeting / Note /
 * Files, "Album" for Media). Clicking the row label triggers `onCreate`
 * (creating a new meeting/note/file/media item). Clicking the hint triggers
 * `onCreateContainer` (creating a new folder/album of that type).
 */
export function LibraryPlusMenu({
  onCreate,
  onCreateContainer,
  showMeetingOption,
}: {
  onCreate: (kind: PreviousNewKind) => void;
  onCreateContainer?: (kind: PreviousNewKind) => void;
  showMeetingOption?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      if (!ref.current) return;
      if (!ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const close = () => setOpen(false);

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        aria-label="Create new"
        aria-haspopup="menu"
        aria-expanded={open}
        className="flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground transition-all hover:bg-secondary hover:text-ink"
      >
        <Plus className="h-[18px] w-[18px]" strokeWidth={2.25} />
      </button>
      {open && (
        <div
          role="menu"
          className="absolute right-0 top-full z-30 mt-2 w-52 origin-top-right overflow-hidden rounded-xl border border-hairline bg-popover p-1 shadow-xl animate-in fade-in zoom-in-95 slide-in-from-top-1 duration-150"
        >
          {showMeetingOption && (
            <Item
              icon={<Briefcase className="h-3.5 w-3.5" />}
              label="Meeting"
              hint="Folder"
              onClick={() => { close(); onCreate("meeting"); }}
              onHintClick={onCreateContainer ? () => { close(); onCreateContainer("meeting"); } : undefined}
            />
          )}
          <Item
            icon={<StickyNote className="h-3.5 w-3.5" />}
            label="Note"
            hint="Folder"
            onClick={() => { close(); onCreate("note"); }}
            onHintClick={onCreateContainer ? () => { close(); onCreateContainer("note"); } : undefined}
          />
          <Item
            icon={<FolderClosed className="h-3.5 w-3.5" />}
            label="Files"
            hint="Folder"
            onClick={() => { close(); onCreate("files"); }}
            onHintClick={onCreateContainer ? () => { close(); onCreateContainer("files"); } : undefined}
          />
          <Item
            icon={<ImageIcon className="h-3.5 w-3.5" />}
            label="Media"
            hint="Album"
            onClick={() => { close(); onCreate("media"); }}
            onHintClick={onCreateContainer ? () => { close(); onCreateContainer("media"); } : undefined}
          />
        </div>
      )}
    </div>
  );
}

function Item({
  icon,
  label,
  hint,
  onClick,
  onHintClick,
}: {
  icon: React.ReactNode;
  label: string;
  hint: string;
  onClick: () => void;
  onHintClick?: () => void;
}) {
  return (
    <div
      role="menuitem"
      className="group flex w-full items-center gap-2 rounded-lg pl-3 pr-1 text-left text-sm text-ink transition hover:bg-secondary"
    >
      <button
        type="button"
        onClick={onClick}
        className="flex flex-1 items-center gap-2 py-2 text-left"
      >
        <span className="text-muted-foreground">{icon}</span>
        <span className="flex-1">{label}</span>
      </button>
      {onHintClick ? (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onHintClick(); }}
          aria-label={`New ${hint.toLowerCase()}`}
          className="rounded-md px-2 py-1 text-sm text-muted-foreground/60 opacity-0 transition group-hover:opacity-100 hover:bg-secondary-foreground/5 hover:text-ink"
        >
          {hint}
        </button>
      ) : (
        <span className="px-2 py-1 text-sm text-muted-foreground/60 opacity-0 transition-opacity duration-150 group-hover:opacity-100">
          {hint}
        </span>
      )}
    </div>
  );
}

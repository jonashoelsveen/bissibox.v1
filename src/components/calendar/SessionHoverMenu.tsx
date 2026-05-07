/**
 * SessionHoverMenu — right-side action menu shown when a logged session
 * (manual or Strava-synced) is hovered in the diary week view.
 *
 * Layout:
 *   - The menu sits to the right of the session block, top-aligned with the
 *     block's top edge, height ≈ 1.4× one slot row.
 *   - Width matches the day-note panel (280 px).
 *   - Buttons (left → right): Note, Details, Delete.
 *
 * Behaviour:
 *   - Hovering the wrapper reveals the menu.
 *   - If the session has a `sessionNote`, the note panel auto-opens beneath
 *     the menu in read-only preview mode (light gray background).
 *   - Clicking the note button switches the panel into edit mode.
 *   - Clicking details delegates to `onOpenDetails` (existing editor flow).
 *   - Clicking delete opens a confirm dialog; confirming calls `onDelete`.
 */

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { StickyNote, Pencil, Trash2 } from "lucide-react";
import { NotePanel } from "./DayNoteButton";
import type { CalendarEvent } from "./yearStore";

const NOTE_PANEL_W = 280;

export interface SessionHoverMenuProps {
  ev: CalendarEvent;
  /** Bounding rect of the session block (viewport coords). */
  blockRect: { left: number; top: number; width: number; height: number };
  rowHeight: number;
  onOpenDetails: () => void;
  onDelete: () => void;
  onSaveNote: (text: string) => void;
  visible: boolean;
  /** Called when the cursor enters the menu — parent should cancel its close timer. */
  onMenuEnter?: () => void;
  /** Called when the cursor leaves the menu — parent should start its close timer. */
  onMenuLeave?: () => void;
}

export function SessionHoverMenu({
  ev,
  blockRect,
  rowHeight,
  onOpenDetails,
  onDelete,
  onSaveNote,
  visible,
  onMenuEnter,
  onMenuLeave,
}: SessionHoverMenuProps) {
  const [confirm, setConfirm] = useState(false);
  const [noteEdit, setNoteEdit] = useState(false);
  const hasNote = !!ev.sessionNote?.trim();

  // Reset edit state when the session is no longer hovered.
  useEffect(() => {
    if (!visible) setNoteEdit(false);
  }, [visible]);

  const menuH = Math.max(28, rowHeight * 1.4);
  // Compact menu: just the three icon buttons. The note panel below uses
  // the full new-session-popover width (NOTE_PANEL_W).
  const ICON_W = 32; // matches MenuBtn w-8
  const PADDING_X = 6 * 2;
  const GAP = 2 * 2; // gap-0.5 between 3 buttons → 2 gaps × 4px
  const compactW = ICON_W * 3 + GAP + PADDING_X;
  const showNote = (hasNote && visible) || noteEdit;
  const menuW = showNote ? NOTE_PANEL_W : compactW;

  const gap = 4;
  let left = blockRect.left + blockRect.width + gap;
  // If the wider variant would overflow, flip to the left side.
  const widestNeeded = Math.max(menuW, showNote ? NOTE_PANEL_W : compactW);
  if (left + widestNeeded > window.innerWidth - 8) {
    left = Math.max(8, blockRect.left - widestNeeded - gap);
  }
  const top = blockRect.top;

  return (
    <>
      {visible && (
        createPortal(
          <div
            data-session-hover-menu="1"
            className="fixed z-[20] flex items-stretch gap-1 rounded-md border border-hairline bg-card/95 px-1.5 shadow-md backdrop-blur transition-[width] duration-150"
            style={{ left, top, width: menuW, height: menuH }}
            onMouseEnter={onMenuEnter}
            onMouseLeave={onMenuLeave}
            onMouseDown={(e) => e.stopPropagation()}
            onClick={(e) => e.stopPropagation()}
          >
            <MenuBtn
              label={hasNote ? "Rediger notat" : "Legg til notat"}
              onClick={() => setNoteEdit(true)}
            >
              <StickyNote className="h-4 w-4" strokeWidth={2.25} />
            </MenuBtn>
            <MenuBtn label="Detaljer" onClick={onOpenDetails}>
              <Pencil className="h-4 w-4" strokeWidth={2.25} />
            </MenuBtn>
            <MenuBtn
              label="Slett"
              destructive
              onClick={() => setConfirm(true)}
            >
              <Trash2 className="h-4 w-4" strokeWidth={2.25} />
            </MenuBtn>
          </div>,
          document.body,
        )
      )}

      {showNote && (
        <NotePanel
          anchorRect={
            {
              left,
              right: left + NOTE_PANEL_W,
              top: top + menuH,
              bottom: top + menuH,
              width: NOTE_PANEL_W,
              height: 0,
              x: left,
              y: top + menuH,
              toJSON: () => ({}),
            } as DOMRect
          }
          headerLabel="Session note"
          initialValue={ev.sessionNote ?? ""}
          mode={noteEdit ? "edit" : "preview"}
          defaultBodyHeight={140}
          panelWidth={NOTE_PANEL_W}
          onSave={(text) => onSaveNote(text)}
          onClose={() => setNoteEdit(false)}
          onRequestEdit={() => setNoteEdit(true)}
        />
      )}

      {confirm && (
        <ConfirmDeleteDialog
          title="Slett økt?"
          message={`"${ev.title || "Økt"}" vil bli fjernet permanent.`}
          onCancel={() => setConfirm(false)}
          onConfirm={() => {
            setConfirm(false);
            onDelete();
          }}
        />
      )}
    </>
  );
}

function MenuBtn({
  children,
  label,
  destructive,
  onClick,
}: {
  children: React.ReactNode;
  label: string;
  destructive?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      className={[
        "grid h-full w-8 place-items-center rounded transition-colors",
        destructive
          ? "text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
          : "text-muted-foreground hover:bg-secondary hover:text-ink",
      ].join(" ")}
    >
      {children}
    </button>
  );
}

function ConfirmDeleteDialog({
  title,
  message,
  onCancel,
  onConfirm,
}: {
  title: string;
  message: string;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onCancel();
      } else if (e.key === "Enter") {
        e.preventDefault();
        onConfirm();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel, onConfirm]);
  return createPortal(
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center p-4"
      onClick={onCancel}
    >
      <div className="absolute inset-0 bg-black/60" />
      <div
        ref={ref}
        className="relative z-10 w-full max-w-md rounded-2xl border border-hairline bg-card p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="mb-2 text-base font-semibold text-ink">{title}</h3>
        <p className="text-sm text-muted-foreground">{message}</p>
        <div className="mt-6 flex justify-end gap-2">
          <button
            onClick={onCancel}
            className="rounded-full border border-hairline bg-card px-4 py-2 text-xs text-muted-foreground hover:text-ink"
          >
            Avbryt
          </button>
          <button
            onClick={onConfirm}
            className="rounded-full bg-destructive px-5 py-2 text-xs text-destructive-foreground hover:opacity-90"
          >
            Slett
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

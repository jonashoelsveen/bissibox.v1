/**
 * SessionHoverMenu — right-side action menu shown when a logged session
 * (manual or Strava-synced) is hovered in the diary week view.
 *
 * Contains: Note button, Details button, Delete button.
 * - Compact width (3 icons). Expands to NOTE_PANEL_W when a note is shown.
 * - Note panel uses a light-gray "preview" background; clicking the note
 *   icon enables editing in place. While the note panel is open the menu
 *   stays visible until the user clicks outside.
 * - Details opens the centered SessionDetailsModal (About / Map / Note).
 * - Delete opens a confirm dialog.
 */

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { StickyNote, Pencil, Trash2 } from "lucide-react";
import { NotePanel } from "./DayNoteButton";
import { SessionDetailsModal, type SessionDetailsValue } from "./SessionDetailsModal";
import { CAT_TRAINING_COLOR } from "./MonthGridType1";
import { colorForActivity } from "@/lib/activity-colors";
import { DIARY_GROUPS, type DiaryType } from "./DiaryPopoverEditor";
import type { CalendarEvent } from "./yearStore";
import { fromISOLocal, toISOLocal, setHM } from "./dateUtils";

const NOTE_PANEL_W = 280;

export interface SessionHoverMenuProps {
  ev: CalendarEvent;
  /** Bounding rect of the session block (viewport coords). */
  blockRect: { left: number; top: number; width: number; height: number };
  rowHeight: number;
  onDelete: () => void;
  onSaveNote: (text: string) => void;
  /** Persist a full edit from the SessionDetailsModal. */
  onUpsert: (patch: Partial<CalendarEvent> & { id: string }) => void;
  visible: boolean;
  /** Called when the cursor enters the menu — parent should cancel its close timer. */
  onMenuEnter?: () => void;
  /** Called when the cursor leaves the menu — parent should start its close timer. */
  onMenuLeave?: () => void;
  /** Called by parent to force-close the menu (e.g. after a destructive action). */
  onForceClose?: () => void;
}

export function SessionHoverMenu({
  ev,
  blockRect,
  rowHeight,
  onDelete,
  onSaveNote,
  onUpsert,
  visible,
  onMenuEnter,
  onMenuLeave,
  onForceClose,
}: SessionHoverMenuProps) {
  const [confirm, setConfirm] = useState(false);
  const [noteEdit, setNoteEdit] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const hasNote = !!ev.sessionNote?.trim();

  // Initialize the SessionDetailsValue from the event.
  const [detailsValue, setDetailsValue] = useState<SessionDetailsValue | null>(null);
  useEffect(() => {
    if (!showDetails) return;
    const start = fromISOLocal(ev.startISO);
    const end = fromISOLocal(ev.endISO);
    setDetailsValue({
      title: ev.title,
      diaryType: (ev.diaryType as DiaryType) ?? "training",
      diaryGroup: ev.diaryGroup,
      diarySub: ev.diarySub,
      time: ev.allDay
        ? null
        : {
            startMin: start.getHours() * 60 + start.getMinutes(),
            endMin: end.getHours() * 60 + end.getMinutes(),
          },
      distanceKm: ev.distanceKm,
      paceSecPerKm: ev.paceSecPerKm,
      sessionNote: ev.sessionNote ?? "",
      activities: ev.activities ?? [],
    });
  }, [showDetails, ev]);

  // Reset edit state when the session is no longer hovered AND nothing is open.
  useEffect(() => {
    if (!visible && !noteEdit && !showDetails && !confirm) {
      setNoteEdit(false);
    }
  }, [visible, noteEdit, showDetails, confirm]);

  // Lock the menu open while note edit / details / confirm is in flight.
  const sticky = noteEdit || showDetails || confirm;
  const menuVisible = visible || sticky;

  // Outside-click closes everything when the note panel is open.
  const menuRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!noteEdit) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node | null;
      const inMenu = menuRef.current?.contains(t as Node);
      const inNote = (t as HTMLElement | null)?.closest('[data-session-note-panel="1"]');
      if (!inMenu && !inNote) {
        setNoteEdit(false);
        onForceClose?.();
      }
    };
    window.addEventListener("mousedown", onDown);
    return () => window.removeEventListener("mousedown", onDown);
  }, [noteEdit, onForceClose]);

  const menuH = Math.max(28, rowHeight * 1.4);
  const ICON_W = 32;
  const PADDING_X = 6 * 2;
  const GAP = 2 * 2;
  const compactW = ICON_W * 3 + GAP + PADDING_X;
  const showNote = (hasNote && menuVisible) || noteEdit;
  const menuW = showNote ? NOTE_PANEL_W : compactW;

  const gap = 4;
  let left = blockRect.left + blockRect.width + gap;
  const widestNeeded = Math.max(menuW, showNote ? NOTE_PANEL_W : compactW);
  if (left + widestNeeded > window.innerWidth - 8) {
    left = Math.max(8, blockRect.left - widestNeeded - gap);
  }
  const top = blockRect.top;

  const buildEventPatchFromDetails = (v: SessionDetailsValue): Partial<CalendarEvent> & { id: string } => {
    const start = fromISOLocal(ev.startISO);
    const time = v.time ?? {
      startMin: start.getHours() * 60 + start.getMinutes(),
      endMin: start.getHours() * 60 + start.getMinutes() + 60,
    };
    const startISO = toISOLocal(setHM(start, Math.floor(time.startMin / 60), time.startMin % 60));
    const endISO = toISOLocal(setHM(start, Math.floor(time.endMin / 60), time.endMin % 60));
    const trainingColor =
      v.diaryGroup === "endurance" ? colorForActivity(v.diarySub) : CAT_TRAINING_COLOR;
    const color = v.diaryType === "training" ? trainingColor : "#9CA3AF";
    const hasSubs = !!DIARY_GROUPS.find((g) => g.id === v.diaryGroup)?.children?.length;
    return {
      id: ev.id,
      title: v.title.trim(),
      color,
      startISO,
      endISO,
      allDay: false,
      diaryType: v.diaryType,
      diaryGroup: v.diaryType === "training" ? v.diaryGroup : undefined,
      diarySub: v.diaryType === "training" && hasSubs ? v.diarySub : undefined,
      distanceKm: v.distanceKm,
      paceSecPerKm: v.paceSecPerKm,
      sessionNote: v.sessionNote || undefined,
      activities: v.activities && v.activities.length ? v.activities : undefined,
    };
  };

  return (
    <>
      {menuVisible && (
        createPortal(
          <div
            ref={menuRef}
            data-session-hover-menu="1"
            className="fixed z-[20] flex items-stretch gap-1 rounded-md border border-hairline bg-card/95 px-1.5 shadow-md backdrop-blur transition-[width] duration-150"
            style={{ left, top, width: menuW, height: menuH }}
            onMouseEnter={onMenuEnter}
            onMouseLeave={() => { if (!sticky) onMenuLeave?.(); }}
            onMouseDown={(e) => e.stopPropagation()}
            onClick={(e) => e.stopPropagation()}
          >
            <MenuBtn
              label={hasNote ? "Rediger notat" : "Legg til notat"}
              onClick={() => setNoteEdit(true)}
            >
              <StickyNote className="h-4 w-4" strokeWidth={2.25} />
            </MenuBtn>
            <MenuBtn label="Detaljer" onClick={() => setShowDetails(true)}>
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
        <div data-session-note-panel="1">
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
            closeOnEnter={false}
            closeOnOutsideClick={false}
            onSave={(text) => onSaveNote(text)}
            onClose={() => {
              setNoteEdit(false);
              onForceClose?.();
            }}
            onRequestEdit={() => setNoteEdit(true)}
          />
        </div>
      )}

      {showDetails && detailsValue && (
        <SessionDetailsModal
          isEdit={true}
          date={fromISOLocal(ev.startISO)}
          strava={
            ev.summaryPolyline
              ? {
                  polyline: ev.summaryPolyline,
                  elevationGainM: ev.totalElevationGainM ?? null,
                  distanceKm: ev.distanceKm ?? null,
                }
              : null
          }
          value={detailsValue}
          onChange={(v) => setDetailsValue(v)}
          onClose={() => {
            setShowDetails(false);
            onForceClose?.();
          }}
          onSave={(v) => {
            onUpsert(buildEventPatchFromDetails(v));
            setShowDetails(false);
            onForceClose?.();
          }}
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

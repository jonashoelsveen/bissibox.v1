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
import { NotePanel, isUpdatedToday, useMemberFirstName } from "./DayNoteButton";
import { SessionDetailsModal, type SessionDetailsValue } from "./SessionDetailsModal";
import { CAT_TRAINING_COLOR } from "./MonthGridType1";
import { colorForActivity } from "@/lib/activity-colors";
import { DIARY_GROUPS, type DiaryType } from "./DiaryPopoverEditor";
import type { CalendarEvent } from "./yearStore";
import { fromISOLocal, toISOLocal, setHM } from "./dateUtils";
import { useDiarySessionNote } from "@/hooks/useDiarySessionNote";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";

function dayLabel(date: Date): string {
  return `${String(date.getDate()).padStart(2, "0")}.${String(
    date.getMonth() + 1,
  ).padStart(2, "0")}.${String(date.getFullYear() % 100).padStart(2, "0")}`;
}

function formatHHMM(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return "";
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function useViewerName(): string {
  const { user } = useAuth();
  const [name, setName] = useState("");
  useEffect(() => {
    if (!user) { setName(""); return; }
    let cancelled = false;
    void (async () => {
      const { data } = await supabase
        .from("profiles")
        .select("first_name")
        .eq("id", user.id)
        .maybeSingle();
      if (cancelled) return;
      setName((data?.first_name ?? "").trim());
    })();
    return () => { cancelled = true; };
  }, [user]);
  return name;
}

const NOTE_PANEL_W = 280;

export interface SessionHoverMenuProps {
  ev: CalendarEvent;
  blockRect: { left: number; top: number; width: number; height: number };
  rowHeight: number;
  onDelete: () => void;
  onSaveNote: (text: string) => void;
  onUpsert: (patch: Partial<CalendarEvent> & { id: string }) => void;
  visible: boolean;
  onMenuEnter?: () => void;
  onMenuLeave?: () => void;
  onForceClose?: () => void;
  /** Fires whenever the details modal opens/closes so the parent can keep
   *  this menu mounted (the modal lives in a portal but is a React child of
   *  this menu — unmounting the menu also unmounts the open modal). */
  onDetailsOpenChange?: (open: boolean) => void;
  memberId?: string;
  viewerRole?: import("@/hooks/useViewerRole").ViewerRole;
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
  onDetailsOpenChange,
  memberId,
  viewerRole = "owner",
}: SessionHoverMenuProps) {
  const isOwner = viewerRole === "owner";
  const [confirm, setConfirm] = useState(false);
  const [noteEdit, setNoteEdit] = useState(false);
  const [leaderNoteEdit, setLeaderNoteEdit] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  useEffect(() => {
    onDetailsOpenChange?.(showDetails);
  }, [showDetails, onDetailsOpenChange]);

  const hasNote = !!ev.sessionNote?.trim();

  // Leader / active-follower notes (Supabase).
  const leader = useDiarySessionNote(ev.id, memberId ?? "", viewerRole);
  const viewerName = useViewerName();
  const ownerFirstName = useMemberFirstName(memberId ?? "");
  const sessionDate = fromISOLocal(ev.startISO);
  const memberUpdatedAt = ev.sessionNoteUpdatedAt;
  const baseHeader = memberUpdatedAt ? dayLabel(new Date(memberUpdatedAt)) : "";
  const baseHeaderName = ownerFirstName || undefined;
  const hasLeaderNote = leader.leaderNotes.length > 0 || !!leader.viewerNote.trim();

  // Initialize the SessionDetailsValue from the event.
  const [detailsValue, setDetailsValue] = useState<SessionDetailsValue | null>(null);
  useEffect(() => {
    if (!showDetails) return;
    const start = fromISOLocal(ev.startISO);
    const end = fromISOLocal(ev.endISO);
    const startMin = start.getHours() * 60 + start.getMinutes();
    const endMin = end.getHours() * 60 + end.getMinutes();
    const durationMin = Math.max(0, endMin - startMin);
    let activities = ev.activities ?? [];
    // Seed an activity row from Strava data when none is stored yet.
    if (activities.length === 0 && ev.stravaActivityId) {
      activities = [
        {
          type: ev.diarySub ?? ev.diaryGroup ?? "running",
          durationMin,
          distanceKm: ev.distanceKm,
        },
      ];
    }
    setDetailsValue({
      title: ev.title,
      diaryType: (ev.diaryType as DiaryType) ?? "training",
      diaryGroup: ev.diaryGroup,
      diarySub: ev.diarySub,
      time: ev.allDay ? null : { startMin, endMin },
      distanceKm: ev.distanceKm,
      paceSecPerKm: ev.paceSecPerKm,
      sessionNote: ev.sessionNote ?? "",
      activities,
    });
  }, [showDetails, ev]);

  // Reset edit state when the session is no longer hovered AND nothing is open.
  useEffect(() => {
    if (!visible && !noteEdit && !showDetails && !confirm) {
      setNoteEdit(false);
    }
  }, [visible, noteEdit, showDetails, confirm]);

  // Lock the menu open while note edit / details / confirm is in flight.
  const sticky = noteEdit || leaderNoteEdit || confirm;
  const menuVisible = (visible || sticky) && !showDetails;

  // Outside-click closes everything when the note panel is open.
  const menuRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!noteEdit && !leaderNoteEdit) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node | null;
      const inMenu = menuRef.current?.contains(t as Node);
      const inNote = (t as HTMLElement | null)?.closest('[data-note-panel="1"]');
      if (!inMenu && !inNote) {
        setNoteEdit(false);
        setLeaderNoteEdit(false);
        onForceClose?.();
      }
    };
    window.addEventListener("mousedown", onDown);
    return () => window.removeEventListener("mousedown", onDown);
  }, [noteEdit, leaderNoteEdit, onForceClose]);

  const menuH = Math.max(28, rowHeight * 1.4);
  const ICON_W = 32;
  const PADDING_X = 6 * 2;
  const GAP = 2 * 2;
  const iconCount = isOwner ? 3 : 2;
  const compactW = NOTE_PANEL_W;
  void (ICON_W * iconCount + GAP + PADDING_X);
  // Member-side preview panel: shown when member has a note and menu is visible,
  // OR when the owner is editing their note.
  const showMemberPanel = (hasNote && menuVisible) || (isOwner && noteEdit);

  // Build the list of leader-side panels rendered BELOW the member panel.
  // Includes the viewer's own note (when non-owner & editable) plus every
  // other leader / follower note. Each gets just the author's name as header.
  type LeaderPanelItem = {
    key: string;
    headerName?: string;
    header: string;
    headerTime?: string;
    headerTimeFresh?: boolean;
    value: string;
    mode: "preview" | "edit";
    onSave: (text: string) => void;
    onRequestEdit?: () => void;
  };
  const leaderPanels: LeaderPanelItem[] = [];
  if (!isOwner && (leader.viewerNote.trim() || leaderNoteEdit || (leader.canEdit && menuVisible))) {
    const hasStamp = !!leader.viewerNoteUpdatedAt;
    leaderPanels.push({
      key: "viewer",
      headerName: viewerName || undefined,
      header: hasStamp ? dayLabel(new Date(leader.viewerNoteUpdatedAt)) : "",
      headerTime: hasStamp ? formatHHMM(leader.viewerNoteUpdatedAt) : undefined,
      headerTimeFresh: isUpdatedToday(leader.viewerNoteUpdatedAt),
      value: leader.viewerNote,
      mode: leaderNoteEdit && leader.canEdit ? "edit" : "preview",
      onSave: (text) => { void leader.saveViewerNote(text); },
      onRequestEdit: leader.canEdit ? () => setLeaderNoteEdit(true) : undefined,
    });
  }
  for (const n of leader.leaderNotes) {
    const hasStamp = !!n.updatedAt;
    leaderPanels.push({
      key: `leader-${n.authorId}`,
      headerName: n.authorName || undefined,
      header: hasStamp ? dayLabel(new Date(n.updatedAt)) : "",
      headerTime: hasStamp ? formatHHMM(n.updatedAt) : undefined,
      headerTimeFresh: isUpdatedToday(n.updatedAt),
      value: n.body,
      mode: "preview",
      onSave: () => {},
    });
  }
  const showLeaderPanels = menuVisible && leaderPanels.length > 0;
  const showAnyPanel = showMemberPanel || showLeaderPanels;
  const menuW = showAnyPanel ? NOTE_PANEL_W : compactW;

  // Estimate stack height for collision-aware vertical placement.
  const PANEL_EST_H = 200;
  const panelCount = (showMemberPanel ? 1 : 0) + (showLeaderPanels ? leaderPanels.length : 0);
  const totalH = menuH + panelCount * PANEL_EST_H;

  const gap = 4;
  let left = blockRect.left + blockRect.width + gap;
  if (left + menuW > window.innerWidth - 8) {
    // Flip to the left side of the block when there's no room on the right.
    left = Math.max(8, blockRect.left - menuW - gap);
  }
  // Vertical: prefer aligning with the block top, but shift up if the full
  // stack would overflow the viewport bottom (sessions near the bottom or on
  // the right side of the week grid).
  let top = blockRect.top;
  const vh = window.innerHeight;
  if (top + totalH > vh - 8) {
    top = Math.max(8, vh - 8 - totalH);
  }

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
            className={[
              "fixed z-[20] flex items-stretch gap-1 border border-hairline bg-card/95 px-1.5 shadow-md backdrop-blur transition-[width] duration-150",
              showMemberPanel ? "rounded-t-md border-b-0" : "rounded-md",
            ].join(" ")}
            style={{ left, top, width: menuW, height: menuH }}
            onMouseEnter={onMenuEnter}
            onMouseLeave={() => { if (!sticky) onMenuLeave?.(); }}
            onMouseDown={(e) => e.stopPropagation()}
            onClick={(e) => e.stopPropagation()}
          >
            {showMemberPanel && (
              <span
                aria-hidden
                className="pointer-events-none absolute left-0 top-0 h-full w-[3px] rounded-tl-md"
                style={{ background: "#9CA3AF" }}
              />
            )}
            <TitleInput
              value={ev.title}
              disabled={!isOwner}
              onCommit={(next) => {
                const trimmed = next.trim();
                if (trimmed === (ev.title ?? "")) return;
                onUpsert({ id: ev.id, title: trimmed });
              }}
            />
            <MenuBtn
              label={
                isOwner
                  ? hasNote ? "Rediger notat" : "Legg til notat"
                  : leader.viewerNote.trim() ? "Rediger ditt notat" : "Legg til notat"
              }
              accent={!isOwner ? "leader" : undefined}
              onClick={() => {
                if (isOwner) setNoteEdit(true);
                else if (leader.canEdit) setLeaderNoteEdit(true);
              }}
            >
              <StickyNote className="h-4 w-4" strokeWidth={2.25} />
            </MenuBtn>
            <MenuBtn label="Detaljer" onClick={() => setShowDetails(true)}>
              <Pencil className="h-4 w-4" strokeWidth={2.25} />
            </MenuBtn>
            {isOwner && (
              <MenuBtn
                label="Slett"
                destructive
                onClick={() => setConfirm(true)}
              >
                <Trash2 className="h-4 w-4" strokeWidth={2.25} />
              </MenuBtn>
            )}
          </div>,
          document.body,
        )
      )}

      {showAnyPanel &&
        createPortal(
          <div
            data-session-note-panel="1"
            className="fixed z-[20] flex flex-col"
            style={{ left, top: top + menuH, width: NOTE_PANEL_W }}
            onMouseEnter={onMenuEnter}
            onMouseLeave={() => { if (!sticky) onMenuLeave?.(); }}
            onMouseDown={(e) => e.stopPropagation()}
          >
            {showMemberPanel && (
              <NotePanel
                inline
                attached
                headerLabel={baseHeader}
                headerName={baseHeaderName}
                headerTime={memberUpdatedAt ? formatHHMM(memberUpdatedAt) : undefined}
                headerTimeFresh={isUpdatedToday(memberUpdatedAt)}
                initialValue={ev.sessionNote ?? ""}
                mode={isOwner && noteEdit ? "edit" : "preview"}
                defaultBodyHeight={140}
                panelWidth={NOTE_PANEL_W}
                closeOnEnter={false}
                closeOnOutsideClick={false}
                onSave={(text) => onSaveNote(text)}
                onClose={() => {
                  setNoteEdit(false);
                  onForceClose?.();
                }}
                onRequestEdit={isOwner ? () => setNoteEdit(true) : undefined}
              />
            )}
            {showLeaderPanels &&
              leaderPanels.map((p) => (
                <div key={p.key} style={{ marginTop: 4 }}>
                  <NotePanel
                    inline
                    headerLabel={p.header}
                    headerName={p.headerName}
                    headerTime={p.headerTime}
                    headerTimeFresh={p.headerTimeFresh}
                    initialValue={p.value}
                    mode={p.mode}
                    defaultBodyHeight={140}
                    panelWidth={NOTE_PANEL_W}
                    closeOnEnter={false}
                    closeOnOutsideClick={false}
                    tone="leader"
                    onSave={p.onSave}
                    onClose={() => {
                      setLeaderNoteEdit(false);
                      onForceClose?.();
                    }}
                    onRequestEdit={p.onRequestEdit}
                  />
                </div>
              ))}
          </div>,
          document.body,
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
                  stravaActivityId: ev.stravaActivityId ?? null,
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

function TitleInput({
  value,
  disabled,
  onCommit,
}: {
  value: string;
  disabled?: boolean;
  onCommit: (next: string) => void;
}) {
  const [v, setV] = useState(value);
  useEffect(() => { setV(value); }, [value]);
  return (
    <input
      type="text"
      value={v}
      disabled={disabled}
      onChange={(e) => setV(e.target.value)}
      onMouseDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
      onBlur={() => onCommit(v)}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          (e.currentTarget as HTMLInputElement).blur();
        } else if (e.key === "Escape") {
          e.preventDefault();
          setV(value);
          (e.currentTarget as HTMLInputElement).blur();
        }
      }}
      placeholder="Navngi økt"
      className="min-w-0 flex-1 self-center overflow-hidden whitespace-nowrap bg-transparent pl-1.5 pr-2 text-[12px] text-ink outline-none placeholder:text-muted-foreground/60 disabled:cursor-default"
      style={{
        WebkitMaskImage:
          "linear-gradient(to right, #000 0, #000 calc(100% - 28px), transparent 100%)",
        maskImage:
          "linear-gradient(to right, #000 0, #000 calc(100% - 28px), transparent 100%)",
      }}
    />
  );
}

function MenuBtn({
  children,
  label,
  destructive,
  accent,
  onClick,
}: {
  children: React.ReactNode;
  label: string;
  destructive?: boolean;
  accent?: "leader";
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
          : accent === "leader"
            ? "text-primary hover:bg-primary/10"
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

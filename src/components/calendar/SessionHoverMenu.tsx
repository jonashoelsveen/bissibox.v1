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

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { StickyNote, Pencil, Trash2 } from "lucide-react";
import { NotePanel, isUpdatedToday, useMemberFirstName } from "./DayNoteButton";
import type { CalendarEvent } from "./yearStore";
import { fromISOLocal, toISOLocal, setHM } from "./dateUtils";
import { useDiarySessionNote } from "@/hooks/useDiarySessionNote";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { CAT_TRAINING_COLOR } from "./MonthGridType1";
import { colorForActivity } from "@/lib/activity-colors";
import {
  DIARY_GROUPS,
  DurationRow,
  ActivitySelectRow,
  prettyStravaSportName,
} from "./DiaryEditFields";
import { setHoverLock, releaseHoverLockIf } from "./hoverLock";

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
  /** Open the details modal for this event. Owned by the parent so the
   *  modal's lifecycle is independent of hover state. */
  onOpenDetails: () => void;
  visible: boolean;
  /** When true, immediately enter edit mode (used when the parent routes a
   *  click on the session block into this menu instead of opening a modal). */
  defaultEditMode?: boolean;
  onMenuEnter?: () => void;
  onMenuLeave?: () => void;
  onForceClose?: () => void;
  /** Fired whenever the menu becomes "sticky" (note panel open, leader note
   *  open, edit mode, or confirm dialog). Parent uses this to lock hover
   *  state to this event id so hovering other tiles cannot steal focus. */
  onActiveChange?: (active: boolean) => void;
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
  onOpenDetails,
  visible,
  defaultEditMode = false,
  onMenuEnter,
  onMenuLeave,
  onForceClose,
  onActiveChange,
  memberId,
  viewerRole = "owner",
}: SessionHoverMenuProps) {
  const isOwner = viewerRole === "owner";
  const [confirm, setConfirm] = useState(false);
  const [noteEdit, setNoteEdit] = useState(false);
  const [leaderNoteEdit, setLeaderNoteEdit] = useState(false);

  // --- Edit mode (replaces the old DiaryPopoverEditor for existing sessions) ---
  // Edit mode is owner-only. Group leaders / followers click → open details
  // modal (handled by the parent). They never see an inline edit panel.
  const [editMode, setEditMode] = useState(defaultEditMode && viewerRole === "owner");
  useEffect(() => {
    if (defaultEditMode && viewerRole === "owner") setEditMode(true);
  }, [defaultEditMode, ev.id, viewerRole]);

  // Derive initial edit-state from the event whenever it identity-changes.
  const inferred = useMemo(() => {
    const a = (ev.activity || "").toLowerCase();
    if (a === "strength") return { group: "strength", sub: "max" };
    if (a === "cycling") return { group: "endurance", sub: "cycling" };
    if (a === "swimming") return { group: "endurance", sub: "swimming" };
    if (a === "xcskiing") return { group: "endurance", sub: "other" };
    if (a === "running") return { group: "endurance", sub: "running" };
    return { group: "endurance", sub: "running" };
  }, [ev.activity]);
  const initialDuration = useMemo(() => {
    if (!ev.startISO || !ev.endISO) return 0;
    const s = new Date(ev.startISO).getTime();
    const e = new Date(ev.endISO).getTime();
    if (!Number.isFinite(s) || !Number.isFinite(e)) return 0;
    return Math.max(0, Math.round((e - s) / 60000));
  }, [ev.startISO, ev.endISO]);

  const [durationMin, setDurationMin] = useState<number>(initialDuration);
  const [diaryGroup, setDiaryGroup] = useState<string>(ev.diaryGroup ?? inferred.group);
  const [diarySub, setDiarySub] = useState<string>(ev.diarySub ?? inferred.sub);
  // Re-seed editing fields when switching to a different event.
  useEffect(() => {
    setDurationMin(initialDuration);
    setDiaryGroup(ev.diaryGroup ?? inferred.group);
    setDiarySub(ev.diarySub ?? inferred.sub);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ev.id]);

  const groupDef = DIARY_GROUPS.find((g) => g.id === diaryGroup);
  const hasSubs = !!groupDef?.children?.length;
  const accent =
    diaryGroup === "endurance" ? colorForActivity(diarySub) : CAT_TRAINING_COLOR;

  const commitEdit = () => {
    const start = fromISOLocal(ev.startISO);
    const startMin = start.getHours() * 60 + start.getMinutes();
    const endMin = startMin + Math.max(0, durationMin);
    const startISO = toISOLocal(setHM(start, Math.floor(startMin / 60), startMin % 60));
    const endISO = toISOLocal(setHM(start, Math.floor(endMin / 60), endMin % 60));
    const trainingColor =
      diaryGroup === "endurance" ? colorForActivity(diarySub) : CAT_TRAINING_COLOR;
    onUpsert({
      id: ev.id,
      startISO,
      endISO,
      color: trainingColor,
      diaryType: "training",
      diaryGroup,
      diarySub: hasSubs ? diarySub : undefined,
    });
    setEditMode(false);
  };

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

  // Reset edit state when the session is no longer hovered AND nothing is open.
  useEffect(() => {
    if (!visible && !noteEdit && !confirm) {
      setNoteEdit(false);
    }
  }, [visible, noteEdit, confirm]);

  // Lock the menu open while note edit / confirm / edit mode is in flight.
  const sticky = noteEdit || leaderNoteEdit || confirm || editMode;
  const menuVisible = visible || sticky;

  // Notify parent so it can suppress hover on other tiles while this one is active.
  const onActiveChangeRef = useRef(onActiveChange);
  useEffect(() => { onActiveChangeRef.current = onActiveChange; }, [onActiveChange]);
  useEffect(() => {
    onActiveChangeRef.current?.(sticky);
    if (sticky) return () => onActiveChangeRef.current?.(false);
  }, [sticky]);

  // Acquire the shared hover lock while this menu is sticky so other panels
  // (other sessions, day-notes) cannot open on hover.
  const lockId = `session-${ev.id}`;
  useEffect(() => {
    if (sticky) setHoverLock(lockId);
    else releaseHoverLockIf(lockId);
    return () => releaseHoverLockIf(lockId);
  }, [sticky, lockId]);

  // Outside-click closes everything when the note panel or edit mode is open.
  const menuRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!noteEdit && !leaderNoteEdit && !editMode) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node | null;
      const inMenu = menuRef.current?.contains(t as Node);
      const inNote = (t as HTMLElement | null)?.closest('[data-note-panel="1"]');
      const inEditPanel = (t as HTMLElement | null)?.closest('[data-session-edit-panel="1"]');
      if (!inMenu && !inNote && !inEditPanel) {
        if (editMode) commitEdit();
        setNoteEdit(false);
        setLeaderNoteEdit(false);
        setEditMode(false);
        onForceClose?.();
      }
    };
    window.addEventListener("mousedown", onDown);
    return () => window.removeEventListener("mousedown", onDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [noteEdit, leaderNoteEdit, editMode, onForceClose]);

  // Enter to save edits, Escape to cancel.
  useEffect(() => {
    if (!editMode) return;
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && t.tagName === "TEXTAREA") return;
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        commitEdit();
      } else if (e.key === "Escape") {
        e.preventDefault();
        setEditMode(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editMode, durationMin, diaryGroup, diarySub]);

  const menuH = Math.max(28, rowHeight * 1.4);
  const ICON_W = 32;
  const PADDING_X = 6 * 2;
  const GAP = 2 * 2;
  const iconCount = isOwner ? 3 : 2;
  const compactW = NOTE_PANEL_W;
  void (ICON_W * iconCount + GAP + PADDING_X);
  // Member-side preview panel: shown when member has a note and menu is visible,
  // OR when the owner is editing their note.
  const showMemberPanel = isOwner && ((hasNote && menuVisible) || noteEdit);

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
      onSave: (text) => { void leader.saveViewerNote(text); setLeaderNoteEdit(false); },
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
  // Note panels are now capped (textarea is fixed-height with internal scroll),
  // so each panel is bounded. We still overestimate slightly to be safe.
  const PANEL_EST_H = 200;
  const EDIT_EXTRA_H = editMode ? 260 : 0; // duration + group + subgroup + footer rows + paddings
  const panelCount = (showMemberPanel ? 1 : 0) + (showLeaderPanels ? leaderPanels.length : 0);
  const totalH = menuH + panelCount * PANEL_EST_H + EDIT_EXTRA_H;

  // ─── Live anchor + header-aware positioning ──────────────────────────
  const gap = 4;
  const [pos, setPos] = useState<{ left: number; top: number; maxPanelH: number; flipped: boolean } | null>(null);
  const prevTopRef = useRef<number | null>(null);

  useEffect(() => {
    let raf = 0;
    let alive = true;
    const compute = () => {
      if (!alive) return;
      const anchor = document.querySelector(
        `[data-event-id="${CSS.escape(ev.id)}"]`,
      ) as HTMLElement | null;
      const ar = anchor?.getBoundingClientRect();
      const rect = ar
        ? { left: ar.left, top: ar.top, width: ar.width, height: ar.height, right: ar.right, bottom: ar.bottom }
        : { left: blockRect.left, top: blockRect.top, width: blockRect.width, height: blockRect.height, right: blockRect.left + blockRect.width, bottom: blockRect.top + blockRect.height };
      const vh = window.innerHeight;
      const vw = window.innerWidth;
      let headerBottom = 0;
      document.querySelectorAll<HTMLElement>('[data-grid-header="1"]').forEach((el) => {
        const r = el.getBoundingClientRect();
        if (r.bottom > 0 && r.top < vh) headerBottom = Math.max(headerBottom, r.bottom);
      });

      let left = rect.left + rect.width + gap;
      let flipped = false;
      if (left + NOTE_PANEL_W > vw - 8) {
        left = Math.max(8, rect.left - NOTE_PANEL_W - gap);
        flipped = true;
      }

      const minTop = headerBottom + 2;
      // Estimate full stack height so the panel can lift up when anchored
      // near the bottom edge — otherwise the edit panel would clip off.
      const stackH = menuH + panelCount * PANEL_EST_H + EDIT_EXTRA_H;
      // Clamp so the ENTIRE stack (menu + note/leader panels + edit fields)
      // fits above the viewport bottom. If the stack is taller than the
      // available vertical space, pin to minTop and rely on internal scroll.
      const maxTop = Math.max(minTop, vh - 8 - stackH);
      // Preferred top: aligned with the tile, but lifted so the whole stack
      // fits above the viewport bottom when possible.
      const bottomFitTop = Math.min(rect.top, vh - 8 - stackH);
      const desiredTop = Math.min(Math.max(bottomFitTop, minTop), maxTop);
      // Contact-aware: keep prior top while still overlapping the tile
      // vertically AND while the tile is at least partially visible;
      // otherwise snap to desiredTop (clamped to header/bottom edge).
      // CSS transition smooths the snap into a calm follow animation.
      const prev = prevTopRef.current;
      const tileVisible = rect.bottom > headerBottom + 2 && rect.top < vh - 2;
      const inContact =
        tileVisible &&
        prev !== null &&
        prev + menuH > rect.top - 4 &&
        prev < rect.bottom + 4 &&
        prev >= minTop &&
        prev <= maxTop &&
        prev + stackH <= vh - 6;
      const top = inContact ? prev! : desiredTop;
      prevTopRef.current = top;
      const maxPanelH = Math.max(120, vh - 8 - (top + menuH));
      setPos((p) =>
        p && p.left === left && p.top === top && p.maxPanelH === maxPanelH && p.flipped === flipped
          ? p
          : { left, top, maxPanelH, flipped },
      );
    };

    const schedule = () => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        compute();
      });
    };

    compute();
    window.addEventListener("scroll", schedule, true);
    window.addEventListener("resize", schedule);
    const ro = new ResizeObserver(schedule);
    ro.observe(document.body);
    return () => {
      alive = false;
      if (raf) cancelAnimationFrame(raf);
      window.removeEventListener("scroll", schedule, true);
      window.removeEventListener("resize", schedule);
      ro.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ev.id, blockRect.left, blockRect.top, blockRect.width, blockRect.height, menuH, showMemberPanel, showLeaderPanels, editMode, panelCount]);

  // Reset contact-anchor when the event id changes so a new tile snaps fresh.
  useEffect(() => { prevTopRef.current = null; }, [ev.id]);

  const left = pos?.left ?? blockRect.left + blockRect.width + gap;
  const top = pos?.top ?? blockRect.top;
  const panelMaxH = pos?.maxPanelH ?? Math.max(120, window.innerHeight - 8 - (top + menuH));
  void totalH; // retained for potential future use

  // Details modal lifecycle is owned by the parent (lifted out of this menu so
  // it survives hover transitions, refetches, and menu unmounts).

  // Whether the stack continues below (note panel or edit panel) — used to
  // decide whether the menu's bottom-right/bottom-left corners stay rounded.
  const stackBelow = showMemberPanel || showLeaderPanels || editMode;
  const railColor = editMode ? accent : "#9CA3AF";

  return (
    <>
      {menuVisible && (
        createPortal(
          <div
            ref={menuRef}
            data-session-hover-menu="1"
            className={[
              "fixed z-[20] flex items-stretch gap-1 border border-hairline bg-card/95 px-1.5 shadow-md backdrop-blur transition-[width,left,top] duration-150 ease-out",
              stackBelow ? "rounded-t-md border-b-0" : "rounded-md",
            ].join(" ")}
            style={{ left, top, width: menuW, height: menuH }}
            onMouseEnter={onMenuEnter}
            onMouseLeave={() => { if (!sticky) onMenuLeave?.(); }}
            onMouseDown={(e) => e.stopPropagation()}
            onClick={(e) => e.stopPropagation()}
          >
            {stackBelow && (
              <span
                aria-hidden
                className="pointer-events-none absolute left-0 top-0 h-full w-[3px] rounded-tl-md"
                style={{ background: railColor }}
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
            {isOwner && (
              <MenuBtn
                label={hasNote ? "Rediger notat" : "Legg til notat"}
                onClick={() => setNoteEdit(true)}
              >
                <StickyNote className="h-4 w-4" strokeWidth={2.25} />
              </MenuBtn>
            )}
            <MenuBtn label="Detaljer" onClick={onOpenDetails}>
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

      {(showAnyPanel || editMode) &&
        createPortal(
          <div
            data-session-note-panel="1"
            className="fixed z-[20] flex flex-col overflow-y-auto transition-[left,top] duration-150 ease-out"
            style={{ left, top: top + menuH, width: NOTE_PANEL_W, maxHeight: panelMaxH }}
            onMouseEnter={onMenuEnter}
            onMouseLeave={() => { if (!sticky) onMenuLeave?.(); }}
            onMouseDown={(e) => e.stopPropagation()}
          >
            {!editMode && showMemberPanel && (
              <NotePanel
                inline
                attached
                tone="gray"
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
                onSave={(text) => { onSaveNote(text); setNoteEdit(false); }}
                onClose={() => {
                  setNoteEdit(false);
                  onForceClose?.();
                }}
                onRequestEdit={isOwner ? () => setNoteEdit(true) : undefined}
              />
            )}
            {!editMode && showLeaderPanels &&
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
            {editMode && (
              <div
                data-session-edit-panel="1"
                className="overflow-hidden rounded-b-md border-x border-b border-ink/15 bg-card shadow-md"
                onMouseDown={(e) => e.stopPropagation()}
                onClick={(e) => e.stopPropagation()}
              >
                <DurationRow accent={accent} durationMin={durationMin} onChange={setDurationMin} />
                <ActivitySelectRow
                  accent={accent}
                  diaryGroup={diaryGroup}
                  diarySub={diarySub}
                  lockedLabel={
                    ev.stravaActivityId
                      ? prettyStravaSportName(ev.sportType) || "Strava activity"
                      : null
                  }
                  onChange={(g, s) => {
                    setDiaryGroup(g);
                    setDiarySub(s);
                  }}
                />

                {isOwner && (
                  <NotePanel
                    inline
                    attached
                    flush
                    showFooter={false}
                    tone={accent}
                    headerLabel={baseHeader}
                    headerName={baseHeaderName}
                    headerTime={memberUpdatedAt ? formatHHMM(memberUpdatedAt) : undefined}
                    headerTimeFresh={isUpdatedToday(memberUpdatedAt)}
                    initialValue={ev.sessionNote ?? ""}
                    mode={hasNote && !noteEdit ? "preview" : "edit"}
                    defaultBodyHeight={120}
                    panelWidth={NOTE_PANEL_W}
                    closeOnEnter={false}
                    closeOnOutsideClick={false}
                    onSave={(text) => { onSaveNote(text); setNoteEdit(false); }}
                    onClose={() => setNoteEdit(false)}
                    onRequestEdit={() => setNoteEdit(true)}
                  />
                )}
                {leader.leaderNotes.map((n) => {
                  const hasStamp = !!n.updatedAt;
                  return (
                    <NotePanel
                      key={`leader-${n.authorId}`}
                      inline
                      attached
                      flush
                      showFooter={false}
                      tone="leader"
                      headerLabel={hasStamp ? dayLabel(new Date(n.updatedAt)) : ""}
                      headerName={n.authorName || undefined}
                      headerTime={hasStamp ? formatHHMM(n.updatedAt) : undefined}
                      headerTimeFresh={isUpdatedToday(n.updatedAt)}
                      initialValue={n.body}
                      mode="preview"
                      defaultBodyHeight={120}
                      panelWidth={NOTE_PANEL_W}
                      closeOnEnter={false}
                      closeOnOutsideClick={false}
                      onSave={() => {}}
                      onClose={() => {}}
                    />
                  );
                })}
                {!isOwner && (leader.canEdit || leader.viewerNote.trim()) && (
                  <NotePanel
                    inline
                    attached
                    flush
                    showFooter={false}
                    tone="leader"
                    headerLabel={leader.viewerNoteUpdatedAt ? dayLabel(new Date(leader.viewerNoteUpdatedAt)) : ""}
                    headerName={viewerName || undefined}
                    headerTime={leader.viewerNoteUpdatedAt ? formatHHMM(leader.viewerNoteUpdatedAt) : undefined}
                    headerTimeFresh={isUpdatedToday(leader.viewerNoteUpdatedAt)}
                    initialValue={leader.viewerNote}
                    mode={leader.viewerNote.trim() && !leaderNoteEdit ? "preview" : "edit"}
                    defaultBodyHeight={120}
                    panelWidth={NOTE_PANEL_W}
                    closeOnEnter={false}
                    closeOnOutsideClick={false}
                    onSave={(text) => { void leader.saveViewerNote(text); setLeaderNoteEdit(false); }}
                    onClose={() => setLeaderNoteEdit(false)}
                    onRequestEdit={leader.canEdit ? () => setLeaderNoteEdit(true) : undefined}
                  />
                )}
                <div className="flex items-center justify-between border-t border-hairline px-3 py-2 text-[11px] text-muted-foreground">
                  <span className="mono tabular-nums">⏎ for å lagre</span>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      commitEdit();
                    }}
                    className="rounded-md bg-primary px-2.5 py-1 text-[11.5px] font-medium text-primary-foreground hover:opacity-90"
                  >
                    Lagre
                  </button>
                </div>
              </div>
            )}
          </div>,
          document.body,
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

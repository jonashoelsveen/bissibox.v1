/**
 * SessionDetailsContainer — owns the SessionDetailsModal lifecycle for a
 * single CalendarEvent. Rendered as a sibling of the hover menu (not as a
 * child) so it stays mounted regardless of hover state, event refetches, or
 * menu unmounts.
 */

import { useEffect, useRef, useState } from "react";
import { SessionDetailsModal, type SessionDetailsValue } from "./SessionDetailsModal";
import { CAT_TRAINING_COLOR } from "./MonthGridType1";
import { colorForActivity } from "@/lib/activity-colors";
import { DIARY_GROUPS, type DiaryType } from "./DiaryPopoverEditor";
import type { CalendarEvent } from "./yearStore";
import { fromISOLocal, toISOLocal, setHM } from "./dateUtils";

import type { ViewerRole } from "@/hooks/useViewerRole";

export interface SessionDetailsContainerProps {
  ev: CalendarEvent;
  onClose: () => void;
  onUpsert: (patch: Partial<CalendarEvent> & { id: string }) => void;
  onDelete?: () => void;
  /**
   * Provided only when the current user owns this calendar AND the event is
   * coach-pending. Triggers the "accept the coach's proposal" flow: any in-
   * progress edits are persisted first, then `coach_pending` is flipped off
   * so the tile renders as a normal accepted session.
   */
  onAccept?: () => void;
  memberId?: string;
  viewerRole?: ViewerRole;
}

export function SessionDetailsContainer({
  ev,
  onClose,
  onUpsert,
  onDelete,
  onAccept,
  memberId,
  viewerRole = "owner",
}: SessionDetailsContainerProps) {
  const [detailsValue, setDetailsValue] = useState<SessionDetailsValue | null>(null);
  const lastPendingAutosaveRef = useRef<string>("");

  useEffect(() => {
    const start = fromISOLocal(ev.startISO);
    const end = fromISOLocal(ev.endISO);
    const startMin = start.getHours() * 60 + start.getMinutes();
    const endMin = end.getHours() * 60 + end.getMinutes();
    const durationMin = Math.max(0, endMin - startMin);
    let activities = ev.activities ?? [];
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
    // Only re-seed when the event identity changes — not on every refetch — so
    // in-progress edits aren't clobbered.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ev.id]);

  const buildPatch = (v: SessionDetailsValue): Partial<CalendarEvent> & { id: string } => {
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
    const primaryActivity = (() => {
      const raw =
        v.activities?.[0]?.type ??
        (v.diaryType === "training" ? (hasSubs ? v.diarySub : v.diaryGroup) : undefined);
      switch ((raw ?? "").toLowerCase()) {
        case "running":
        case "cycling":
        case "swimming":
        case "xcskiing":
          return raw as CalendarEvent["activity"];
        case "strength":
        case "core":
        case "max":
          return "strength";
        default:
          return undefined;
      }
    })();
    return {
      id: ev.id,
      title: v.title.trim(),
      color,
      startISO,
      endISO,
      allDay: false,
      activity: primaryActivity,
      diaryType: v.diaryType,
      diaryGroup: v.diaryType === "training" ? v.diaryGroup : undefined,
      diarySub: v.diaryType === "training" && hasSubs ? v.diarySub : undefined,
      distanceKm: v.distanceKm,
      paceSecPerKm: v.paceSecPerKm,
      sessionNote: v.sessionNote || undefined,
      activities: v.activities && v.activities.length ? v.activities : undefined,
    };
  };

  useEffect(() => {
    if (!detailsValue) {
      lastPendingAutosaveRef.current = "";
      return;
    }
    if (!(ev.coachPending && onAccept)) {
      lastPendingAutosaveRef.current = "";
      return;
    }
    const snapshot = JSON.stringify(buildPatch(detailsValue));
    if (!lastPendingAutosaveRef.current) {
      lastPendingAutosaveRef.current = snapshot;
      return;
    }
    if (snapshot === lastPendingAutosaveRef.current) return;
    lastPendingAutosaveRef.current = snapshot;
    onUpsert(buildPatch(detailsValue));
  }, [detailsValue, ev.coachPending, onAccept, onUpsert]);

  if (!detailsValue) return null;

  return (
    <SessionDetailsModal
      isEdit={true}
      date={fromISOLocal(ev.startISO)}
      readOnly={viewerRole !== "owner"}
      memberId={memberId}
      viewerRole={viewerRole}
      eventId={ev.id}
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
      onClose={onClose}
      suppressUnsavedPrompt={!!(ev.coachPending && onAccept)}
      onSave={(v) => {
        onUpsert(buildPatch(v));
        onClose();
      }}
      onDelete={
        onDelete
          ? () => {
              onDelete();
              onClose();
            }
          : undefined
      }
      isCoachPending={!!ev.coachPending}
      onAccept={
        onAccept
          ? (v: SessionDetailsValue) => {
              // Persist any in-progress edits (title, activity, time, etc.)
              // AND flip coach_pending off in the same upsert. Doing the flip
              // in the patch (instead of a follow-up update) avoids a window
              // where a realtime echo of the still-pending row clobbers the
              // local accepted state and leaves the stripe stuck on.
              onUpsert({ ...buildPatch(v), coachPending: false });
              onAccept();
              onClose();
            }
          : undefined
      }
    />
  );
}

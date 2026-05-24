/**
 * SessionDetailsContainer — owns the SessionDetailsModal lifecycle for a
 * single CalendarEvent. Rendered as a sibling of the hover menu (not as a
 * child) so it stays mounted regardless of hover state, event refetches, or
 * menu unmounts.
 */

import { useEffect, useState } from "react";
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
  memberId?: string;
  viewerRole?: ViewerRole;
}

export function SessionDetailsContainer({
  ev,
  onClose,
  onUpsert,
  onDelete,
  memberId,
  viewerRole = "owner",
}: SessionDetailsContainerProps) {
  const [detailsValue, setDetailsValue] = useState<SessionDetailsValue | null>(null);

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
    />
  );
}

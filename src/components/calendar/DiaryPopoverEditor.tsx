/**
 * DiaryPopoverEditor — diary-mode inline editor used when the user clicks
 * an existing session or creates a new one.
 *
 * Layout (top → bottom):
 *   1. Header bar that mirrors the SessionHoverMenu: title input, note,
 *      details (pencil) and delete icons. Same icon sizes / styling.
 *   2. Optional NotePanel (toggled by the note icon) — appears directly
 *      under the header, exactly like the hover menu does.
 *   3. Duration row with a clock icon on the left and two compact digit
 *      inputs (HH "h" MM "min") that auto-advance like the calendar
 *      session modal.
 *   4. Colour dropdown (same palette as three-dot menus).
 *   5. Footer with Save button.
 *
 * Start time is intentionally NOT editable here; that lives in the
 * Session Details modal (opened via the pencil icon).
 */

import { useEffect, useRef, useState } from "react";
import { Pencil, Trash2, StickyNote } from "lucide-react";
import type { CalendarEvent } from "./yearStore";
import { SessionDetailsModal, type SessionDetailsValue } from "./SessionDetailsModal";
import { ConfirmDeleteSessionDialog } from "./ConfirmDeleteSessionDialog";
import { NotePanel } from "./DayNoteButton";
import { computePopoverPosition } from "./popoverPosition";
import {
  DIARY_GROUPS,
  DurationRow,
  ColorSelectRow,
} from "./DiaryEditFields";
import { SessionLocationField } from "./SessionLocationField";
import { DEFAULT_SESSION_COLOR } from "@/components/library/CategoryActionsMenu";


export { DIARY_GROUPS };

export type DiaryType = "training" | "note";

export interface DiaryPopoverValue {
  title: string;
  color: string | null;
  /** Resolved diary_activity category id, when the activity matches one of
   *  the user's category tabs. Persisted on the session so future color
   *  changes to that category cascade to this session. */
  categoryId?: string | null;
  time: { startMin: number; endMin: number } | null;
  allDay?: boolean;
  diaryType: DiaryType;
  diaryGroup?: string;
  diarySub?: string;
  distanceKm?: number;
  paceSecPerKm?: number;
  sessionNote?: string;
  location?: string;
  locationUrl?: string;
  activities?: { type: string; durationMin?: number; distanceKm?: number }[];
}

export interface DiaryPopoverEditorProps {
  initialEvent?: Partial<CalendarEvent> | null;
  isEdit: boolean;
  anchor: DOMRect;
  initialTime?: { startMin: number; endMin: number } | null;
  date?: Date;
  onClose: () => void;
  onCommit: (value: DiaryPopoverValue, opts?: { delete?: boolean }) => void;
  /** When provided, used as the session colour (existing tile, or Blue for new). */
  defaultColor?: string | null;
  /** Fires as soon as the user picks a colour so the parent can recolor the tile. */
  onColorChange?: (color: string) => void;
  /** The user's diary_activity category list — used to keep the session on
   *  the matching activity tab without driving colour. */
  diaryActivityCategories?: { id: string; name: string; color: string }[];
}

export function DiaryPopoverEditor({
  initialEvent,
  isEdit,
  anchor,
  initialTime = null,
  date,
  onClose,
  onCommit,
  defaultColor,
  onColorChange,
  diaryActivityCategories = [],
}: DiaryPopoverEditorProps) {
  const [title, setTitle] = useState(initialEvent?.title ?? "");

  const inferredFromActivity = (() => {
    const a = (initialEvent?.activity || "").toLowerCase();
    if (a === "strength") return { group: "strength", sub: "max" };
    if (a === "cycling") return { group: "endurance", sub: "cycling" };
    if (a === "swimming") return { group: "endurance", sub: "swimming" };
    if (a === "xcskiing") return { group: "endurance", sub: "other" };
    if (a === "running") return { group: "endurance", sub: "running" };
    return null;
  })();
  const [diaryGroup, setDiaryGroup] = useState<string>(
    initialEvent?.diaryGroup ?? inferredFromActivity?.group ?? "endurance",
  );
  const [diarySub, setDiarySub] = useState<string>(
    initialEvent?.diarySub ?? inferredFromActivity?.sub ?? "running",
  );
  const [sessionColor, setSessionColor] = useState<string>(
    defaultColor ?? initialEvent?.color ?? DEFAULT_SESSION_COLOR,
  );

  // Duration in minutes. Derived from initialTime / initialEvent on mount.
  const initialDurationMin = (() => {
    if (initialTime) return Math.max(0, initialTime.endMin - initialTime.startMin);
    if (initialEvent?.startISO && initialEvent?.endISO) {
      const s = new Date(initialEvent.startISO).getTime();
      const e = new Date(initialEvent.endISO).getTime();
      if (Number.isFinite(s) && Number.isFinite(e)) return Math.max(0, Math.round((e - s) / 60000));
    }
    return 0;
  })();
  const [durationMin, setDurationMin] = useState<number>(initialDurationMin);
  const [allDay, setAllDay] = useState<boolean>(!!initialEvent?.allDay);
  const [location, setLocation] = useState(initialEvent?.location ?? "");
  const [locationUrl, setLocationUrl] = useState(initialEvent?.locationUrl ?? "");
  const prevDurationRef = useRef<number>(initialDurationMin || 60);
  const handleAllDayToggle = (next: boolean) => {
    if (next) {
      if (durationMin > 0) prevDurationRef.current = durationMin;
      setDurationMin(0);
      setAllDay(true);
    } else {
      setAllDay(false);
      setDurationMin(prevDurationRef.current > 0 ? prevDurationRef.current : 60);
    }
  };
  // Keep the original start so we can rebuild the time range when only the
  // duration changes here. Falls back to initialTime?.startMin or null.
  const initialStartMin = (() => {
    if (initialTime) return initialTime.startMin;
    if (initialEvent?.startISO) {
      const d = new Date(initialEvent.startISO);
      if (Number.isFinite(d.getTime())) return d.getHours() * 60 + d.getMinutes();
    }
    return null;
  })();

  const [showDetails, setShowDetails] = useState(false);
  const [showNote, setShowNote] = useState(!!initialEvent?.sessionNote);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const [distanceKm, setDistanceKm] = useState<number | undefined>(initialEvent?.distanceKm);
  const [paceSecPerKm] = useState<number | undefined>(initialEvent?.paceSecPerKm);
  const [sessionNote, setSessionNote] = useState<string>(initialEvent?.sessionNote ?? "");
  const [activities, setActivities] = useState<DiaryPopoverValue["activities"]>(
    initialEvent?.activities ?? [],
  );

  const ref = useRef<HTMLDivElement | null>(null);

  const groupDef = DIARY_GROUPS.find((g) => g.id === diaryGroup);
  const hasSubs = !!groupDef?.children?.length;
  const accent = sessionColor || DEFAULT_SESSION_COLOR;

  // Refs for unmount-safe autosave
  const stateRef = useRef({ title, diaryGroup, diarySub, durationMin, allDay, distanceKm, paceSecPerKm, sessionNote, location, locationUrl, activities, sessionColor });
  useEffect(() => {
    stateRef.current = { title, diaryGroup, diarySub, durationMin, allDay, distanceKm, paceSecPerKm, sessionNote, location, locationUrl, activities, sessionColor };
  });

  const buildValue = (): DiaryPopoverValue => {
    const s = stateRef.current;
    const activityKey = (s.diaryGroup === "endurance" ? s.diarySub : s.diaryGroup) || "";
    const matchedCategory = diaryActivityCategories.find(
      (c) => c.name.toLowerCase() === activityKey.toLowerCase(),
    );
    // Reconstruct the time range from the original start + current duration.
    const startMin = initialStartMin ?? 9 * 60;
    const time = s.allDay
      ? { startMin: 0, endMin: 0 }
      : s.durationMin > 0
        ? { startMin, endMin: startMin + s.durationMin }
        : initialTime ?? null;
    return {
      title: s.title.trim(),
      color: s.sessionColor || DEFAULT_SESSION_COLOR,
      categoryId: initialEvent?.categoryId ?? matchedCategory?.id ?? null,
      time,
      allDay: s.allDay,
      diaryType: "training",
      diaryGroup: s.diaryGroup,
      diarySub: hasSubs ? s.diarySub : undefined,
      distanceKm: s.distanceKm,
      paceSecPerKm: s.paceSecPerKm,
      sessionNote: s.sessionNote || undefined,
      location: s.location.trim() || undefined,
      locationUrl: s.locationUrl.trim() || undefined,
      activities: s.activities && s.activities.length ? s.activities : undefined,
    };
  };

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (showDetails || confirmDelete) return;
      if (!ref.current) return;
      if (!ref.current.contains(e.target as Node)) {
        // Defer the commit so a click that lands on another session tile
        // (or day cell) can run first and open its own editor. The parent
        // close-handler is guarded to ignore stale closes once the popover
        // has been re-pointed at a different target.
        const value = buildValue();
        setTimeout(() => onCommit(value), 0);
      }
    };
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (showDetails || confirmDelete) return;
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      } else if (e.key === "Enter" && !e.shiftKey) {
        const t = e.target as HTMLElement | null;
        if (t && t.tagName === "TEXTAREA") return;
        e.preventDefault();
        onCommit(buildValue());
      }
    };
    window.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onCommit, onClose, showDetails, confirmDelete]);

  // Positioning — same heuristic as before.
  const POPOVER_W = 280;
  const POPOVER_H = (hasSubs ? 240 : 210) + (showNote ? 180 : 0);
  const { top, left } = computePopoverPosition(anchor, POPOVER_W, POPOVER_H);


  return (
    <>
      <div
        ref={ref}
        data-role="popover"
        className="fixed z-50"
        style={{ top, left, width: POPOVER_W }}
      >
        <div className="overflow-hidden rounded-md border border-ink/15 bg-card shadow-lg">
          {/* Header bar — mirrors SessionHoverMenu */}
          <div className="relative flex items-stretch gap-1 border-b border-hairline px-1.5 py-1.5">
            <span
              aria-hidden
              className="pointer-events-none absolute left-0 top-0 h-full w-[3px]"
              style={{ background: accent }}
            />
            <input
              autoFocus
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Navngi økt"
              className="min-w-0 flex-1 self-center overflow-hidden whitespace-nowrap bg-transparent pl-2 pr-2 text-[12px] text-ink outline-none placeholder:text-muted-foreground/60"
              style={{
                WebkitMaskImage:
                  "linear-gradient(to right, #000 0, #000 calc(100% - 28px), transparent 100%)",
                maskImage:
                  "linear-gradient(to right, #000 0, #000 calc(100% - 28px), transparent 100%)",
              }}
            />
            <HeaderIconBtn
              label={sessionNote ? "Rediger notat" : "Legg til notat"}
              onClick={() => setShowNote((v) => !v)}
            >
              <StickyNote className="h-4 w-4" strokeWidth={2.25} />
            </HeaderIconBtn>
            <HeaderIconBtn
              label="Detaljer"
              onClick={() => setShowDetails(true)}
            >
              <Pencil className="h-4 w-4" strokeWidth={2.25} />
            </HeaderIconBtn>
            {isEdit && (
              <HeaderIconBtn
                label="Slett"
                destructive
                onClick={() => setConfirmDelete(true)}
              >
                <Trash2 className="h-4 w-4" strokeWidth={2.25} />
              </HeaderIconBtn>
            )}
          </div>

          {/* Duration row — clock icon + auto-advance HH/MM inputs */}
          <DurationRow accent={accent} durationMin={durationMin} onChange={setDurationMin} allDay={allDay} onAllDayChange={handleAllDayToggle} />

          <div className="px-2 py-1.5">
            <SessionLocationField
              value={location}
              onChange={setLocation}
              size="compact"
              locationUrl={locationUrl || null}
              onLocationUrlClear={() => setLocationUrl("")}
              onPlaceSelect={(place) => {
                setLocation(place.name);
                setLocationUrl(place.locationUrl);
              }}
            />
          </div>

          {/* Colour dropdown — same palette as three-dot menus */}
          <ColorSelectRow
            accent={accent}
            color={sessionColor}
            onChange={(hex) => {
              setSessionColor(hex);
              onColorChange?.(hex);
            }}
          />


          {/* Note panel — sits directly above the Save bar */}
          {showNote && (
            <NotePanel
              inline
              attached
              flush
              tone={accent}
              initialValue={sessionNote}
              mode="edit"
              defaultBodyHeight={120}
              panelWidth={POPOVER_W}
              closeOnEnter={false}
              closeOnOutsideClick={false}
              showFooter={false}
              onSave={(text) => setSessionNote(text)}
              onClose={() => setShowNote(false)}
            />
          )}

          {/* Footer */}
          <div className="flex items-center justify-between border-t border-hairline px-3 py-2 text-[11px] text-muted-foreground">
            <span className="mono tabular-nums">⏎ for å lagre</span>
            <button
              type="button"
              onClick={() => onCommit(buildValue())}
              className="rounded-md bg-primary px-2.5 py-1 text-[11.5px] font-medium text-primary-foreground hover:opacity-90"
            >
              {isEdit ? "Lagre" : "Legg til"}
            </button>
          </div>
        </div>
      </div>

      {showDetails && (
        <SessionDetailsModal
          isEdit={isEdit}
          date={date}
          strava={
            initialEvent?.summaryPolyline
              ? {
                  polyline: initialEvent.summaryPolyline,
                  elevationGainM: initialEvent.totalElevationGainM ?? null,
                  distanceKm: initialEvent.distanceKm ?? null,
                  stravaActivityId: initialEvent.stravaActivityId ?? null,
                }
              : null
          }
          value={{
            title,
            diaryType: "training",
            diaryGroup,
            diarySub,
            time: (() => {
              const startMin = initialStartMin ?? 9 * 60;
              return durationMin > 0
                ? { startMin, endMin: startMin + durationMin }
                : initialTime;
            })(),
            distanceKm,
            paceSecPerKm,
            sessionNote,
            activities: activities ?? [],
          }}
          onChange={(v: SessionDetailsValue) => {
            setTitle(v.title);
            if (v.diaryGroup) setDiaryGroup(v.diaryGroup);
            if (v.diarySub) setDiarySub(v.diarySub);
            if (v.time) setDurationMin(Math.max(0, v.time.endMin - v.time.startMin));
            setDistanceKm(v.distanceKm);
            setSessionNote(v.sessionNote ?? "");
            setActivities(v.activities ?? []);
          }}
          onClose={() => setShowDetails(false)}
          onDelete={isEdit ? () => {
            setShowDetails(false);
            onCommit(buildValue(), { delete: true });
          } : undefined}
          onSave={(v) => {
            const merged: DiaryPopoverValue = {
              title: v.title.trim(),
              color: sessionColor || DEFAULT_SESSION_COLOR,
              time: v.time,
              diaryType: "training",
              diaryGroup: v.diaryGroup,
              diarySub: DIARY_GROUPS.find((g) => g.id === v.diaryGroup)?.children?.length ? v.diarySub : undefined,
              distanceKm: v.distanceKm,
              paceSecPerKm: v.paceSecPerKm,
              sessionNote: v.sessionNote || undefined,
              activities: v.activities && v.activities.length ? v.activities : undefined,
            };
            setShowDetails(false);
            onCommit(merged);
          }}
        />
      )}

      <ConfirmDeleteSessionDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        onConfirm={() => {
          setConfirmDelete(false);
          onCommit(buildValue(), { delete: true });
        }}
      />
    </>
  );
}

function HeaderIconBtn({
  children,
  label,
  destructive,
  active,
  onClick,
}: {
  children: React.ReactNode;
  label: string;
  destructive?: boolean;
  active?: boolean;
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
        "grid h-7 w-8 place-items-center rounded transition-colors",
        destructive
          ? "text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
          : active
            ? "bg-secondary text-ink"
            : "text-muted-foreground hover:bg-secondary hover:text-ink",
      ].join(" ")}
    >
      {children}
    </button>
  );
}

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
 *   4. Activity group dropdown (Endurance / Strength / Stretch).
 *   5. Subgroup dropdown when applicable.
 *   6. Footer with Save button.
 *
 * Start time is intentionally NOT editable here; that lives in the
 * Session Details modal (opened via the pencil icon).
 */

import { useEffect, useRef, useState } from "react";
import { Pencil, Clock, Trash2, StickyNote } from "lucide-react";
import type { CalendarEvent } from "./yearStore";
import { CAT_TRAINING_COLOR } from "./MonthGridType1";
import { colorForActivity } from "@/lib/activity-colors";
import { SessionDetailsModal, type SessionDetailsValue } from "./SessionDetailsModal";
import { NotePanel } from "./DayNoteButton";

export type DiaryType = "training" | "note";

export const DIARY_GROUPS: { id: string; label: string; children?: { id: string; label: string }[] }[] = [
  {
    id: "endurance",
    label: "Endurance",
    children: [
      { id: "running", label: "Running" },
      { id: "swimming", label: "Swimming" },
      { id: "cycling", label: "Cycling" },
      { id: "other", label: "Other" },
    ],
  },
  {
    id: "strength",
    label: "Strength",
    children: [
      { id: "core", label: "Core" },
      { id: "max", label: "Max" },
    ],
  },
  { id: "stretch", label: "Stretch" },
];

export interface DiaryPopoverValue {
  title: string;
  color: string | null;
  time: { startMin: number; endMin: number } | null;
  diaryType: DiaryType;
  diaryGroup?: string;
  diarySub?: string;
  distanceKm?: number;
  paceSecPerKm?: number;
  sessionNote?: string;
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
}

export function DiaryPopoverEditor({
  initialEvent,
  isEdit,
  anchor,
  initialTime = null,
  date,
  onClose,
  onCommit,
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

  const [distanceKm, setDistanceKm] = useState<number | undefined>(initialEvent?.distanceKm);
  const [paceSecPerKm] = useState<number | undefined>(initialEvent?.paceSecPerKm);
  const [sessionNote, setSessionNote] = useState<string>(initialEvent?.sessionNote ?? "");
  const [activities, setActivities] = useState<DiaryPopoverValue["activities"]>(
    initialEvent?.activities ?? [],
  );

  const ref = useRef<HTMLDivElement | null>(null);

  const groupDef = DIARY_GROUPS.find((g) => g.id === diaryGroup);
  const hasSubs = !!groupDef?.children?.length;

  // Compute accent color for the side rail.
  const accent =
    diaryGroup === "endurance" ? colorForActivity(diarySub) : CAT_TRAINING_COLOR;

  // Refs for unmount-safe autosave
  const stateRef = useRef({ title, diaryGroup, diarySub, durationMin, distanceKm, paceSecPerKm, sessionNote, activities });
  useEffect(() => {
    stateRef.current = { title, diaryGroup, diarySub, durationMin, distanceKm, paceSecPerKm, sessionNote, activities };
  });

  const buildValue = (): DiaryPopoverValue => {
    const s = stateRef.current;
    const trainingColor =
      s.diaryGroup === "endurance" ? colorForActivity(s.diarySub) : CAT_TRAINING_COLOR;
    // Reconstruct the time range from the original start + current duration.
    const startMin = initialStartMin ?? 9 * 60;
    const time = s.durationMin > 0
      ? { startMin, endMin: startMin + s.durationMin }
      : initialTime ?? null;
    return {
      title: s.title.trim(),
      color: trainingColor,
      time,
      diaryType: "training",
      diaryGroup: s.diaryGroup,
      diarySub: hasSubs ? s.diarySub : undefined,
      distanceKm: s.distanceKm,
      paceSecPerKm: s.paceSecPerKm,
      sessionNote: s.sessionNote || undefined,
      activities: s.activities && s.activities.length ? s.activities : undefined,
    };
  };

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (showDetails) return;
      if (!ref.current) return;
      if (!ref.current.contains(e.target as Node)) {
        onCommit(buildValue());
      }
    };
    const onKey = (e: KeyboardEvent | globalThis.KeyboardEvent) => {
      if (showDetails) return;
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      } else if (e.key === "Enter" && !(e as globalThis.KeyboardEvent).shiftKey) {
        const t = (e as globalThis.KeyboardEvent).target as HTMLElement | null;
        if (t && t.tagName === "TEXTAREA") return;
        e.preventDefault();
        onCommit(buildValue());
      }
    };
    window.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey as (ev: globalThis.KeyboardEvent) => void);
    return () => {
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey as (ev: globalThis.KeyboardEvent) => void);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onCommit, onClose, showDetails]);

  // Positioning — same heuristic as before.
  const POPOVER_W = 280;
  const POPOVER_H = (hasSubs ? 240 : 210) + (showNote ? 180 : 0);
  const margin = 8;
  let top = anchor.top;
  let left = anchor.right + margin;
  if (left + POPOVER_W > window.innerWidth) {
    left = Math.max(margin, anchor.left - POPOVER_W - margin);
  }
  if (top + POPOVER_H > window.innerHeight) {
    top = Math.max(margin, window.innerHeight - POPOVER_H - margin);
  }

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
              active={showNote}
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
                onClick={() => onCommit(buildValue(), { delete: true })}
              >
                <Trash2 className="h-4 w-4" strokeWidth={2.25} />
              </HeaderIconBtn>
            )}
          </div>

          {/* Optional note panel directly under the header */}
          {showNote && (
            <NotePanel
              inline
              attached
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

          {/* Duration row — clock icon + auto-advance HH/MM inputs */}
          <SideRailRow accent={accent}>
            <Clock className="h-3.5 w-3.5 text-muted-foreground" strokeWidth={2} />
            <DurationInput
              durationMin={durationMin}
              onChange={setDurationMin}
            />
          </SideRailRow>

          {/* Group dropdown */}
          <SideRailRow accent={accent}>
            <select
              value={diaryGroup}
              onChange={(e) => {
                const next = e.target.value;
                setDiaryGroup(next);
                const ng = DIARY_GROUPS.find((g) => g.id === next);
                setDiarySub(ng?.children?.[0]?.id ?? "");
              }}
              className="block flex-1 bg-transparent py-1 pr-3 text-[12px] text-ink outline-none"
            >
              {DIARY_GROUPS.map((g) => (
                <option key={g.id} value={g.id}>{g.label}</option>
              ))}
            </select>
          </SideRailRow>

          {/* Subgroup dropdown */}
          {hasSubs && (
            <SideRailRow accent={accent}>
              <select
                value={diarySub}
                onChange={(e) => setDiarySub(e.target.value)}
                className="block flex-1 bg-transparent py-1 pr-3 text-[12px] text-ink outline-none"
              >
                {groupDef!.children!.map((c) => (
                  <option key={c.id} value={c.id}>{c.label}</option>
                ))}
              </select>
            </SideRailRow>
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
              color:
                v.diaryGroup === "endurance"
                  ? colorForActivity(v.diarySub)
                  : CAT_TRAINING_COLOR,
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

function SideRailRow({ accent, children }: { accent: string; children: React.ReactNode }) {
  return (
    <div className="relative border-t border-hairline">
      <span
        aria-hidden
        className="pointer-events-none absolute left-0 top-0 h-full w-[3px]"
        style={{ background: accent }}
      />
      <div className="flex items-center gap-2 pl-4 pr-2 py-1.5">
        {children}
      </div>
    </div>
  );
}

/**
 * DurationInput — two compact digit inputs with "h" / "min" suffixes that
 * auto-advance from hours to minutes, mirroring the calendar session modal.
 */
function DurationInput({
  durationMin,
  onChange,
}: {
  durationMin: number;
  onChange: (next: number) => void;
}) {
  const hRef = useRef<HTMLInputElement>(null);
  const mRef = useRef<HTMLInputElement>(null);
  const h = Math.floor(durationMin / 60);
  const m = durationMin % 60;

  const inputCls =
    "mono w-7 rounded-[3px] border border-input bg-background px-1 py-0.5 text-center text-[12px] font-semibold tabular-nums text-ink outline-none focus:border-primary [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none";

  const hasValue = durationMin > 0;

  return (
    <div className="flex flex-1 items-center gap-1">
      {!hasValue ? (
        <span
          onClick={() => requestAnimationFrame(() => { hRef.current?.focus(); hRef.current?.select(); })}
          className="cursor-text text-[12px] text-muted-foreground/60"
        >
          f.eks. 1h 30min
        </span>
      ) : null}
      <input
        ref={hRef}
        type="text"
        inputMode="numeric"
        maxLength={2}
        aria-label="Hours"
        value={hasValue ? String(h) : ""}
        placeholder="00"
        onChange={(e) => {
          const v = e.target.value.replace(/\D/g, "").slice(0, 2);
          const nh = v === "" ? 0 : Math.max(0, Number(v));
          onChange(nh * 60 + m);
          if (v.length === 2) {
            requestAnimationFrame(() => { mRef.current?.focus(); mRef.current?.select(); });
          }
        }}
        onKeyDown={(e) => {
          if (e.key === "h" || e.key === ":" || e.key === ".") {
            e.preventDefault();
            mRef.current?.focus();
            mRef.current?.select();
          } else if (e.key === "ArrowRight") {
            const el = e.currentTarget;
            if (el.selectionStart === el.value.length) {
              e.preventDefault();
              mRef.current?.focus();
              mRef.current?.select();
            }
          }
        }}
        className={hasValue ? inputCls : `${inputCls} hidden`}
      />
      {hasValue && <span className="text-[11px] font-semibold text-ink">h</span>}
      <input
        ref={mRef}
        type="text"
        inputMode="numeric"
        maxLength={2}
        aria-label="Minutes"
        value={hasValue ? String(m).padStart(2, "0") : ""}
        placeholder="00"
        onChange={(e) => {
          const v = e.target.value.replace(/\D/g, "").slice(0, 2);
          const nm = v === "" ? 0 : Math.max(0, Math.min(59, Number(v)));
          onChange(h * 60 + nm);
        }}
        onKeyDown={(e) => {
          if (e.key === "Backspace" && (e.currentTarget.value === "" || e.currentTarget.selectionStart === 0)) {
            e.preventDefault();
            hRef.current?.focus();
            hRef.current?.select();
          } else if (e.key === "ArrowLeft") {
            const el = e.currentTarget;
            if (el.selectionStart === 0) {
              e.preventDefault();
              hRef.current?.focus();
              hRef.current?.select();
            }
          }
        }}
        className={hasValue ? inputCls : `${inputCls} hidden`}
      />
      {hasValue && <span className="text-[11px] font-semibold text-ink">min</span>}
    </div>
  );
}

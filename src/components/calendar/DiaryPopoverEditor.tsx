/**
 * DiaryPopoverEditor — diary-mode replacement for the calendar PopoverEditor.
 *
 * Only two top-level types: Training | Note.
 * When Training is selected, a second dropdown picks Endurance / Strength / Stretch.
 * If that group has subchildren, a third dropdown appears.
 *
 * The header has an "edit" icon (pencil) on the LEFT (mirroring the clock on
 * the right). Clicking it opens a centered SessionDetailsModal with extended
 * fields and tabs (About / Map / Session note).
 */

import { useEffect, useRef, useState } from "react";
import { Pencil, Clock, Trash2 } from "lucide-react";
import type { CalendarEvent } from "./yearStore";
import { CAT_TRAINING_COLOR } from "./MonthGridType1";
import { SessionDetailsModal, type SessionDetailsValue } from "./SessionDetailsModal";

export type DiaryType = "training" | "note";

export const DIARY_GROUPS: { id: string; label: string; children?: { id: string; label: string }[] }[] = [
  {
    id: "endurance",
    label: "Endurance",
    children: [
      { id: "running", label: "Running" },
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

const NOTE_COLOR = "#9CA3AF"; // neutral grey for "Note"

function fmtMin(m: number): string {
  const h = Math.floor(m / 60);
  const mm = m % 60;
  return `${String(h).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
}

export interface DiaryPopoverValue {
  title: string;
  color: string | null;
  time: { startMin: number; endMin: number } | null;
  diaryType: DiaryType;
  diaryGroup?: string;
  diarySub?: string;
  /** Extended fields edited via Session Details. */
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
  /** Date represented by the popover — used to label note-mode session details. */
  date?: Date;
  /** Force a fixed type (no dropdown). */
  lockedType?: DiaryType;
  /** Note-only mode: just a "Write note" textarea + footer. No title, no dropdowns. */
  noteOnly?: boolean;
  /** Override the header label (default "Legg til økt" / "Rediger økt"). */
  headerLabel?: string;
  onClose: () => void;
  onCommit: (value: DiaryPopoverValue, opts?: { delete?: boolean }) => void;
}

export function DiaryPopoverEditor({
  initialEvent,
  isEdit,
  anchor,
  initialTime = null,
  date,
  lockedType,
  noteOnly = false,
  headerLabel,
  onClose,
  onCommit,
}: DiaryPopoverEditorProps) {
  const [title, setTitle] = useState(initialEvent?.title ?? "");
  const [diaryType, setDiaryType] = useState<DiaryType>(
    lockedType ?? (initialEvent?.diaryType as DiaryType) ?? "training",
  );
  const [diaryGroup, setDiaryGroup] = useState<string>(
    initialEvent?.diaryGroup ?? "endurance",
  );
  const [diarySub, setDiarySub] = useState<string>(
    initialEvent?.diarySub ?? "running",
  );
  const [time, setTime] = useState<{ startMin: number; endMin: number } | null>(initialTime);
  const [showDetails, setShowDetails] = useState(false);

  const [distanceKm, setDistanceKm] = useState<number | undefined>(initialEvent?.distanceKm);
  const [paceSecPerKm, setPaceSecPerKm] = useState<number | undefined>(initialEvent?.paceSecPerKm);
  const [sessionNote, setSessionNote] = useState<string>(initialEvent?.sessionNote ?? "");
  const [activities, setActivities] = useState<DiaryPopoverValue["activities"]>(
    initialEvent?.activities ?? [],
  );

  const ref = useRef<HTMLDivElement | null>(null);

  const groupDef = DIARY_GROUPS.find((g) => g.id === diaryGroup);
  const hasSubs = !!groupDef?.children?.length;

  // Refs for unmount-safe autosave
  const stateRef = useRef({ title, diaryType, diaryGroup, diarySub, time, distanceKm, paceSecPerKm, sessionNote, activities });
  useEffect(() => {
    stateRef.current = { title, diaryType, diaryGroup, diarySub, time, distanceKm, paceSecPerKm, sessionNote, activities };
  });

  const buildValue = (): DiaryPopoverValue => {
    const s = stateRef.current;
    const effectiveType: DiaryType = noteOnly ? "note" : s.diaryType;
    const fallbackTitle = noteOnly
      ? (s.sessionNote || "").trim().split(/\r?\n/)[0].slice(0, 80) || "Notat"
      : "";
    return {
      title: s.title.trim() || fallbackTitle,
      color: effectiveType === "training" ? CAT_TRAINING_COLOR : NOTE_COLOR,
      time: s.time,
      diaryType: effectiveType,
      diaryGroup: effectiveType === "training" ? s.diaryGroup : undefined,
      diarySub: effectiveType === "training" && hasSubs ? s.diarySub : undefined,
      distanceKm: s.distanceKm,
      paceSecPerKm: s.paceSecPerKm,
      sessionNote: s.sessionNote || undefined,
      activities: s.activities && s.activities.length ? s.activities : undefined,
    };
  };

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (showDetails) return; // modal handles its own dismissal
      if (!ref.current) return;
      if (!ref.current.contains(e.target as Node)) {
        onCommit(buildValue());
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (showDetails) return;
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      } else if (e.key === "Enter" && !e.shiftKey) {
        const t = e.target as HTMLElement | null;
        if (t && (t.tagName === "TEXTAREA")) return;
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
  }, [onCommit, onClose, showDetails]);

  const POPOVER_W = 280;
  const POPOVER_H = noteOnly ? 220 : diaryType === "training" ? (hasSubs ? 250 : 220) : 290;
  const margin = 8;
  let top = anchor.bottom + margin;
  let left = anchor.left;
  if (top + POPOVER_H > window.innerHeight) {
    top = Math.max(margin, anchor.top - POPOVER_H - margin);
  }
  if (left + POPOVER_W > window.innerWidth) {
    left = Math.max(margin, window.innerWidth - POPOVER_W - margin);
  }

  const accent = diaryType === "training" ? CAT_TRAINING_COLOR : NOTE_COLOR;

  return (
    <>
      <div
        ref={ref}
        data-role="popover"
        className="fixed z-50"
        style={{ top, left, width: POPOVER_W }}
      >
        <div className="relative overflow-hidden rounded-md border border-ink/15 bg-card shadow-lg">
          {/* Header */}
          <div className="flex items-center justify-between gap-2 border-b border-hairline px-2 py-1.5">
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                aria-label="Open session details"
                title="Session details"
                onClick={() => setShowDetails(true)}
                className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-secondary hover:text-ink"
              >
                <Pencil className="h-3.5 w-3.5" strokeWidth={2} />
              </button>
              <span className="text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
                {headerLabel ?? (isEdit ? "Rediger økt" : "Legg til økt")}
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              {!noteOnly && diaryType !== "note" && time && (
                <span className="mono text-[10.5px] tabular-nums text-ink/70">
                  {fmtMin(time.startMin)}–{fmtMin(time.endMin)}
                </span>
              )}
              {!noteOnly && diaryType !== "note" && (
                <span className="rounded-md p-1 text-muted-foreground/60">
                  <Clock className="h-3.5 w-3.5" strokeWidth={2} />
                </span>
              )}
            </div>
          </div>

          {/* Title — hidden in note-only mode */}
          {!noteOnly && (
            <input
              autoFocus
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={diaryType === "training" ? "f.eks. Intervaller 5×4min" : "Notat tittel"}
              className="block w-full bg-transparent px-3 py-2.5 text-[13px] text-ink outline-none placeholder:text-muted-foreground/60"
            />
          )}

          {/* Note text field — appears in note-only mode or when Note type is selected */}
          {(noteOnly || diaryType === "note") && (
            <div className="relative border-t border-hairline">
              <span
                aria-hidden
                className="pointer-events-none absolute left-0 top-0 h-full w-[3px]"
                style={{ background: accent }}
              />
              <textarea
                autoFocus={noteOnly}
                value={sessionNote}
                onChange={(e) => setSessionNote(e.target.value)}
                placeholder="Skriv notat…"
                className="block w-full resize-none bg-transparent pl-4 pr-3 py-2 text-[12px] text-ink outline-none placeholder:text-muted-foreground/60"
                rows={5}
              />
            </div>
          )}

          {/* Group dropdown */}
          {diaryType === "training" && (
            <DropdownRow accent={accent}>
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
            </DropdownRow>
          )}

          {/* Subgroup dropdown */}
          {diaryType === "training" && hasSubs && (
            <DropdownRow accent={accent}>
              <select
                value={diarySub}
                onChange={(e) => setDiarySub(e.target.value)}
                className="block flex-1 bg-transparent py-1 pr-3 text-[12px] text-ink outline-none"
              >
                {groupDef!.children!.map((c) => (
                  <option key={c.id} value={c.id}>{c.label}</option>
                ))}
              </select>
            </DropdownRow>
          )}

          {/* Footer */}
          <div className="flex items-center justify-between border-t border-hairline px-3 py-2 text-[11px] text-muted-foreground">
            {isEdit ? (
              <button
                type="button"
                aria-label="Slett"
                title="Slett"
                onClick={() => onCommit(buildValue(), { delete: true })}
                className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            ) : (
              <span className="mono tabular-nums">⏎ for å lagre</span>
            )}
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
                }
              : null
          }
          value={{
            title,
            diaryType,
            diaryGroup,
            diarySub,
            time,
            distanceKm,
            paceSecPerKm,
            sessionNote,
            activities: activities ?? [],
          }}
          onChange={(v: SessionDetailsValue) => {
            setTitle(v.title);
            setDiaryType(v.diaryType);
            if (v.diaryGroup) setDiaryGroup(v.diaryGroup);
            if (v.diarySub) setDiarySub(v.diarySub);
            setTime(v.time);
            setDistanceKm(v.distanceKm);
            setPaceSecPerKm(v.paceSecPerKm);
            setSessionNote(v.sessionNote ?? "");
            setActivities(v.activities ?? []);
          }}
          onClose={() => setShowDetails(false)}
          onSave={(v) => {
            // sync local state from modal then commit
            const merged: DiaryPopoverValue = {
              title: v.title.trim(),
              color: v.diaryType === "training" ? CAT_TRAINING_COLOR : NOTE_COLOR,
              time: v.time,
              diaryType: v.diaryType,
              diaryGroup: v.diaryType === "training" ? v.diaryGroup : undefined,
              diarySub: v.diaryType === "training" && DIARY_GROUPS.find((g) => g.id === v.diaryGroup)?.children?.length ? v.diarySub : undefined,
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

function DropdownRow({ accent, children }: { accent: string; children: React.ReactNode }) {
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

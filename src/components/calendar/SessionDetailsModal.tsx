/**
 * SessionDetailsModal — large centered editor for a Diary session.
 *
 * Header: "Session details" + Save (disabled when no changes) + close (×).
 * Top fields (bold labels): Session name, Start of session, Session duration (read-only, derived).
 * Tabs: About, Map, Session note.
 *
 * Strava-synced sessions lock start/duration/distance/pace and inform the user
 * with a calm inline message; activity type can still be changed (with a calm
 * informational note that the override is preserved on future syncs).
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Plus, MapPin, NotebookPen, Info, Paperclip, Pencil, Check, Lock } from "lucide-react";
import { DIARY_GROUPS, type DiaryType } from "./DiaryPopoverEditor";
import { useLibrarySetting, diaryAutosyncKey } from "@/lib/library-settings";
import { StravaMapPanel } from "./StravaMapPanel";
import { colorForActivity } from "@/lib/activity-colors";

export interface SessionDetailsValue {
  title: string;
  diaryType: DiaryType;
  diaryGroup?: string;
  diarySub?: string;
  time: { startMin: number; endMin: number } | null;
  distanceKm?: number;
  paceSecPerKm?: number;
  sessionNote?: string;
  activities: {
    type: string;
    durationMin?: number;
    distanceKm?: number;
    /** Set true when user manually overrides a Strava-imported activity type. */
    activityTypeOverridden?: boolean;
  }[];
}

type Tab = "about" | "map" | "note";

function fmtHM(m: number): string {
  const h = Math.floor(m / 60);
  const mm = m % 60;
  if (h && mm) return `${h}h ${mm}m`;
  if (h) return `${h}h`;
  return `${mm}m`;
}

function fmtClock(m: number): string {
  const h = Math.floor(m / 60);
  const mm = m % 60;
  return `${String(h).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
}

function parseHHMM(s: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(s.trim());
  if (!m) return null;
  return parseInt(m[1], 10) * 60 + parseInt(m[2], 10);
}

/** Find the parent group id for an activity sub-type id. */
function groupIdForActivity(type: string): string {
  for (const g of DIARY_GROUPS) {
    if (g.id === type) return g.id;
    if (g.children?.some((c) => c.id === type)) return g.id;
  }
  return "endurance";
}

export function SessionDetailsModal({
  isEdit,
  value,
  onChange,
  onClose,
  onSave,
  strava,
  date,
  readOnly = false,
}: {
  isEdit: boolean;
  value: SessionDetailsValue;
  onChange: (v: SessionDetailsValue) => void;
  onClose: () => void;
  onSave: (v: SessionDetailsValue) => void;
  strava?: {
    polyline?: string | null;
    elevationGainM?: number | null;
    distanceKm?: number | null;
    stravaActivityId?: number | null;
  } | null;
  date?: Date;
  readOnly?: boolean;
}) {
  const [tab, setTab] = useState<Tab>("about");
  const [autosync] = useLibrarySetting<boolean>(diaryAutosyncKey("global"), false);
  const isNote = value.diaryType === "note";
  const isStravaSynced = !!strava?.polyline || !!strava?.stravaActivityId;
  const locked = readOnly;

  // Snapshot initial value for dirty detection.
  const initialRef = useRef<string>(JSON.stringify(value));
  const isDirty = useMemo(
    () => JSON.stringify(value) !== initialRef.current,
    [value],
  );
  const [confirmClose, setConfirmClose] = useState(false);

  const requestClose = () => {
    if (isDirty && !readOnly) setConfirmClose(true);
    else onClose();
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        requestClose();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isDirty, readOnly]);

  const set = <K extends keyof SessionDetailsValue>(k: K, v: SessionDetailsValue[K]) =>
    onChange({ ...value, [k]: v });

  const headerTitle = isNote
    ? `Note ${date ? `${date.getDate()}.${date.getMonth() + 1}.${date.getFullYear()}` : ""}`.trim()
    : "Session details";

  const startStr = value.time ? fmtClock(value.time.startMin) : "";
  const durationMin = value.time ? Math.max(0, value.time.endMin - value.time.startMin) : 0;

  const saveDisabled = !isDirty || readOnly;

  return (
    <AnimatePresence>
      <motion.div
        className="fixed inset-0 z-[60] flex items-center justify-center bg-ink/40 backdrop-blur-sm"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={requestClose}
      >
        <motion.div
          className="relative flex max-h-[88vh] w-full max-w-3xl flex-col overflow-hidden rounded-xl border border-hairline bg-card shadow-2xl"
          initial={{ scale: 0.96, opacity: 0, y: 8 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          exit={{ scale: 0.97, opacity: 0 }}
          transition={{ duration: 0.18, ease: [0.2, 0, 0, 1] }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between gap-3 border-b border-hairline px-4 py-3">
            <h2 className="text-sm font-semibold text-ink">{headerTitle}</h2>
            <div className="flex items-center gap-2">
              {!readOnly && (
                <button
                  type="button"
                  onClick={() => onSave(value)}
                  disabled={saveDisabled}
                  className={`rounded-md px-3 py-1.5 text-xs font-medium transition-opacity ${
                    saveDisabled
                      ? "bg-secondary text-muted-foreground/70 cursor-not-allowed"
                      : "bg-primary text-primary-foreground hover:opacity-90"
                  }`}
                >
                  {autosync ? "Autosync" : isEdit ? "Save" : "Add"}
                </button>
              )}
              <button
                type="button"
                aria-label="Close"
                onClick={requestClose}
                className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-secondary hover:text-ink"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>

          {isNote ? (
            <NoteBody
              title={value.title}
              note={value.sessionNote ?? ""}
              onTitle={(t) => !readOnly && set("title", t)}
              onNote={(n) => !readOnly && set("sessionNote", n)}
              readOnly={readOnly}
            />
          ) : (
            <>
              {/* Top fields — three trustful cards: Session name / Start of session / Session duration */}
              <div className="grid grid-cols-1 gap-3 border-b border-hairline px-4 py-4 md:grid-cols-3">
                <FieldStack label="Session name">
                  <div className="rounded-lg border border-hairline bg-background px-3 py-2.5">
                    <input
                      value={value.title}
                      onChange={(e) => set("title", e.target.value)}
                      placeholder="Morning run"
                      disabled={locked}
                      className="block w-full bg-transparent text-sm text-ink outline-none disabled:cursor-not-allowed"
                    />
                  </div>
                </FieldStack>

                <FieldStack
                  label="Start of session"
                  locked={isStravaSynced || readOnly}
                  lockedMessage={
                    readOnly
                      ? "Read-only view."
                      : "Start time is set by Strava and can't be edited here."
                  }
                >
                  <div className="rounded-lg border border-hairline bg-background px-3 py-2.5">
                    <input
                      value={startStr}
                      onChange={(e) => {
                        if (isStravaSynced || readOnly) return;
                        const sm = parseHHMM(e.target.value);
                        if (sm == null) return;
                        const dur = durationMin || 60;
                        set("time", { startMin: sm, endMin: sm + dur });
                      }}
                      placeholder="07:00"
                      readOnly={isStravaSynced || readOnly}
                      className="mono block w-full bg-transparent text-sm tabular-nums text-ink outline-none"
                    />
                  </div>
                </FieldStack>

                <FieldStack label="Session duration" locked={isStravaSynced} lockedMessage="Duration is set by Strava and can't be edited here.">
                  <div className="rounded-lg border border-hairline bg-background px-3 py-2.5">
                    <div className="text-sm tabular-nums text-ink">
                      {durationMin > 0 ? fmtHM(durationMin) : "—"}
                    </div>
                  </div>
                </FieldStack>
              </div>

              {/* Tabs header */}
              <div className="flex items-end gap-1 border-b border-hairline px-4">
                {(
                  [
                    { id: "about", label: "About", Icon: Info },
                    { id: "map", label: "Map", Icon: MapPin },
                    { id: "note", label: "Session note", Icon: NotebookPen },
                  ] as const
                ).map((t) => {
                  const active = tab === t.id;
                  return (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => setTab(t.id)}
                      className={`-mb-px inline-flex items-center gap-1.5 border-b-2 px-3 py-2.5 text-sm font-medium transition-colors ${
                        active
                          ? "border-primary text-ink"
                          : "border-transparent text-muted-foreground hover:text-ink"
                      }`}
                    >
                      <t.Icon className="h-3.5 w-3.5 opacity-70" strokeWidth={2.25} />
                      <span>{t.label}</span>
                    </button>
                  );
                })}
              </div>

              {/* Tab body */}
              <div className="min-h-[280px] flex-1 overflow-y-auto px-4 py-4">
                {tab === "about" && (
                  <AboutTab
                    activities={value.activities}
                    onChange={(a) => set("activities", a)}
                    isStravaSynced={isStravaSynced}
                    readOnly={readOnly}
                  />
                )}
                {tab === "map" && (
                  strava?.polyline ? (
                    <StravaMapPanel
                      polyline={strava.polyline}
                      elevationGainM={strava.elevationGainM ?? null}
                      distanceKm={strava.distanceKm ?? value.distanceKm ?? null}
                      stravaActivityId={strava.stravaActivityId ?? null}
                    />
                  ) : (
                    <div className="grid place-items-center rounded-lg border border-dashed border-hairline bg-muted/20 py-16 text-center">
                      <div className="space-y-1">
                        <MapPin className="mx-auto h-6 w-6 text-muted-foreground/60" />
                        <p className="text-sm text-ink">Map syncs automatically with Strava</p>
                        <p className="text-xs text-muted-foreground">
                          Connect Strava in the Connectors settings to see your activity route here.
                        </p>
                      </div>
                    </div>
                  )
                )}
                {tab === "note" && (
                  <NoteTabBody
                    title={value.title}
                    note={value.sessionNote ?? ""}
                    onNote={(n) => !readOnly && set("sessionNote", n)}
                    readOnly={readOnly}
                  />
                )}
              </div>
            </>
          )}

          {/* Confirm-close overlay */}
          <AnimatePresence>
            {confirmClose && (
              <motion.div
                className="absolute inset-0 z-10 flex flex-col bg-card/95 backdrop-blur-sm"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
              >
                <div className="flex flex-1 flex-col items-center justify-center px-6 text-center">
                  <p className="text-sm font-medium text-ink">You have unsaved changes.</p>
                  <p className="mt-1 max-w-sm text-xs text-muted-foreground">
                    Would you like to save them before closing, or discard them?
                  </p>
                </div>
                <div className="flex items-center justify-between border-t border-hairline px-4 py-3">
                  <button
                    type="button"
                    onClick={() => {
                      setConfirmClose(false);
                      onClose();
                    }}
                    className="rounded-md border border-hairline px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                  >
                    Discard changes
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setConfirmClose(false);
                      onSave(value);
                    }}
                    className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:opacity-90"
                  >
                    Save changes
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

/* ----------------------------- Field helpers ----------------------------- */

function BoldField({
  label,
  children,
  className,
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <label className={`flex flex-col gap-1.5 rounded-lg border border-hairline bg-background px-3 py-2.5 ${className ?? ""}`}>
      <span className="text-sm font-semibold text-ink">{label}</span>
      {children}
    </label>
  );
}

function LockableField({
  label,
  locked,
  lockedMessage,
  children,
}: {
  label: string;
  locked: boolean;
  lockedMessage: string;
  children: React.ReactNode;
}) {
  const [showMsg, setShowMsg] = useState(false);
  useEffect(() => {
    if (!showMsg) return;
    const t = setTimeout(() => setShowMsg(false), 3500);
    return () => clearTimeout(t);
  }, [showMsg]);

  return (
    <div
      className={`relative flex flex-col gap-1.5 rounded-lg border border-hairline bg-background px-3 py-2.5 ${
        locked ? "cursor-not-allowed" : ""
      }`}
      onClick={() => locked && setShowMsg(true)}
    >
      <span className="flex items-center gap-1 text-sm font-semibold text-ink">
        {label}
        {locked && <Lock className="h-3 w-3 text-muted-foreground/70" />}
      </span>
      <div className={locked ? "pointer-events-none opacity-80" : ""}>{children}</div>
      <AnimatePresence>
        {showMsg && (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="absolute left-0 right-0 top-full z-10 mt-1 rounded-md border border-hairline bg-popover px-2.5 py-1.5 text-[11px] text-muted-foreground shadow-md"
          >
            {lockedMessage}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/* -------------------------------- About tab ------------------------------ */

function AboutTab({
  activities,
  onChange,
  isStravaSynced,
  readOnly,
}: {
  activities: SessionDetailsValue["activities"];
  onChange: (a: SessionDetailsValue["activities"]) => void;
  isStravaSynced: boolean;
  readOnly: boolean;
}) {
  const list = activities ?? [];
  const update = (idx: number, patch: Partial<SessionDetailsValue["activities"][number]>) => {
    onChange(list.map((a, i) => (i === idx ? { ...a, ...patch } : a)));
  };
  const add = () => {
    const first = DIARY_GROUPS[0];
    const sub = first.children?.[0]?.id ?? first.id;
    onChange([...list, { type: sub }]);
  };
  const remove = (idx: number) => onChange(list.filter((_, i) => i !== idx));

  return (
    <div className="space-y-2">
      {list.length === 0 && (
        <p className="text-xs text-muted-foreground">No activities yet. Add one below.</p>
      )}
      {list.map((a, idx) => (
        <ActivityRow
          key={idx}
          activity={a}
          // Lock the first activity's metrics when this is a Strava-synced session.
          stravaLocked={isStravaSynced && idx === 0}
          readOnly={readOnly}
          onChange={(patch) => update(idx, patch)}
          onRemove={() => remove(idx)}
        />
      ))}
      {!readOnly && (
        <button
          type="button"
          onClick={add}
          className="inline-flex items-center gap-1.5 rounded-md border border-dashed border-hairline px-3 py-2 text-xs text-muted-foreground hover:bg-secondary hover:text-ink"
        >
          <Plus className="h-3.5 w-3.5" />
          Add activity
        </button>
      )}
    </div>
  );
}

function ActivityRow({
  activity,
  stravaLocked,
  readOnly,
  onChange,
  onRemove,
}: {
  activity: SessionDetailsValue["activities"][number];
  stravaLocked: boolean;
  readOnly: boolean;
  onChange: (patch: Partial<SessionDetailsValue["activities"][number]>) => void;
  onRemove: () => void;
}) {
  const groupId = groupIdForActivity(activity.type);
  const isEndurance = groupId === "endurance";
  const color = colorForActivity(activity.type);

  // Original activity type (when synced): the first time the user changes the type
  // we capture the previous value so we can show the calm informational message.
  const [originalType] = useState<string>(activity.type);
  const [showTypeMsg, setShowTypeMsg] = useState(false);
  const [showLockedMsg, setShowLockedMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!showLockedMsg) return;
    const t = setTimeout(() => setShowLockedMsg(null), 3500);
    return () => clearTimeout(t);
  }, [showLockedMsg]);

  const [editDuration, setEditDuration] = useState(false);

  const dur = activity.durationMin ?? 0;
  const durH = Math.floor(dur / 60);
  const durM = dur % 60;

  const lockedClick = (msg: string) => {
    if (stravaLocked || readOnly) {
      setShowLockedMsg(msg);
      return true;
    }
    return false;
  };

  return (
    <div
      className="relative rounded-lg border border-hairline bg-background"
      style={{
        borderLeft: `4px solid ${color}`,
      }}
    >
      <div className="flex flex-wrap items-center gap-2 px-3 py-2">
        {/* Color chip + type select */}
        <span
          className="inline-block h-3.5 w-3.5 shrink-0 rounded-sm"
          style={{ background: color }}
          aria-hidden
        />
        <select
          value={activity.type}
          disabled={readOnly}
          onChange={(e) => {
            const next = e.target.value;
            const overridden = stravaLocked && next !== originalType;
            onChange({ type: next, activityTypeOverridden: overridden || activity.activityTypeOverridden });
            if (stravaLocked && next !== originalType) setShowTypeMsg(true);
          }}
          className="bg-transparent text-sm font-medium text-ink outline-none disabled:cursor-not-allowed"
        >
          {DIARY_GROUPS.map((g) =>
            g.children && g.children.length ? (
              <optgroup key={g.id} label={g.label}>
                {g.children.map((c) => (
                  <option key={c.id} value={c.id}>{c.label}</option>
                ))}
              </optgroup>
            ) : (
              <option key={g.id} value={g.id}>{g.label}</option>
            ),
          )}
        </select>

        {/* Duration */}
        <div
          className="ml-2 flex items-center gap-1 rounded-md border border-hairline bg-card px-2 py-1"
          onClick={() => lockedClick("Duration is set by Strava and can't be edited here.")}
        >
          {!editDuration ? (
            <>
              {!stravaLocked && !readOnly && (
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); setEditDuration(true); }}
                  className="text-muted-foreground hover:text-ink"
                  aria-label="Edit duration"
                >
                  <Pencil className="h-3 w-3" />
                </button>
              )}
              <span className="mono w-16 text-center text-sm tabular-nums text-ink">
                {dur > 0 ? fmtHM(dur) : "—"}
              </span>
            </>
          ) : (
            <>
              <input
                type="number"
                min={0}
                value={durH || ""}
                disabled={stravaLocked || readOnly}
                onChange={(e) => {
                  const h = e.target.value === "" ? 0 : Math.max(0, Number(e.target.value));
                  onChange({ durationMin: h * 60 + durM });
                }}
                onClick={(e) => e.stopPropagation()}
                className="mono w-10 bg-transparent text-center text-sm tabular-nums text-ink outline-none"
                placeholder="h"
              />
              <span className="text-xs text-muted-foreground">h</span>
              <input
                type="number"
                min={0}
                max={59}
                value={durM || ""}
                disabled={stravaLocked || readOnly}
                onChange={(e) => {
                  const m = e.target.value === "" ? 0 : Math.max(0, Math.min(59, Number(e.target.value)));
                  onChange({ durationMin: durH * 60 + m });
                }}
                onClick={(e) => e.stopPropagation()}
                className="mono w-10 bg-transparent text-center text-sm tabular-nums text-ink outline-none"
                placeholder="m"
              />
              <span className="text-xs text-muted-foreground">m</span>
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); setEditDuration(false); }}
                className="ml-1 text-muted-foreground hover:text-ink"
                aria-label="Done"
              >
                <Check className="h-3.5 w-3.5" />
              </button>
            </>
          )}
        </div>

        {isEndurance && (
          <>
            {/* Distance */}
            <label
              className="flex items-center gap-1 rounded-md border border-hairline bg-card px-2 py-1 text-xs text-muted-foreground"
              onClick={() => lockedClick("Distance is set by Strava and can't be edited here.")}
            >
              <span>distance</span>
              <input
                type="number"
                step="0.1"
                value={activity.distanceKm ?? ""}
                disabled={stravaLocked || readOnly}
                onChange={(e) =>
                  onChange({ distanceKm: e.target.value === "" ? undefined : Number(e.target.value) })
                }
                onClick={(e) => e.stopPropagation()}
                placeholder="km"
                className="mono w-16 bg-transparent text-sm tabular-nums text-ink outline-none"
              />
              <span>km</span>
            </label>

            {/* Pace (auto) */}
            <PaceTag
              durationMin={activity.durationMin}
              distanceKm={activity.distanceKm}
            />
          </>
        )}

        {!readOnly && (
          <button
            type="button"
            onClick={onRemove}
            className="ml-auto rounded-md p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
            aria-label="Remove"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      <AnimatePresence>
        {showTypeMsg && (
          <motion.p
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="border-t border-hairline px-3 py-2 text-[11px] leading-snug text-muted-foreground"
          >
            Strava said “{originalType}”, but you’re free to change the activity type here.
            We’ll keep your choice on future Strava syncs.
          </motion.p>
        )}
        {showLockedMsg && (
          <motion.p
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="border-t border-hairline px-3 py-2 text-[11px] leading-snug text-muted-foreground"
          >
            {showLockedMsg}
          </motion.p>
        )}
      </AnimatePresence>
    </div>
  );
}

function PaceTag({ durationMin, distanceKm }: { durationMin?: number; distanceKm?: number }) {
  const pace = useMemo(() => {
    if (!durationMin || !distanceKm || distanceKm <= 0) return null;
    const secPerKm = Math.round((durationMin * 60) / distanceKm);
    const m = Math.floor(secPerKm / 60);
    const s = secPerKm % 60;
    return `${m}:${String(s).padStart(2, "0")}`;
  }, [durationMin, distanceKm]);

  return (
    <span className="inline-flex items-center gap-1 rounded-md border border-hairline bg-card px-2 py-1 text-xs text-muted-foreground">
      <span>pace</span>
      <span className="mono tabular-nums text-ink">{pace ?? "—"}</span>
      <span>min/km</span>
    </span>
  );
}

/* -------------------------------- Note tab ------------------------------- */

function NoteTabBody({
  title,
  note,
  onNote,
  readOnly,
}: {
  title: string;
  note: string;
  onNote: (n: string) => void;
  readOnly: boolean;
}) {
  return (
    <section className="rounded-lg border border-hairline bg-card shadow-sm">
      {/* Note-page style toolbar: attach left, title centered, no other icons */}
      <div className="flex items-center gap-2 border-b border-hairline px-4 py-2">
        <button
          type="button"
          title="Attach documents"
          disabled={readOnly}
          className="inline-flex items-center gap-1.5 rounded-md px-2 py-1.5 text-xs text-muted-foreground transition hover:bg-secondary hover:text-ink disabled:opacity-50"
        >
          <Paperclip className="h-4 w-4" />
          <span>Attach</span>
        </button>
        <span className="ml-3 flex-1 truncate text-[12px] uppercase tracking-[0.18em] text-muted-foreground">
          {title || "Session note"}
        </span>
      </div>
      <div className="p-4">
        <textarea
          value={note}
          onChange={(e) => onNote(e.target.value)}
          placeholder="Write your session notes…"
          readOnly={readOnly}
          className="block min-h-[260px] w-full resize-y rounded-md border border-hairline bg-background px-3 py-2 text-sm text-ink outline-none placeholder:text-muted-foreground/60 focus:border-primary"
        />
      </div>
    </section>
  );
}

function NoteBody({
  title,
  note,
  onTitle,
  onNote,
  readOnly,
}: {
  title: string;
  note: string;
  onTitle: (v: string) => void;
  onNote: (v: string) => void;
  readOnly: boolean;
}) {
  return (
    <div className="flex-1 overflow-y-auto px-4 py-4">
      <section className="rounded-lg border border-hairline bg-card shadow-sm">
        <div className="flex items-center gap-2 border-b border-hairline px-4 py-2">
          <button
            type="button"
            title="Attach documents"
            disabled={readOnly}
            className="inline-flex items-center gap-1.5 rounded-md px-2 py-1.5 text-xs text-muted-foreground transition hover:bg-secondary hover:text-ink disabled:opacity-50"
          >
            <Paperclip className="h-4 w-4" />
            <span>Attach</span>
          </button>
          <input
            value={title}
            onChange={(e) => onTitle(e.target.value)}
            readOnly={readOnly}
            placeholder="Note title"
            className="ml-3 flex-1 bg-transparent text-[12px] uppercase tracking-[0.18em] text-muted-foreground outline-none placeholder:text-muted-foreground/50"
          />
        </div>
        <div className="mx-auto my-6 flex min-h-[420px] w-full max-w-2xl flex-col rounded-md border border-hairline bg-background p-8 shadow-inner">
          <textarea
            value={note}
            onChange={(e) => onNote(e.target.value)}
            readOnly={readOnly}
            placeholder="Write your note here…"
            className="flex-1 resize-none border-0 bg-transparent text-base leading-relaxed text-ink outline-none placeholder:text-muted-foreground/60"
          />
        </div>
      </section>
    </div>
  );
}

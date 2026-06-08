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
import { createPortal } from "react-dom";
import { motion, AnimatePresence, useAnimationControls } from "framer-motion";
import { X, Plus, MapPin, StickyNote, Info, Paperclip, Pencil, Check, Lock, Activity, Trash2 } from "lucide-react";
import { DIARY_GROUPS, type DiaryType } from "./DiaryPopoverEditor";
import { DIARY_ACTIVITIES } from "./DiaryEditFields";
import { useDiarySessionNote } from "@/hooks/useDiarySessionNote";
import { useLibrarySetting, diaryAutosyncKey } from "@/lib/library-settings";
// Strava map panel removed along with the Strava integration.
import { colorForActivity } from "@/lib/activity-colors";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { ConfirmDeleteSessionDialog } from "./ConfirmDeleteSessionDialog";

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
  onDelete,
  onAccept,
  isCoachPending = false,
  suppressUnsavedPrompt = false,
  strava,
  date,
  readOnly = false,
  memberId,
  viewerRole,
  eventId,
}: {
  isEdit: boolean;
  value: SessionDetailsValue;
  onChange: (v: SessionDetailsValue) => void;
  onClose: () => void;
  onSave: (v: SessionDetailsValue) => void;
  onDelete?: () => void;
  /**
   * When set, render an "Accept" button (in place of Save) for coach-pending
   * sessions on the owner's own calendar. The handler receives the current
   * draft value so any in-progress edits can be persisted alongside the
   * accept action.
   */
  onAccept?: (v: SessionDetailsValue) => void;
  isCoachPending?: boolean;
  suppressUnsavedPrompt?: boolean;
  strava?: {
    polyline?: string | null;
    elevationGainM?: number | null;
    distanceKm?: number | null;
    stravaActivityId?: number | null;
  } | null;
  date?: Date;
  readOnly?: boolean;
  memberId?: string;
  viewerRole?: import("@/hooks/useViewerRole").ViewerRole;
  eventId?: string;
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
  const [confirmDelete, setConfirmDelete] = useState(false);
  const pulseControls = useAnimationControls();

  const [confirmCancel, setConfirmCancel] = useState(false);

  const tabScrollRef = useRef<HTMLDivElement | null>(null);
  const [tabScrolling, setTabScrolling] = useState(false);
  const [tabScrollThumb, setTabScrollThumb] = useState({ top: 0, height: 40 });
  const tabScrollTimer = useRef<number | null>(null);
  useEffect(() => {
    return () => {
      if (tabScrollTimer.current) window.clearTimeout(tabScrollTimer.current);
    };
  }, []);

  const requestClose = () => {
    if (isDirty && !readOnly && !suppressUnsavedPrompt) setConfirmCancel(true);
    else onClose();
  };

  const submitPrimaryAction = () => {
    if (readOnly) return;
    if (onAccept && isCoachPending) {
      onAccept(value);
      return;
    }
    if (!saveDisabled) onSave(value);
  };

  const startStr = value.time ? fmtClock(value.time.startMin) : "";
  const durationMin = value.time ? Math.max(0, value.time.endMin - value.time.startMin) : 0;

  const saveDisabled = !isDirty || readOnly;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target?.tagName === "TEXTAREA") return;
      if (e.key === "Escape") {
        e.preventDefault();
        requestClose();
      } else if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        submitPrimaryAction();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isDirty, readOnly, saveDisabled, onAccept, isCoachPending, value]);

  const set = <K extends keyof SessionDetailsValue>(k: K, v: SessionDetailsValue[K]) =>
    onChange({ ...value, [k]: v });

  const headerTitle = isNote
    ? `Note ${date ? `${date.getDate()}.${date.getMonth() + 1}.${date.getFullYear()}` : ""}`.trim()
    : "Session details";

  return createPortal(
    <AnimatePresence>
      <motion.div
        className="fixed inset-0 z-[200] flex items-center justify-center bg-ink/40 backdrop-blur-sm"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        // IMPORTANT: React portals propagate events through the React tree, so
        // the click that opened this modal (e.g. the "Detaljer" button in
        // SessionHoverMenu) would bubble up into this backdrop and close it
        // immediately. Use mousedown + target===currentTarget to only react to
        // a fresh press that starts on the backdrop itself.
        onMouseDown={(e) => {
          if (e.target === e.currentTarget) requestClose();
        }}
      >
        <motion.div
          initial={{ scale: 0.96, opacity: 0, y: 8 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          exit={{ scale: 0.97, opacity: 0 }}
          transition={{ duration: 0.18, ease: [0.2, 0, 0, 1] }}
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
          className="w-full max-w-3xl px-4"
        >

        <motion.div
          className="relative flex max-h-[88vh] w-full flex-col overflow-hidden rounded-xl border border-hairline bg-card shadow-2xl"
          animate={pulseControls}
        >
          {/* Header */}
          <div className="flex items-center justify-between gap-3 border-b border-hairline bg-muted/40 px-4 py-3">
            <div className="flex items-center gap-2">
              {!readOnly ? (
                <button
                  type="button"
                  aria-label="Delete session"
                  onClick={() => setConfirmDelete(true)}
                  className="inline-flex items-center justify-center rounded-md bg-secondary p-1.5 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              ) : (
                <h2 className="text-sm font-semibold text-ink">{headerTitle}</h2>
              )}
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={requestClose}
                className="whitespace-nowrap rounded-md bg-secondary px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-secondary/80 hover:text-ink"
              >
                Cancel
              </button>
              {!readOnly && onAccept && isCoachPending && (
                <button
                  type="button"
                  onClick={submitPrimaryAction}
                  className="whitespace-nowrap rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:opacity-90"
                >
                  Accept
                </button>
              )}
              {!readOnly && !(onAccept && isCoachPending) && (
                <button
                  type="button"
                  onClick={submitPrimaryAction}
                  disabled={saveDisabled}
                  className={`whitespace-nowrap rounded-md px-3 py-1.5 text-xs font-medium ${
                    saveDisabled
                      ? "bg-secondary text-muted-foreground/70 cursor-not-allowed"
                      : "bg-primary text-primary-foreground hover:opacity-90"
                  }`}
                >
                  {autosync ? "Autosync" : isEdit ? "Save" : "Add"}
                </button>
              )}
            </div>
          </div>

          <ConfirmDeleteSessionDialog
            open={confirmDelete}
            onOpenChange={setConfirmDelete}
            onConfirm={() => {
              setConfirmDelete(false);
              if (onDelete) onDelete();
              else onClose();
            }}
          />

          <AlertDialog open={confirmCancel} onOpenChange={setConfirmCancel}>
            <AlertDialogContent className="z-[300]">
              <AlertDialogHeader>
                <AlertDialogTitle>Discard unsaved changes?</AlertDialogTitle>
                <AlertDialogDescription>
                  You have unsaved changes. If you cancel now, your edits to this session will be lost.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Keep editing</AlertDialogCancel>
                <AlertDialogAction
                  onClick={() => {
                    setConfirmCancel(false);
                    onClose();
                  }}
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                >
                  Discard changes
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>

          <div className="flex flex-1 flex-col overflow-hidden">
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
              <div className="grid grid-cols-1 gap-3 px-4 py-4 md:grid-cols-3">
                <FieldStack label="Session name">
                  <div className="rounded-md border border-hairline bg-background px-3 py-2">
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
                  <div className="rounded-md border border-hairline bg-background px-3 py-2">
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
                  <div className="rounded-md border border-hairline bg-background px-3 py-2">
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
                    { id: "about", label: "Activity", Icon: Activity },
                    { id: "map", label: "Map", Icon: MapPin },
                    { id: "note", label: "Note", Icon: StickyNote },
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
              <div className="relative flex-none" style={{ height: "min(520px, calc(88vh - 220px))" }}>
                <div
                  ref={tabScrollRef}
                  className="h-full overflow-y-auto px-4 py-4 [&::-webkit-scrollbar]:hidden"
                  style={{ scrollbarWidth: "none", msOverflowStyle: "none" } as React.CSSProperties}
                  onScroll={(e) => {
                    const el = e.currentTarget;
                    if (el.scrollHeight <= el.clientHeight) return;
                    const ratio = el.clientHeight / el.scrollHeight;
                    setTabScrollThumb({
                      top: (el.scrollTop / el.scrollHeight) * el.clientHeight,
                      height: Math.max(32, ratio * el.clientHeight),
                    });
                    setTabScrolling(true);
                    if (tabScrollTimer.current) window.clearTimeout(tabScrollTimer.current);
                    tabScrollTimer.current = window.setTimeout(() => setTabScrolling(false), 2000);
                  }}
                >
                {tab === "about" && (
                  <AboutTab
                    activities={value.activities}
                    onChange={(a) => {
                      const totalDur = (a ?? []).reduce(
                        (sum, it) => sum + (it.durationMin ?? 0),
                        0,
                      );
                      const startMin = value.time?.startMin ?? 0;
                      const nextTime =
                        totalDur > 0
                          ? { startMin, endMin: startMin + totalDur }
                          : value.time;
                      onChange({ ...value, activities: a, time: nextTime });
                    }}
                    isStravaSynced={isStravaSynced}
                    readOnly={readOnly}
                  />
                )}
                {tab === "map" && (
                  <div className="grid place-items-center rounded-lg border border-dashed border-hairline bg-muted/20 py-16 text-center">
                    <div className="space-y-1">
                      <MapPin className="mx-auto h-6 w-6 text-muted-foreground/60" />
                      <p className="text-sm text-ink">No map for this session</p>
                      <p className="text-xs text-muted-foreground">
                        Activity maps are not available on this platform.
                      </p>
                    </div>
                  </div>
                )}
                {tab === "note" && (
                  readOnly && memberId && eventId && viewerRole && viewerRole !== "owner" ? (
                    <SplitNoteTabBody
                      title={value.title}
                      ownerNote={value.sessionNote ?? ""}
                      eventId={eventId}
                      memberId={memberId}
                      viewerRole={viewerRole}
                    />
                  ) : (
                    <NoteTabBody
                      title={value.title}
                      note={value.sessionNote ?? ""}
                      onNote={(n) => !readOnly && set("sessionNote", n)}
                      readOnly={readOnly}
                    />
                  )
                )}
                </div>
                <div
                  aria-hidden
                  className="pointer-events-none absolute right-0 top-0 bottom-0 w-[6px]"
                >
                  <div
                    className="absolute right-[1px] w-[4px] rounded-full bg-muted-foreground/35"
                    style={{
                      opacity: tabScrolling ? 1 : 0,
                      top: tabScrollThumb.top,
                      height: tabScrollThumb.height,
                      transition: "opacity 300ms ease, top 80ms linear, height 80ms linear",
                    }}
                  />
                </div>
              </div>
            </>
          )}
          </div>

        </motion.div>
        </motion.div>
      </motion.div>
    </AnimatePresence>,
    document.body,
  );
}

/* ----------------------------- Field helpers ----------------------------- */

function FieldStack({
  label,
  locked = false,
  lockedMessage,
  children,
}: {
  label: string;
  locked?: boolean;
  lockedMessage?: string;
  children: React.ReactNode;
}) {
  const [showMsg, setShowMsg] = useState(false);
  useEffect(() => {
    if (!showMsg) return;
    const t = setTimeout(() => setShowMsg(false), 3500);
    return () => clearTimeout(t);
  }, [showMsg]);

  return (
    <div className="relative flex flex-col gap-1.5">
      <span className="flex items-center gap-1 text-xs font-semibold text-ink">
        {label}
        {locked && <Lock className="h-3 w-3 text-muted-foreground/70" />}
      </span>
      <div
        className={locked ? "cursor-not-allowed" : ""}
        onClick={() => locked && lockedMessage && setShowMsg(true)}
      >
        <div className={locked ? "pointer-events-none opacity-80" : ""}>{children}</div>
      </div>
      <AnimatePresence>
        {showMsg && lockedMessage && (
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
  const [autoEditIdx, setAutoEditIdx] = useState<number | null>(null);
  const update = (idx: number, patch: Partial<SessionDetailsValue["activities"][number]>) => {
    onChange(list.map((a, i) => (i === idx ? { ...a, ...patch } : a)));
  };
  const add = () => {
    const first = DIARY_ACTIVITIES[0];
    const sub = first.subId || first.groupId;
    setAutoEditIdx(list.length);
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
          startEditing={autoEditIdx === idx}
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
  startEditing,
  onChange,
  onRemove,
}: {
  activity: SessionDetailsValue["activities"][number];
  stravaLocked: boolean;
  readOnly: boolean;
  startEditing?: boolean;
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



  const [editing, setEditing] = useState(!!startEditing && !readOnly && !stravaLocked);
  const dur = activity.durationMin ?? 0;
  const durH = Math.floor(dur / 60);
  const durM = dur % 60;

  const hRef = useRef<HTMLInputElement>(null);
  const mRef = useRef<HTMLInputElement>(null);
  const kmRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) {
      // focus hour input on entering edit mode
      requestAnimationFrame(() => {
        hRef.current?.focus();
        hRef.current?.select();
      });
    }
  }, [editing]);

  const handleArrowNav = (
    e: React.KeyboardEvent<HTMLInputElement>,
    prev: React.RefObject<HTMLInputElement | null> | null,
    next: React.RefObject<HTMLInputElement | null> | null,
  ) => {
    if (e.key === "ArrowRight" && next?.current) {
      e.preventDefault();
      next.current.focus();
      next.current.select();
    } else if (e.key === "ArrowLeft" && prev?.current) {
      e.preventDefault();
      prev.current.focus();
      prev.current.select();
    }
  };

  const pace = useMemo(() => {
    if (!activity.durationMin || !activity.distanceKm || activity.distanceKm <= 0) return null;
    const secPerKm = Math.round((activity.durationMin * 60) / activity.distanceKm);
    const m = Math.floor(secPerKm / 60);
    const s = secPerKm % 60;
    return `${m}:${String(s).padStart(2, "0")}`;
  }, [activity.durationMin, activity.distanceKm]);

  const handleEditClick = () => {
    if (readOnly) return;
    if (stravaLocked) {
      setShowLockedMsg("This activity is synced from Strava and can't be edited here.");
      return;
    }
    setEditing((v) => !v);
  };

  // Excel-ish input look: thin border, very subtle radius, tabular numbers, bold.
  // [&::-webkit-inner-spin-button]:appearance-none removes spinner arrows.
  const inputCls =
    "mono rounded-[3px] border border-input bg-background px-1.5 py-0.5 text-sm font-bold tabular-nums text-ink outline-none focus:border-primary disabled:cursor-not-allowed [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none";

  return (
    <div
      className="relative rounded-[6px] border border-hairline bg-background"
      style={{ borderLeft: `4px solid ${color}` }}
    >
      <div className="flex flex-wrap items-center gap-3 px-3 py-2">
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
          {DIARY_ACTIVITIES.map((a) => {
            const v = a.subId || a.groupId;
            return (
              <option key={v} value={v}>{a.label}</option>
            );
          })}
        </select>

        <div className="ml-auto flex items-center gap-8">
          {/* Duration — fixed slot to keep position stable between view/edit */}
          <div className="flex w-[120px] items-center justify-end gap-1">
            {!editing ? (
              <span className="text-sm font-bold tabular-nums text-ink">
                {dur > 0 ? fmtHM(dur) : "—"}
              </span>
            ) : (
              <>
                <input
                  ref={hRef}
                  type="text"
                  inputMode="numeric"
                  value={durH || ""}
                  disabled={stravaLocked || readOnly}
                  onChange={(e) => {
                    const v = e.target.value.replace(/\D/g, "");
                    const h = v === "" ? 0 : Math.max(0, Number(v));
                    onChange({ durationMin: h * 60 + durM });
                  }}
                  onKeyDown={(e) => handleArrowNav(e, null, mRef)}
                  className={`${inputCls} w-12 text-center`}
                />
                <span className="text-xs font-bold text-ink">h</span>
                <input
                  ref={mRef}
                  type="text"
                  inputMode="numeric"
                  value={durM || ""}
                  disabled={stravaLocked || readOnly}
                  onChange={(e) => {
                    const v = e.target.value.replace(/\D/g, "");
                    const m = v === "" ? 0 : Math.max(0, Math.min(59, Number(v)));
                    onChange({ durationMin: durH * 60 + m });
                  }}
                  onKeyDown={(e) => handleArrowNav(e, hRef, isEndurance ? kmRef : null)}
                  className={`${inputCls} w-12 text-center`}
                />
                <span className="text-xs font-bold text-ink">m</span>
              </>
            )}
          </div>

          {isEndurance && (
            <>
              {/* Distance — fixed slot */}
              <div className="flex w-[110px] items-center justify-end gap-1">
                {!editing ? (
                  <span className="text-sm font-bold tabular-nums text-ink">
                    {activity.distanceKm != null
                      ? `${activity.distanceKm.toFixed(1)} km`
                      : "—"}
                  </span>
                ) : (
                  <>
                    <input
                      ref={kmRef}
                      type="text"
                      inputMode="decimal"
                      value={activity.distanceKm ?? ""}
                      disabled={stravaLocked || readOnly}
                      onChange={(e) => {
                        const v = e.target.value.replace(/[^\d.]/g, "");
                        onChange({ distanceKm: v === "" ? undefined : Number(v) });
                      }}
                      onKeyDown={(e) => handleArrowNav(e, mRef, null)}
                      className={`${inputCls} w-20 text-right`}
                    />
                    <span className="text-xs font-bold text-ink">km</span>
                  </>
                )}
              </div>

              {/* Pace (auto, read-only) — fixed slot */}
              <div className="flex w-[90px] items-center justify-end">
                <span className="text-sm font-bold tabular-nums text-ink">
                  {pace ? `${pace} /km` : "—"}
                </span>
              </div>
            </>
          )}
          {!isEndurance && (
            <>
              <div className="w-[110px]" />
              <div className="w-[90px]" />
            </>
          )}

          {!readOnly && (
            <button
              type="button"
              onClick={handleEditClick}
              className="rounded-md p-1 text-muted-foreground hover:bg-secondary hover:text-ink"
              aria-label={editing ? "Done editing" : "Edit activity"}
              title={editing ? "Done" : "Edit"}
            >
              {editing ? <Check className="h-3.5 w-3.5" /> : <Pencil className="h-3.5 w-3.5" />}
            </button>
          )}

          {!readOnly && (
            <button
              type="button"
              onClick={onRemove}
              className="rounded-md p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
              aria-label="Remove"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
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

/* --------------------------- Split note tab body ---------------------------
 * Leader / active-follower view: owner note on the left (read-only),
 * viewer's editable leader note (with attach button) on the right.
 * Each panel has its own scrollbar.
 * --------------------------------------------------------------------------*/
function SplitNoteTabBody({
  title,
  ownerNote,
  eventId,
  memberId,
  viewerRole,
}: {
  title: string;
  ownerNote: string;
  eventId: string;
  memberId: string;
  viewerRole: import("@/hooks/useViewerRole").ViewerRole;
}) {
  const leader = useDiarySessionNote(eventId, memberId, viewerRole);
  const [draft, setDraft] = useState(leader.viewerNote);
  useEffect(() => { setDraft(leader.viewerNote); }, [leader.viewerNote]);

  const headerLabel = (title || "Session note").toUpperCase();

  return (
    <div className="grid h-full grid-cols-2 gap-3">
      <section className="flex min-h-0 flex-col rounded-lg border border-hairline bg-card shadow-sm">
        <div className="flex items-center gap-2 border-b border-hairline px-4 py-2">
          <span className="flex-1 truncate text-[12px] uppercase tracking-[0.18em] text-muted-foreground">
            {headerLabel}
          </span>
        </div>
        <div className="flex-1 overflow-y-auto p-4">
          {ownerNote.trim() ? (
            <p className="whitespace-pre-wrap text-sm text-ink">{ownerNote}</p>
          ) : (
            <p className="text-xs text-muted-foreground">No note from the athlete.</p>
          )}
        </div>
      </section>

      <section className="flex min-h-0 flex-col rounded-lg border border-hairline bg-card shadow-sm">
        <div className="flex items-center gap-2 border-b border-hairline px-4 py-2">
          <button
            type="button"
            title="Attach documents"
            disabled={!leader.canEdit}
            className="inline-flex items-center gap-1.5 rounded-md px-2 py-1.5 text-xs text-muted-foreground transition hover:bg-secondary hover:text-ink disabled:opacity-50"
          >
            <Paperclip className="h-4 w-4" />
            <span>Attach</span>
          </button>
          <span className="ml-3 flex-1 truncate text-[12px] uppercase tracking-[0.18em] text-muted-foreground">
            Your note
          </span>
        </div>
        <div className="flex-1 overflow-y-auto p-4">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={() => { if (draft !== leader.viewerNote) void leader.saveViewerNote(draft); }}
            placeholder="Write your note…"
            readOnly={!leader.canEdit}
            className="block min-h-[260px] w-full resize-y rounded-md border border-hairline bg-background px-3 py-2 text-sm text-ink outline-none placeholder:text-muted-foreground/60 focus:border-primary"
          />
        </div>
      </section>
    </div>
  );
}

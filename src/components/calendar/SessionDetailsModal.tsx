/**
 * SessionDetailsModal — large centered editor for a Diary session.
 *
 * Header: "Session details" + Save (or "Autosync") + close (×).
 * Fields: name, duration, distance, pace.
 * Tabs: About (activity types list), Map (Strava placeholder), Session note.
 */

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Plus, MapPin, NotebookPen, Info, Paperclip } from "lucide-react";
import { DIARY_GROUPS, type DiaryType } from "./DiaryPopoverEditor";
import { useLibrarySetting } from "@/lib/library-settings";
import { diaryAutosyncKey } from "@/lib/library-settings";

export interface SessionDetailsValue {
  title: string;
  diaryType: DiaryType;
  diaryGroup?: string;
  diarySub?: string;
  time: { startMin: number; endMin: number } | null;
  distanceKm?: number;
  paceSecPerKm?: number;
  sessionNote?: string;
  activities: { type: string; durationMin?: number; distanceKm?: number }[];
}

type Tab = "about" | "map" | "note";

function fmtMin(m: number): string {
  const h = Math.floor(m / 60);
  const mm = m % 60;
  return `${String(h).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
}

function parseHHMM(s: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(s.trim());
  if (!m) return null;
  return parseInt(m[1], 10) * 60 + parseInt(m[2], 10);
}

export function SessionDetailsModal({
  isEdit,
  value,
  onChange,
  onClose,
  onSave,
}: {
  isEdit: boolean;
  value: SessionDetailsValue;
  onChange: (v: SessionDetailsValue) => void;
  onClose: () => void;
  onSave: (v: SessionDetailsValue) => void;
}) {
  const [tab, setTab] = useState<Tab>("about");
  const [autosync] = useLibrarySetting<boolean>(diaryAutosyncKey("global"), false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const set = <K extends keyof SessionDetailsValue>(k: K, v: SessionDetailsValue[K]) =>
    onChange({ ...value, [k]: v });

  const startStr = value.time ? fmtMin(value.time.startMin) : "";
  const endStr = value.time ? fmtMin(value.time.endMin) : "";

  return (
    <AnimatePresence>
      <motion.div
        className="fixed inset-0 z-[60] flex items-center justify-center bg-ink/40 backdrop-blur-sm"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
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
            <h2 className="text-sm font-semibold text-ink">Session details</h2>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => onSave(value)}
                className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:opacity-90"
              >
                {autosync ? "Autosync" : isEdit ? "Save" : "Add"}
              </button>
              <button
                type="button"
                aria-label="Close"
                onClick={onClose}
                className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-secondary hover:text-ink"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>

          {/* Top fields */}
          <div className="grid grid-cols-1 gap-3 border-b border-hairline px-4 py-4 md:grid-cols-4">
            <Field label="Session name" className="md:col-span-2">
              <input
                value={value.title}
                onChange={(e) => set("title", e.target.value)}
                placeholder="Morning run"
                className="block w-full bg-transparent text-sm text-ink outline-none"
              />
            </Field>
            <Field label="Duration">
              <div className="flex items-center gap-1">
                <input
                  value={startStr}
                  onChange={(e) => {
                    const sm = parseHHMM(e.target.value);
                    if (sm == null) return;
                    const em = value.time?.endMin ?? sm + 60;
                    set("time", { startMin: sm, endMin: Math.max(em, sm + 5) });
                  }}
                  placeholder="07:00"
                  className="mono block w-16 bg-transparent text-sm tabular-nums text-ink outline-none"
                />
                <span className="text-xs text-muted-foreground">–</span>
                <input
                  value={endStr}
                  onChange={(e) => {
                    const em = parseHHMM(e.target.value);
                    if (em == null) return;
                    const sm = value.time?.startMin ?? Math.max(0, em - 60);
                    set("time", { startMin: sm, endMin: em });
                  }}
                  placeholder="08:00"
                  className="mono block w-16 bg-transparent text-sm tabular-nums text-ink outline-none"
                />
              </div>
            </Field>
            <Field label="Distance (km)">
              <input
                type="number"
                step="0.1"
                value={value.distanceKm ?? ""}
                onChange={(e) => set("distanceKm", e.target.value === "" ? undefined : Number(e.target.value))}
                placeholder="—"
                className="block w-full bg-transparent text-sm text-ink outline-none"
              />
            </Field>
            <Field label="Pace (min/km)">
              <input
                value={
                  value.paceSecPerKm
                    ? `${Math.floor(value.paceSecPerKm / 60)}:${String(value.paceSecPerKm % 60).padStart(2, "0")}`
                    : ""
                }
                onChange={(e) => {
                  const m = /^(\d{1,2}):(\d{2})$/.exec(e.target.value.trim());
                  if (!m) {
                    if (e.target.value === "") set("paceSecPerKm", undefined);
                    return;
                  }
                  set("paceSecPerKm", parseInt(m[1], 10) * 60 + parseInt(m[2], 10));
                }}
                placeholder="5:30"
                className="mono block w-full bg-transparent text-sm tabular-nums text-ink outline-none"
              />
            </Field>
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
              />
            )}
            {tab === "map" && (
              <div className="grid place-items-center rounded-lg border border-dashed border-hairline bg-muted/20 py-16 text-center">
                <div className="space-y-1">
                  <MapPin className="mx-auto h-6 w-6 text-muted-foreground/60" />
                  <p className="text-sm text-ink">Map syncs automatically with Strava</p>
                  <p className="text-xs text-muted-foreground">Coming soon — connect Strava in the Connectors settings.</p>
                </div>
              </div>
            )}
            {tab === "note" && (
              <div className="space-y-3">
                <textarea
                  value={value.sessionNote ?? ""}
                  onChange={(e) => set("sessionNote", e.target.value)}
                  placeholder="Write your session notes…"
                  className="block min-h-[220px] w-full resize-y rounded-md border border-hairline bg-background px-3 py-2 text-sm text-ink outline-none placeholder:text-muted-foreground/60 focus:border-primary"
                />
                <button
                  type="button"
                  className="inline-flex items-center gap-1.5 rounded-md border border-hairline px-2.5 py-1.5 text-xs text-muted-foreground hover:bg-secondary hover:text-ink"
                >
                  <Paperclip className="h-3.5 w-3.5" />
                  Upload file
                </button>
              </div>
            )}
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

function Field({
  label,
  children,
  className,
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <label className={`flex flex-col gap-1 rounded-lg border border-hairline px-3 py-2 ${className ?? ""}`}>
      <span className="mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
        {label}
      </span>
      {children}
    </label>
  );
}

function AboutTab({
  activities,
  onChange,
}: {
  activities: SessionDetailsValue["activities"];
  onChange: (a: SessionDetailsValue["activities"]) => void;
}) {
  const list = activities ?? [];
  const update = (idx: number, patch: Partial<{ type: string; durationMin?: number; distanceKm?: number }>) => {
    const next = list.map((a, i) => (i === idx ? { ...a, ...patch } : a));
    onChange(next);
  };
  const add = () => {
    const first = DIARY_GROUPS[0];
    const sub = first.children?.[0]?.id ?? first.id;
    onChange([...(list ?? []), { type: sub }]);
  };
  const remove = (idx: number) => onChange(list.filter((_, i) => i !== idx));

  return (
    <div className="space-y-2">
      {list.length === 0 && (
        <p className="text-xs text-muted-foreground">
          No activities yet. Add one below.
        </p>
      )}
      {list.map((a, idx) => (
        <div
          key={idx}
          className="flex flex-wrap items-center gap-2 rounded-lg border border-hairline bg-background px-3 py-2"
        >
          <select
            value={a.type}
            onChange={(e) => update(idx, { type: e.target.value })}
            className="bg-transparent text-sm text-ink outline-none"
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
          <span className="text-xs text-muted-foreground">duration</span>
          <input
            type="number"
            value={a.durationMin ?? ""}
            onChange={(e) => update(idx, { durationMin: e.target.value === "" ? undefined : Number(e.target.value) })}
            placeholder="min"
            className="w-20 bg-transparent text-sm text-ink outline-none"
          />
          <span className="text-xs text-muted-foreground">distance</span>
          <input
            type="number"
            step="0.1"
            value={a.distanceKm ?? ""}
            onChange={(e) => update(idx, { distanceKm: e.target.value === "" ? undefined : Number(e.target.value) })}
            placeholder="km"
            className="w-20 bg-transparent text-sm text-ink outline-none"
          />
          <button
            type="button"
            onClick={() => remove(idx)}
            className="ml-auto rounded-md p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
            aria-label="Remove"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={add}
        className="inline-flex items-center gap-1.5 rounded-md border border-dashed border-hairline px-3 py-2 text-xs text-muted-foreground hover:bg-secondary hover:text-ink"
      >
        <Plus className="h-3.5 w-3.5" />
        Add activity
      </button>
    </div>
  );
}

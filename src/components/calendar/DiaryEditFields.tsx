/**
 * DiaryEditFields — small reusable building blocks shared by the diary
 * popover editor and the diary hover-menu edit mode so both UIs render
 * identical duration / group / subgroup controls.
 */

import { useRef, useState, useEffect, forwardRef, useCallback, ChangeEvent, FocusEvent, KeyboardEvent as ReactKeyboardEvent } from "react";
import { Clock, ChevronDown } from "lucide-react";
import {
  ColorsPanel,
  DEFAULT_SESSION_COLOR,
  standardColorLabel,
} from "@/components/library/CategoryActionsMenu";

export type DiaryGroupDef = { id: string; label: string; children?: { id: string; label: string }[] };

export const DIARY_GROUPS: DiaryGroupDef[] = [
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

export function SideRailRow({
  accent,
  children,
  bare,
}: {
  accent: string;
  children: React.ReactNode;
  /** When true, skip the top hairline border (use when row sits below
   *  another container that already has a bottom border, e.g. the menu). */
  bare?: boolean;
}) {
  return (
    <div className={["relative", bare ? "" : "border-t border-hairline"].join(" ")}>
      <span
        aria-hidden
        className="pointer-events-none absolute left-0 top-0 h-full w-[3px]"
        style={{ background: accent }}
      />
      <div className="flex items-center gap-2 pl-4 pr-2 py-1.5">{children}</div>
    </div>
  );
}

export function DurationRow({
  accent,
  durationMin,
  onChange,
  allDay,
  onAllDayChange,
}: {
  accent: string;
  durationMin: number;
  onChange: (next: number) => void;
  allDay?: boolean;
  onAllDayChange?: (next: boolean) => void;
}) {
  const showSwitch = typeof onAllDayChange === "function";
  return (
    <div className={"relative border-t border-hairline"}>
      <span
        aria-hidden
        className="pointer-events-none absolute left-0 top-0 h-full w-[3px]"
        style={{ background: accent }}
      />
      <div className="flex items-center gap-2 pl-4 pr-4 py-1.5">
        <Clock className="h-3.5 w-3.5 text-muted-foreground" strokeWidth={2} />
        <DurationInput
          durationMin={allDay ? 0 : durationMin}
          onChange={onChange}
          muted={!!allDay}
          disabled={!!allDay}
        />
        {showSwitch && (
          <label className="ml-auto flex shrink-0 items-center gap-1.5 select-none cursor-pointer">
            <span className="text-[11px] text-ink/80">All day</span>
            <IOSSwitch checked={!!allDay} onChange={(v) => onAllDayChange?.(v)} />
          </label>
        )}
      </div>
    </div>
  );
}

export function IOSSwitch({
  checked,
  onChange,
  uncheckedClassName = "bg-[#E9E9EA]",
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  uncheckedClassName?: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={(e) => {
        e.stopPropagation();
        onChange(!checked);
      }}
      className={[
        "relative inline-flex h-[18px] w-[30px] shrink-0 items-center rounded-full transition-colors duration-200 ease-out",
        "shadow-[inset_0_0_0_0.5px_rgba(0,0,0,0.04)]",
        checked ? "bg-[#34C759]" : uncheckedClassName,
      ].join(" ")}
    >
      <span
        className={[
          "pointer-events-none inline-block h-[14px] w-[14px] rounded-full bg-white shadow-[0_1px_2px_rgba(0,0,0,0.25),0_1px_1px_rgba(0,0,0,0.15)] transition-transform duration-200 ease-out",
          checked ? "translate-x-[14px]" : "translate-x-[2px]",
        ].join(" ")}
      />
    </button>
  );
}

export function GroupSelectRow({
  accent,
  diaryGroup,
  onChange,
}: {
  accent: string;
  diaryGroup: string;
  onChange: (groupId: string, firstSubId: string) => void;
}) {
  return (
    <SideRailRow accent={accent}>
      <select
        value={diaryGroup}
        onChange={(e) => {
          const next = e.target.value;
          const ng = DIARY_GROUPS.find((g) => g.id === next);
          onChange(next, ng?.children?.[0]?.id ?? "");
        }}
        className="block flex-1 bg-transparent py-1 pr-3 text-[12px] text-ink outline-none"
      >
        {DIARY_GROUPS.map((g) => (
          <option key={g.id} value={g.id}>{g.label}</option>
        ))}
      </select>
    </SideRailRow>
  );
}

export function SubgroupSelectRow({
  accent,
  diaryGroup,
  diarySub,
  onChange,
}: {
  accent: string;
  diaryGroup: string;
  diarySub: string;
  onChange: (subId: string) => void;
}) {
  const groupDef = DIARY_GROUPS.find((g) => g.id === diaryGroup);
  if (!groupDef?.children?.length) return null;
  return (
    <SideRailRow accent={accent}>
      <select
        value={diarySub}
        onChange={(e) => onChange(e.target.value)}
        className="block flex-1 bg-transparent py-1 pr-3 text-[12px] text-ink outline-none"
      >
        {groupDef.children.map((c) => (
          <option key={c.id} value={c.id}>{c.label}</option>
        ))}
      </select>
    </SideRailRow>
  );
}

/**
 * Curated flat list of selectable activities shown in every diary
 * activity dropdown (new-session, hover-edit and details-modal) and
 * mirrored as the default tabs in the left-rail Activities section.
 *
 * Each entry maps to a legacy (groupId, subId) pair so existing data
 * keeps working without migration.
 */
export type DiaryActivityOption = {
  groupId: string;
  subId: string;
  label: string;
  /** Primary swatch used as the default tab color in the left rail. */
  color: string;
};
export const DIARY_ACTIVITIES: DiaryActivityOption[] = [
  { groupId: "endurance", subId: "running",  label: "Running",    color: "#ef4444" },
  { groupId: "endurance", subId: "cycling",  label: "Cycling",    color: "#f97316" },
  { groupId: "endurance", subId: "swimming", label: "Swimming",   color: "#eab308" },
  { groupId: "strength",  subId: "core",     label: "Core",       color: "#22c55e" },
  { groupId: "strength",  subId: "max",      label: "Lifting",    color: "#3b82f6" },
  { groupId: "stretch",   subId: "",         label: "Stretching", color: "#8b5cf6" },
];

/** Resolve a flat activity option from a single `type` id (subId or groupId). */
export function findActivityByType(type: string | null | undefined): DiaryActivityOption | undefined {
  const t = (type || "").toLowerCase();
  return DIARY_ACTIVITIES.find((a) => (a.subId || a.groupId) === t);
}

/**
 * Colour dropdown using the same named swatches as the three-dot menus.
 */
export function ColorSelectRow({
  accent,
  color,
  onChange,
}: {
  accent: string;
  color: string;
  onChange: (hex: string) => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const hex = color || DEFAULT_SESSION_COLOR;
  const label = standardColorLabel(hex);
  return (
    <SideRailRow accent={accent}>
      <div className="relative flex min-w-0 flex-1 items-center">
        <button
          type="button"
          aria-haspopup="listbox"
          aria-expanded={menuOpen}
          onClick={(e) => {
            e.stopPropagation();
            setMenuOpen((v) => !v);
          }}
          className="flex w-full cursor-pointer items-center bg-transparent py-1 pr-1 text-left text-[12px] text-ink outline-none"
        >
          <span
            aria-hidden
            className="mr-2 inline-block h-3.5 w-3.5 shrink-0 rounded-[3px] border border-black/15"
            style={{ background: hex }}
          />
          <span className="min-w-0 flex-1 truncate">{label}</span>
          <ChevronDown
            className="h-3.5 w-3.5 shrink-0 text-muted-foreground"
            strokeWidth={2}
            aria-hidden
          />
        </button>
        {menuOpen ? (
          <>
            <div
              className="fixed inset-0 z-40"
              aria-hidden
              onClick={() => setMenuOpen(false)}
            />
            <div
              role="listbox"
              className="absolute bottom-full left-0 right-0 z-50 mb-1 rounded-md border border-ink/15 bg-card p-1 shadow-lg"
            >
              <ColorsPanel
                currentColor={hex}
                onPick={(next) => {
                  onChange(next);
                  setMenuOpen(false);
                }}
              />
            </div>
          </>
        ) : null}
      </div>
    </SideRailRow>
  );
}

/**
 * Single combined activity dropdown — replaces the previous
 * GroupSelectRow + SubgroupSelectRow pair. Lists every leaf activity
 * across all diary groups in one flat select.
 */
export function ActivitySelectRow({
  accent,
  diaryGroup,
  diarySub,
  onChange,
  lockedLabel,
}: {
  accent: string;
  diaryGroup: string;
  diarySub: string;
  onChange: (groupId: string, subId: string) => void;
  /** When provided, the row is read-only: shows this label and the
   *  dropdown will not open (used for Strava-synced sessions). */
  lockedLabel?: string | null;
}) {
  const value = `${diaryGroup}:${diarySub}`;
  if (lockedLabel) {
    return (
      <SideRailRow accent={accent}>
        <div
          aria-disabled
          title="Activity is set by Strava and cannot be changed"
          onMouseDown={(e) => e.preventDefault()}
          onClick={(e) => { e.preventDefault(); e.stopPropagation(); }}
          className="block flex-1 cursor-default select-none bg-transparent py-1 pr-3 text-[12px] text-ink outline-none"
        >
          {lockedLabel}
        </div>
      </SideRailRow>
    );
  }
  return (
    <SideRailRow accent={accent}>
      <select
        value={value}
        onChange={(e) => {
          const [g, s = ""] = e.target.value.split(":");
          onChange(g, s);
        }}
        className="block flex-1 bg-transparent py-1 pr-3 text-[12px] text-ink outline-none"
      >
        {DIARY_ACTIVITIES.map((a) => (
          <option key={`${a.groupId}:${a.subId}`} value={`${a.groupId}:${a.subId}`}>
            {a.label}
          </option>
        ))}
      </select>
    </SideRailRow>
  );
}

/** Format a Strava sport_type (PascalCase) as a readable label, e.g.
 *  "TrailRun" → "Trail Run", "VirtualRide" → "Virtual Ride". */
export function prettyStravaSportName(sport: string | null | undefined): string {
  const s = (sport || "").trim();
  if (!s) return "";
  return s.replace(/([a-z])([A-Z])/g, "$1 $2");
}

export function DurationInput({
  durationMin,
  onChange,
  muted,
  disabled,
}: {
  durationMin: number;
  onChange: (next: number) => void;
  muted?: boolean;
  disabled?: boolean;
}) {
  const hRef = useRef<HTMLInputElement>(null);
  const mRef = useRef<HTMLInputElement>(null);
  const h = Math.floor(durationMin / 60);
  const m = durationMin % 60;

  const focusSibling = useCallback((from: 0 | 1, dir: -1 | 1) => {
    const next = Math.max(0, Math.min(1, from + dir));
    const el = next === 0 ? hRef.current : mRef.current;
    if (!el) return;
    requestAnimationFrame(() => {
      el.focus();
      el.select();
    });
  }, []);

  return (
    <div className="flex items-center gap-1 select-none" title="f.eks. 1h 30min">
      <DurCell
        ref={hRef}
        ariaLabel="Hours"
        value={h}
        max={99}
        muted={muted}
        disabled={disabled}
        onCommit={(nh) => onChange(nh * 60 + m)}
        onAutoAdvance={() => focusSibling(0, 1)}
        onArrowH={(d) => focusSibling(0, d)}
      />
      <span className={["text-[11px]", muted ? "text-ink/30" : "text-ink"].join(" ")}>h</span>
      <DurCell
        ref={mRef}
        ariaLabel="Minutes"
        value={m}
        max={59}
        muted={muted}
        disabled={disabled}
        onCommit={(nm) => onChange(h * 60 + nm)}
        onAutoAdvance={() => focusSibling(1, 1)}
        onArrowH={(d) => focusSibling(1, d)}
      />
      <span className={["text-[11px]", muted ? "text-ink/30" : "text-ink"].join(" ")}>min</span>
    </div>
  );
}

interface DurCellProps {
  value: number;
  max: number;
  ariaLabel: string;
  muted?: boolean;
  disabled?: boolean;
  onCommit: (n: number) => void;
  onAutoAdvance: () => void;
  onArrowH: (dir: -1 | 1) => void;
}

const twoDigit = (n: number) => String(n).padStart(2, "0");
const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));

const DurCell = forwardRef<HTMLInputElement, DurCellProps>(function DurCell(
  { value, max, ariaLabel, muted, disabled, onCommit, onAutoAdvance, onArrowH },
  ref,
) {
  const [text, setText] = useState(twoDigit(value));
  const [editing, setEditing] = useState(false);
  const textRef = useRef(text);
  useEffect(() => { textRef.current = text; }, [text]);
  useEffect(() => {
    if (!editing) {
      const next = twoDigit(value);
      setText(next);
      textRef.current = next;
    }
  }, [value, editing]);

  const firstDigitMax = Math.floor(max / 10);

  const commit = (raw: string) => {
    const digits = raw.replace(/\D/g, "");
    if (digits.length === 0) { setText(twoDigit(value)); return; }
    const n = clamp(parseInt(digits, 10), 0, max);
    setText(twoDigit(n));
    if (n !== value) onCommit(n);
  };

  const onChange = (e: ChangeEvent<HTMLInputElement>) => {
    if (disabled) return;
    let digits = e.target.value.replace(/\D/g, "");
    // Same as TimeWheelPicker: a keypress into an unselected 2-digit cell
    // appends a 3rd digit — start a fresh entry with the typed digit.
    if (digits.length > 2) {
      digits = digits.slice(-1);
    } else {
      digits = digits.slice(-2);
    }
    setText(digits);
    textRef.current = digits;
    if (digits.length === 1) {
      const d = parseInt(digits, 10);
      if (d > firstDigitMax) {
        const n = clamp(d, 0, max);
        const next = twoDigit(n);
        setText(next); textRef.current = next;
        if (n !== value) onCommit(n);
        onAutoAdvance();
      }
    } else if (digits.length === 2) {
      const n = clamp(parseInt(digits, 10), 0, max);
      const next = twoDigit(n);
      setText(next); textRef.current = next;
      if (n !== value) onCommit(n);
      onAutoAdvance();
    }
  };

  const onKeyDown = (e: ReactKeyboardEvent<HTMLInputElement>) => {
    if (disabled) return;
    if (e.key !== "Enter" && e.key !== "Escape") e.stopPropagation();
    if (e.key === "h" || e.key === ":" || e.key === "." || e.key === " ") {
      e.preventDefault();
      commit(text);
      onAutoAdvance();
      return;
    }
    if (e.key === "ArrowLeft") {
      const el = e.currentTarget;
      if (el.selectionStart === 0 && el.selectionEnd === 0) {
        e.preventDefault(); onArrowH(-1);
      }
      return;
    }
    if (e.key === "ArrowRight") {
      const el = e.currentTarget;
      if (el.selectionStart === el.value.length && el.selectionEnd === el.value.length) {
        e.preventDefault(); onArrowH(1);
      }
      return;
    }
    if (e.key === "Tab") {
      if (e.shiftKey) return;
      e.preventDefault(); onArrowH(1); return;
    }
    if (e.key === "Enter") {
      e.preventDefault();
      commit(text);
      (e.currentTarget as HTMLInputElement).blur();
    }
  };

  const onFocus = (e: FocusEvent<HTMLInputElement>) => {
    if (disabled) { e.currentTarget.blur(); return; }
    setEditing(true);
    e.currentTarget.select();
  };
  const onBlur = () => {
    setEditing(false);
    if (!disabled) commit(textRef.current);
  };

  return (
    <input
      ref={ref}
      type="text"
      inputMode="numeric"
      aria-label={ariaLabel}
      value={text}
      placeholder="00"
      readOnly={disabled}
      tabIndex={disabled ? -1 : 0}
      onChange={onChange}
      onKeyDown={onKeyDown}
      onFocus={onFocus}
      onBlur={onBlur}
      maxLength={2}
      className={[
        "mono w-[18px] bg-transparent p-0 text-center text-[12px] tabular-nums outline-none rounded-[3px] placeholder:text-ink/30",
        muted ? "text-ink/30 cursor-default" : "text-ink cursor-text caret-ink focus:bg-ink/5",
      ].join(" ")}
    />
  );
});



/**
 * DiaryEditFields — small reusable building blocks shared by the diary
 * popover editor and the diary hover-menu edit mode so both UIs render
 * identical duration / group / subgroup controls.
 */

import { useRef, useState, useEffect, forwardRef, useCallback, ChangeEvent, FocusEvent, KeyboardEvent as ReactKeyboardEvent } from "react";
import { Clock } from "lucide-react";

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
}: {
  accent: string;
  durationMin: number;
  onChange: (next: number) => void;
}) {
  return (
    <SideRailRow accent={accent}>
      <Clock className="h-3.5 w-3.5 text-muted-foreground" strokeWidth={2} />
      <DurationInput durationMin={durationMin} onChange={onChange} />
    </SideRailRow>
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

export function DurationInput({
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
    "mono w-[18px] bg-transparent p-0 text-center text-[12px] font-semibold tabular-nums text-ink outline-none cursor-text caret-ink focus:bg-ink/5 rounded-[3px] [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none";

  const hasValue = durationMin > 0;

  return (
    <div className="flex flex-1 items-center gap-1" title="f.eks. 1h 30min">
      <input
        ref={hRef}
        type="text"
        inputMode="numeric"
        maxLength={2}
        aria-label="Hours"
        value={hasValue ? String(h).padStart(2, "0") : ""}
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
        className={inputCls}
      />
      <span className="text-[11px] font-semibold text-ink">h</span>
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
        className={inputCls}
      />
      <span className="text-[11px] font-semibold text-ink">min</span>
    </div>
  );
}

/**
 * TimeWheelPicker — compact inline time-range editor.
 *
 *   [HH]:[MM] – [HH]:[MM]
 *
 * Each cell is a simple 2-digit text input. Click to place the caret,
 * double-click to select both digits, type to overwrite, ArrowUp/Down to
 * step, ArrowLeft/Right or Tab to move between cells. No scroll-wheel
 * behavior.
 *
 * Duration preservation (matches mobile session wheels):
 *   • Lowering "to" to ≤ previous "from" shifts "from" earlier by the
 *     same duration the range had before the edit.
 *   • Raising "from" to ≥ previous "to" shifts "to" later by that duration.
 */

import {
  ChangeEvent,
  FocusEvent,
  KeyboardEvent as ReactKeyboardEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

export interface TimeRange {
  startMin: number;
  endMin: number;
}

interface TimeWheelPickerProps {
  value: TimeRange;
  onChange: (next: TimeRange) => void;
  /** Minute step used when stepping with arrow keys. Defaults to 5. */
  minuteStep?: number;
  muted?: boolean;
  disabled?: boolean;
  /**
   * Multi-day sessions: from/to clocks live on different days, so 22:00→08:00
   * is valid and must not shift the other endpoint.
   */
  independentClocks?: boolean;
  /** From on the left, to on the right, dash centered. */
  split?: boolean;
}

const twoDigit = (n: number) => String(n).padStart(2, "0");
/** Inclusive day length — 24:00 is a valid end (stored as next-day 00:00). */
const DAY_MINUTES = 24 * 60;

export function TimeWheelPicker({
  value,
  onChange,
  minuteStep = 5,
  muted = false,
  disabled = false,
  independentClocks = false,
  split = false,
}: TimeWheelPickerProps) {
  const fromH = Math.floor(value.startMin / 60);
  const fromM = value.startMin % 60;
  const toH = Math.floor(value.endMin / 60);
  const toM = value.endMin % 60;
  const endAtMidnight = toH >= 24;

  const setFrom = (h: number, m: number) => {
    if (disabled) return;
    const prevFrom = value.startMin;
    const prevTo = value.endMin;
    const durationMins = prevTo - prevFrom;
    const newFrom = clamp(h, 0, 23) * 60 + clamp(m, 0, 59);

    if (independentClocks) {
      onChange({ startMin: newFrom, endMin: prevTo });
      return;
    }
    if (newFrom >= prevTo) {
      const newTo = Math.min(DAY_MINUTES, newFrom + durationMins);
      onChange({ startMin: newFrom, endMin: newTo });
    } else {
      onChange({ startMin: newFrom, endMin: prevTo });
    }
  };
  const setTo = (h: number, m: number) => {
    if (disabled) return;
    const prevFrom = value.startMin;
    const prevTo = value.endMin;
    const durationMins = prevTo - prevFrom;
    const newTo = h >= 24 ? DAY_MINUTES : clamp(h, 0, 23) * 60 + clamp(m, 0, 59);

    if (independentClocks) {
      onChange({ startMin: prevFrom, endMin: newTo });
      return;
    }
    if (newTo <= prevFrom) {
      const newFrom = Math.max(0, newTo - durationMins);
      onChange({ startMin: newFrom, endMin: newTo });
    } else {
      onChange({ startMin: prevFrom, endMin: newTo });
    }
  };

  const refs = [
    useRef<HTMLInputElement>(null),
    useRef<HTMLInputElement>(null),
    useRef<HTMLInputElement>(null),
    useRef<HTMLInputElement>(null),
  ];
  const focusSibling = useCallback((from: number, dir: -1 | 1) => {
    const next = Math.max(0, Math.min(3, from + dir));
    const el = refs[next].current;
    if (!el) return;
    // Focus after the committing cell's blur/commit paint so select() sticks
    // on minutes (otherwise the next keypress appends and auto-advances).
    requestAnimationFrame(() => {
      el.focus();
      el.select();
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fromGroup = (
    <div className="flex items-center">
      <Cell
        ref={refs[0]}
        ariaLabel="Fra time"
        value={fromH}
        max={23}
        step={1}
        muted={muted}
        disabled={disabled}
        onCommit={(h) => setFrom(h, fromM)}
        onAutoAdvance={() => focusSibling(0, 1)}
        onArrowH={(d) => focusSibling(0, d)}
      />
      <Sep muted={muted} />
      <Cell
        ref={refs[1]}
        ariaLabel="Fra minutt"
        value={fromM}
        max={59}
        step={minuteStep}
        muted={muted}
        disabled={disabled}
        onCommit={(m) => setFrom(fromH, m)}
        onAutoAdvance={() => focusSibling(1, 1)}
        onArrowH={(d) => focusSibling(1, d)}
      />
    </div>
  );
  const toGroup = (
    <div className="flex items-center">
      <Cell
        ref={refs[2]}
        ariaLabel="Til time"
        value={Math.min(24, toH)}
        max={24}
        step={1}
        muted={muted}
        disabled={disabled}
        onCommit={(h) => setTo(h, endAtMidnight ? 0 : toM)}
        onAutoAdvance={() => focusSibling(2, 1)}
        onArrowH={(d) => focusSibling(2, d)}
      />
      <Sep muted={muted} />
      <Cell
        ref={refs[3]}
        ariaLabel="Til minutt"
        value={endAtMidnight ? 0 : toM}
        max={endAtMidnight ? 0 : 59}
        step={minuteStep}
        muted={muted}
        disabled={disabled}
        onCommit={(m) => setTo(toH, m)}
        onAutoAdvance={() => focusSibling(3, 1)}
        onArrowH={(d) => focusSibling(3, d)}
      />
    </div>
  );
  const dash = (
    <span className={["text-[12px] font-medium", muted ? "text-ink/30" : "text-ink/60", split ? "" : "mx-1.5"].join(" ")}>
      –
    </span>
  );

  if (split) {
    return (
      <div className="grid w-full grid-cols-[1fr_auto_1fr] items-center select-none">
        <div className="justify-self-start">{fromGroup}</div>
        <div className="justify-self-center">{dash}</div>
        <div className="justify-self-end">{toGroup}</div>
      </div>
    );
  }

  return (
    <div className="flex items-center select-none">
      {fromGroup}
      {dash}
      {toGroup}
    </div>
  );
}

const Sep = ({ muted = false }: { muted?: boolean }) => (
  <span
    style={{ fontFamily: 'ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif' }}
    className={["text-[12px] font-medium", muted ? "text-ink/30" : "text-ink/60"].join(" ")}
  >:</span>
);

function clamp(n: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, n));
}

interface CellProps {
  value: number;
  max: number;
  step: number;
  ariaLabel: string;
  muted?: boolean;
  disabled?: boolean;
  onCommit: (n: number) => void;
  onAutoAdvance: () => void;
  onArrowH: (dir: -1 | 1) => void;
}

import { forwardRef } from "react";

const Cell = forwardRef<HTMLInputElement, CellProps>(function Cell(
  { value, max, step, ariaLabel, muted, disabled, onCommit, onAutoAdvance, onArrowH },
  ref,
) {
  const [text, setText] = useState(twoDigit(value));
  const [editing, setEditing] = useState(false);
  // Keep latest text in a ref so onBlur (which may fire synchronously right
  // after an auto-advance, before React has flushed the setText from
  // onChange) reads the up-to-date value instead of a stale closure.
  const textRef = useRef(text);
  useEffect(() => {
    textRef.current = text;
  }, [text]);

  // Sync external value when not actively editing.
  useEffect(() => {
    if (!editing) {
      const next = twoDigit(value);
      setText(next);
      textRef.current = next;
    }
  }, [value, editing]);

  const firstDigitMax = useMemo(() => Math.floor(max / 10), [max]);

  const commit = (raw: string) => {
    const digits = raw.replace(/\D/g, "");
    if (digits.length === 0) {
      setText(twoDigit(value));
      return;
    }
    const n = clamp(parseInt(digits, 10), 0, max);
    setText(twoDigit(n));
    if (n !== value) onCommit(n);
  };

  const onChange = (e: ChangeEvent<HTMLInputElement>) => {
    if (disabled) return;
    let digits = e.target.value.replace(/\D/g, "");
    // When the cell still shows two digits and selection was lost (common
    // after auto-advance into minutes), a single keypress appends and yields
    // 3 digits. Treat that as starting a new entry with the typed digit —
    // otherwise slice(-2) looks like a finished value and jumps right away.
    if (digits.length > 2) {
      digits = digits.slice(-1);
    } else {
      digits = digits.slice(-2);
    }
    setText(digits);
    textRef.current = digits;
    if (digits.length === 1) {
      const d = parseInt(digits, 10);
      // Hours max 23 → firstDigitMax 2 (3–9 complete). Minutes max 59 → 5 (6–9).
      if (d > firstDigitMax) {
        const n = clamp(d, 0, max);
        const next = twoDigit(n);
        setText(next);
        textRef.current = next;
        if (n !== value) onCommit(n);
        onAutoAdvance();
      }
    } else if (digits.length === 2) {
      // Two digits typed (e.g. "03"). Commit and auto-advance.
      const n = clamp(parseInt(digits, 10), 0, max);
      const next = twoDigit(n);
      setText(next);
      textRef.current = next;
      if (n !== value) onCommit(n);
      onAutoAdvance();
    }
  };

  const onKeyDown = (e: ReactKeyboardEvent<HTMLInputElement>) => {
    if (disabled) return;
    // Stop propagation for keys we handle internally (digits, arrows, tab),
    // but let Enter/Escape bubble so the surrounding popover can close.
    if (e.key !== "Enter" && e.key !== "Escape") e.stopPropagation();
    if (e.key === ":" || e.key === "." || e.key === " ") {
      e.preventDefault();
      commit(text);
      onAutoAdvance();
      return;
    }
    if (e.key === "ArrowUp" || e.key === "ArrowDown") {
      e.preventDefault();
      const dir = e.key === "ArrowUp" ? 1 : -1;
      const base = parseInt(text || "0", 10) || value;
      let next = base + dir * step;
      if (next < 0) next = max - ((-next - 1) % (max + 1));
      if (next > max) next = next % (max + 1);
      setText(twoDigit(next));
      if (next !== value) onCommit(next);
      return;
    }
    if (e.key === "ArrowLeft") {
      const el = e.currentTarget;
      if (el.selectionStart === 0 && el.selectionEnd === 0) {
        e.preventDefault();
        onArrowH(-1);
      }
      return;
    }
    if (e.key === "ArrowRight") {
      const el = e.currentTarget;
      if (
        el.selectionStart === el.value.length &&
        el.selectionEnd === el.value.length
      ) {
        e.preventDefault();
        onArrowH(1);
      }
      return;
    }
    if (e.key === "Tab") {
      if (e.shiftKey) return;
      e.preventDefault();
      onArrowH(1);
      return;
    }
    if (e.key === "Enter") {
      e.preventDefault();
      commit(text);
      (e.currentTarget as HTMLInputElement).blur();
    }
  };

  const onFocus = (e: FocusEvent<HTMLInputElement>) => {
    if (disabled) {
      e.currentTarget.blur();
      return;
    }
    setEditing(true);
    // Select both digits so typing replaces.
    e.currentTarget.select();
  };
  const onBlur = () => {
    setEditing(false);
    commit(textRef.current);
  };

  return (
    <input
      ref={ref}
      type="text"
      inputMode="numeric"
      aria-label={ariaLabel}
      value={text}
      readOnly={disabled}
      tabIndex={disabled ? -1 : 0}
      onChange={onChange}
      onKeyDown={onKeyDown}
      onFocus={onFocus}
      onBlur={onBlur}
      maxLength={2}
      style={{ fontFamily: 'ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif', fontVariantNumeric: 'tabular-nums lining-nums', fontFeatureSettings: '"zero" 0, "ss01" 0' }}
      className={[
        "w-[18px] bg-transparent p-0 text-center text-[12px] font-medium outline-none rounded-[3px]",
        muted ? "text-ink/30 cursor-default" : "text-ink cursor-text caret-ink focus:bg-ink/5",
      ].join(" ")}
    />
  );
});

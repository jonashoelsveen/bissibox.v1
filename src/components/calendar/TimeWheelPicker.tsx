/**
 * TimeWheelPicker — compact inline time-range picker that lives inside the
 * popover header WITHOUT changing its height.
 *
 *   [HH][MM] – [HH][MM]
 *
 * Each cell is a single-row scrollable wheel. The focused cell gets a thin
 * black outline ("smile" border). Keyboard:
 *   ← →   move focus between the four wheels
 *   ↑ ↓   step one value within the focused wheel
 * Pointer:
 *   wheel / trackpad scroll  → smoothly changes the focused value, snapping
 *   when motion stops. Tuned for sharp, responsive feel.
 *
 * Guardrail: when "from" moves past "to", "to" auto-bumps to from + 60 min.
 */

import {
  KeyboardEvent as ReactKeyboardEvent,
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
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
  /** Minute step for the minute wheels. Defaults to 5. */
  minuteStep?: number;
  /** Auto-focus the first wheel on mount. Defaults to true. */
  autoFocus?: boolean;
}

const ITEM_H = 18; // px — single visible row, matches the header text line-height

const HOURS = Array.from({ length: 24 }, (_, i) => i);

export function TimeWheelPicker({
  value,
  onChange,
  minuteStep = 5,
  autoFocus = true,
}: TimeWheelPickerProps) {
  const MINUTES = Array.from(
    { length: Math.floor(60 / minuteStep) },
    (_, i) => i * minuteStep,
  );

  const fromH = Math.floor(value.startMin / 60);
  const fromM = value.startMin % 60;
  const toH = Math.floor(value.endMin / 60);
  const toM = value.endMin % 60;

  const snap = (m: number) => {
    const idx = MINUTES.reduce(
      (best, mm, i) =>
        Math.abs(mm - m) < Math.abs(MINUTES[best] - m) ? i : best,
      0,
    );
    return MINUTES[idx];
  };

  const setFrom = (h: number, m: number) => {
    const start = h * 60 + m;
    let end = value.endMin;
    if (end <= start) end = Math.min(24 * 60 - minuteStep, start + 60);
    onChange({ startMin: start, endMin: end });
  };
  const setTo = (h: number, m: number) => {
    const end = h * 60 + m;
    if (end <= value.startMin) {
      const bumped = Math.min(24 * 60 - minuteStep, value.startMin + minuteStep);
      onChange({ startMin: value.startMin, endMin: bumped });
    } else {
      onChange({ startMin: value.startMin, endMin: end });
    }
  };

  // Refs for the 4 wheels, used to move focus left/right.
  const wheelRefs = [
    useRef<WheelHandle>(null),
    useRef<WheelHandle>(null),
    useRef<WheelHandle>(null),
    useRef<WheelHandle>(null),
  ];

  const focusSibling = useCallback(
    (from: number, dir: -1 | 1) => {
      const next = Math.max(0, Math.min(3, from + dir));
      wheelRefs[next].current?.focus();
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  useEffect(() => {
    if (autoFocus) {
      // Delay one frame so the popover layout settles first.
      const t = requestAnimationFrame(() => wheelRefs[0].current?.focus());
      return () => cancelAnimationFrame(t);
    }
  }, [autoFocus]);

  return (
    <div className="flex items-center justify-center gap-0.5 select-none">
      <Wheel
        ref={wheelRefs[0]}
        ariaLabel="Fra time"
        items={HOURS}
        value={fromH}
        format={twoDigit}
        onChange={(h) => setFrom(h, snap(fromM))}
        onArrowH={(d) => focusSibling(0, d)}
      />
      <Sep />
      <Wheel
        ref={wheelRefs[1]}
        ariaLabel="Fra minutt"
        items={MINUTES}
        value={snap(fromM)}
        format={twoDigit}
        onChange={(m) => setFrom(fromH, m)}
        onArrowH={(d) => focusSibling(1, d)}
      />
      <span className="mx-1.5 text-[12px] font-medium text-ink/60">–</span>
      <Wheel
        ref={wheelRefs[2]}
        ariaLabel="Til time"
        items={HOURS}
        value={toH}
        format={twoDigit}
        onChange={(h) => setTo(h, snap(toM))}
        onArrowH={(d) => focusSibling(2, d)}
      />
      <Sep />
      <Wheel
        ref={wheelRefs[3]}
        ariaLabel="Til minutt"
        items={MINUTES}
        value={snap(toM)}
        format={twoDigit}
        onChange={(m) => setTo(toH, m)}
        onArrowH={(d) => focusSibling(3, d)}
      />
    </div>
  );
}

const twoDigit = (n: number) => String(n).padStart(2, "0");
const Sep = () => (
  <span className="text-[12px] font-medium text-ink/60">:</span>
);

interface WheelHandle {
  focus: () => void;
}

interface WheelProps {
  items: number[];
  value: number;
  ariaLabel: string;
  format: (n: number) => string;
  onChange: (n: number) => void;
  onArrowH: (dir: -1 | 1) => void;
}

const Wheel = forwardRef<WheelHandle, WheelProps>(function Wheel(
  { items, value, ariaLabel, format, onChange, onArrowH },
  ref,
) {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const snapTimer = useRef<number | null>(null);
  const wheelCooldown = useRef(0);
  const [activeIdx, setActiveIdx] = useState(() =>
    Math.max(0, items.indexOf(value)),
  );
  const [focused, setFocused] = useState(false);

  useImperativeHandle(ref, () => ({
    focus: () => scrollRef.current?.focus(),
  }));

  // Sync external value → scroll position.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const idx = Math.max(0, items.indexOf(value));
    const target = idx * ITEM_H;
    if (Math.abs(el.scrollTop - target) > 0.5) {
      el.scrollTop = target;
    }
    setActiveIdx(idx);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, items.length]);

  const settle = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const idx = Math.max(
      0,
      Math.min(items.length - 1, Math.round(el.scrollTop / ITEM_H)),
    );
    const target = idx * ITEM_H;
    if (Math.abs(el.scrollTop - target) > 0.5) {
      el.scrollTo({ top: target, behavior: "smooth" });
    }
    setActiveIdx(idx);
    const next = items[idx];
    if (next !== value) onChange(next);
  }, [items, onChange, value]);

  const onScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    const idx = Math.max(
      0,
      Math.min(items.length - 1, Math.round(el.scrollTop / ITEM_H)),
    );
    if (idx !== activeIdx) setActiveIdx(idx);
    if (snapTimer.current) window.clearTimeout(snapTimer.current);
    snapTimer.current = window.setTimeout(settle, 80);
  };

  // Sharp, responsive scroll handling: every notch / pixel of delta directly
  // moves the wheel; idle snaps quickly.
  const onWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    e.preventDefault();
    const el = scrollRef.current;
    if (!el) return;
    const now = Date.now();

    // Classic mouse wheel = large discrete notches (|deltaY| >= 50).
    const isNotch =
      e.deltaMode === 1 || (e.deltaMode === 0 && Math.abs(e.deltaY) >= 50);

    if (isNotch) {
      if (now < wheelCooldown.current) return;
      wheelCooldown.current = now + 45;
      const dir = e.deltaY > 0 ? 1 : -1;
      const nextIdx = Math.max(0, Math.min(items.length - 1, activeIdx + dir));
      el.scrollTo({ top: nextIdx * ITEM_H, behavior: "smooth" });
      setActiveIdx(nextIdx);
      const next = items[nextIdx];
      if (next !== value) onChange(next);
      return;
    }

    // Trackpad / fine wheel: 1:1 pixel mapping for a sharp, smooth feel.
    el.scrollTop = Math.max(
      0,
      Math.min((items.length - 1) * ITEM_H, el.scrollTop + e.deltaY),
    );
    if (snapTimer.current) window.clearTimeout(snapTimer.current);
    snapTimer.current = window.setTimeout(settle, 70);
  };

  const onKeyDown = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      const dir = e.key === "ArrowDown" ? 1 : -1;
      const nextIdx = Math.max(0, Math.min(items.length - 1, activeIdx + dir));
      const el = scrollRef.current;
      if (el) el.scrollTo({ top: nextIdx * ITEM_H, behavior: "smooth" });
      setActiveIdx(nextIdx);
      const next = items[nextIdx];
      if (next !== value) onChange(next);
    } else if (e.key === "ArrowLeft") {
      e.preventDefault();
      onArrowH(-1);
    } else if (e.key === "ArrowRight") {
      e.preventDefault();
      onArrowH(1);
    }
  };

  return (
    <div
      ref={scrollRef}
      role="listbox"
      aria-label={ariaLabel}
      tabIndex={0}
      onScroll={onScroll}
      onWheel={onWheel}
      onKeyDown={onKeyDown}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      onMouseDown={() => scrollRef.current?.focus()}
      className={[
        "no-scrollbar relative overflow-y-auto outline-none rounded-[4px] transition-colors",
        focused ? "ring-1 ring-ink" : "ring-1 ring-transparent",
      ].join(" ")}
      style={{
        width: 22,
        height: ITEM_H,
        scrollSnapType: "y mandatory",
        scrollbarWidth: "none",
      }}
    >
      {items.map((n, i) => (
        <div
          key={n}
          role="option"
          aria-selected={i === activeIdx}
          className="mono flex items-center justify-center text-[12px] tabular-nums text-ink"
          style={{
            height: ITEM_H,
            scrollSnapAlign: "center",
          }}
        >
          {format(n)}
        </div>
      ))}
    </div>
  );
});

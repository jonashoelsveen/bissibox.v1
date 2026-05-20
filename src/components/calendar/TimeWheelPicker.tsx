/**
 * TimeWheelPicker — iOS-style 3D rotating wheels for picking a "from / to"
 * time range. Used in the calendar week/month edit-session popover header.
 *
 * Two pairs of wheels (HH + MM) separated by an en-dash:
 *   [HH] [MM]  –  [HH] [MM]
 *
 * • Native momentum + scroll-snap give the spin-and-settle feel on desktop.
 * • Each visible option is rotated around X to fake a 3D cylinder.
 * • Mouse wheel = exactly one step per notch. Trackpad swipes preserve
 *   velocity via native scroll-snap.
 * • Keyboard: Up/Down step through values; Tab moves between wheels.
 * • Guardrail: if "from" passes "to", "to" auto-bumps to from + 60 min.
 */

import {
  KeyboardEvent as ReactKeyboardEvent,
  useCallback,
  useEffect,
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
}

const ITEM_H = 28;        // px — height of one option row
const VISIBLE = 5;        // odd number — center + 2 above + 2 below
const CENTER_IDX = Math.floor(VISIBLE / 2);

const HOURS = Array.from({ length: 24 }, (_, i) => i);

export function TimeWheelPicker({
  value,
  onChange,
  minuteStep = 5,
}: TimeWheelPickerProps) {
  const MINUTES = Array.from(
    { length: Math.floor(60 / minuteStep) },
    (_, i) => i * minuteStep,
  );

  const fromH = Math.floor(value.startMin / 60);
  const fromM = value.startMin % 60;
  const toH = Math.floor(value.endMin / 60);
  const toM = value.endMin % 60;

  // Snap incoming minutes onto the nearest step so the wheel can find them.
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
      // Don't let "to" land at or before "from"; nudge it one step ahead.
      const bumped = Math.min(24 * 60 - minuteStep, value.startMin + minuteStep);
      onChange({ startMin: value.startMin, endMin: bumped });
    } else {
      onChange({ startMin: value.startMin, endMin: end });
    }
  };

  return (
    <div className="flex items-center justify-center gap-1 select-none">
      <Wheel
        ariaLabel="Fra time"
        items={HOURS}
        value={fromH}
        format={(n) => String(n).padStart(2, "0")}
        onChange={(h) => setFrom(h, snap(fromM))}
      />
      <span className="text-[12px] font-medium text-ink/60">:</span>
      <Wheel
        ariaLabel="Fra minutt"
        items={MINUTES}
        value={snap(fromM)}
        format={(n) => String(n).padStart(2, "0")}
        onChange={(m) => setFrom(fromH, m)}
      />
      <span className="mx-1.5 text-[12px] font-medium text-ink/60">–</span>
      <Wheel
        ariaLabel="Til time"
        items={HOURS}
        value={toH}
        format={(n) => String(n).padStart(2, "0")}
        onChange={(h) => setTo(h, snap(toM))}
      />
      <span className="text-[12px] font-medium text-ink/60">:</span>
      <Wheel
        ariaLabel="Til minutt"
        items={MINUTES}
        value={snap(toM)}
        format={(n) => String(n).padStart(2, "0")}
        onChange={(m) => setTo(toH, m)}
      />
    </div>
  );
}

interface WheelProps {
  items: number[];
  value: number;
  ariaLabel: string;
  format: (n: number) => string;
  onChange: (n: number) => void;
}

function Wheel({ items, value, ariaLabel, format, onChange }: WheelProps) {
  const ref = useRef<HTMLDivElement | null>(null);
  const snapTimer = useRef<number | null>(null);
  const wheelAccum = useRef(0);
  const wheelCooldown = useRef(0);
  const [activeIdx, setActiveIdx] = useState(() =>
    Math.max(0, items.indexOf(value)),
  );

  // Sync external value → scroll position.
  useEffect(() => {
    const el = ref.current;
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
    const el = ref.current;
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
    const el = ref.current;
    if (!el) return;
    const idx = Math.max(
      0,
      Math.min(items.length - 1, Math.round(el.scrollTop / ITEM_H)),
    );
    if (idx !== activeIdx) setActiveIdx(idx);
    if (snapTimer.current) window.clearTimeout(snapTimer.current);
    snapTimer.current = window.setTimeout(settle, 110);
  };

  // Mouse wheel: one notch = one step. Trackpad swipes accumulate & snap.
  const onWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    e.preventDefault();
    const el = ref.current;
    if (!el) return;
    const now = Date.now();
    const isLikelyMouse =
      Math.abs(e.deltaY) >= 40 && e.deltaMode === 0 && Number.isInteger(e.deltaY);
    if (isLikelyMouse || e.deltaMode === 1) {
      // Discrete notch — debounce so a single physical click = one step.
      if (now < wheelCooldown.current) return;
      wheelCooldown.current = now + 70;
      const dir = e.deltaY > 0 ? 1 : -1;
      const nextIdx = Math.max(0, Math.min(items.length - 1, activeIdx + dir));
      el.scrollTo({ top: nextIdx * ITEM_H, behavior: "smooth" });
      setActiveIdx(nextIdx);
      const next = items[nextIdx];
      if (next !== value) onChange(next);
    } else {
      // Trackpad: accumulate dampened delta then let snap settle.
      wheelAccum.current += e.deltaY * 0.6;
      el.scrollTop = Math.max(
        0,
        Math.min((items.length - 1) * ITEM_H, el.scrollTop + e.deltaY * 0.6),
      );
      if (snapTimer.current) window.clearTimeout(snapTimer.current);
      snapTimer.current = window.setTimeout(settle, 120);
    }
  };

  const onKeyDown = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      const dir = e.key === "ArrowDown" ? 1 : -1;
      const nextIdx = Math.max(0, Math.min(items.length - 1, activeIdx + dir));
      const el = ref.current;
      if (el) el.scrollTo({ top: nextIdx * ITEM_H, behavior: "smooth" });
      setActiveIdx(nextIdx);
      const next = items[nextIdx];
      if (next !== value) onChange(next);
    }
  };

  return (
    <div className="relative" style={{ width: 36, height: ITEM_H * VISIBLE }}>
      {/* Focus zone — soft band marking the selected row. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 z-10 rounded-md border-y border-ink/15 bg-ink/[0.04]"
        style={{ top: CENTER_IDX * ITEM_H, height: ITEM_H }}
      />
      {/* Top + bottom fade masks — sell the 3D cylinder edge. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 z-20"
        style={{
          background:
            "linear-gradient(to bottom, var(--card) 0%, color-mix(in oklab, var(--card) 0%, transparent) 30%, color-mix(in oklab, var(--card) 0%, transparent) 70%, var(--card) 100%)",
        }}
      />
      <div
        ref={ref}
        role="listbox"
        aria-label={ariaLabel}
        tabIndex={0}
        onScroll={onScroll}
        onWheel={onWheel}
        onKeyDown={onKeyDown}
        className="no-scrollbar relative h-full w-full overflow-y-auto outline-none focus:ring-0"
        style={{
          scrollSnapType: "y mandatory",
          perspective: 600,
          scrollbarWidth: "none",
        }}
      >
        <div style={{ height: CENTER_IDX * ITEM_H }} />
        {items.map((n, i) => {
          const dist = i - activeIdx;
          const abs = Math.abs(dist);
          const angle = Math.max(-60, Math.min(60, dist * 18));
          const opacity = abs === 0 ? 1 : abs === 1 ? 0.7 : abs === 2 ? 0.35 : 0.15;
          const scale = abs === 0 ? 1 : 1 - Math.min(0.18, abs * 0.06);
          return (
            <div
              key={n}
              role="option"
              aria-selected={i === activeIdx}
              className="mono flex items-center justify-center text-[13px] tabular-nums text-ink"
              style={{
                height: ITEM_H,
                scrollSnapAlign: "center",
                transform: `rotateX(${angle}deg) scale(${scale})`,
                opacity,
                transition: "opacity 80ms linear, transform 80ms linear",
              }}
            >
              {format(n)}
            </div>
          );
        })}
        <div style={{ height: CENTER_IDX * ITEM_H }} />
      </div>
    </div>
  );
}

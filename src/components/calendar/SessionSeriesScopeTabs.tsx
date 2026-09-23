import { useCallback, useLayoutEffect, useRef, useState } from "react";
import type { SessionDeleteScope } from "@/lib/sessionRepeat";

const TRACK_HEIGHT = 28;
const TRACK_PADDING = 2;
const ISLAND_RADIUS = 10;
const TAB_RADIUS = 8;

const TABS: Array<{ key: "this" | "allInSeries"; label: string }> = [
  { key: "this", label: "This" },
  { key: "allInSeries", label: "All" },
];

/**
 * This / All island at the top of a repeating-session menu.
 * Default is This: edits stay on the open session. All applies the same
 * edits to every instance in the series.
 */
export function SessionSeriesScopeTabs({
  value,
  onChange,
}: {
  value: "this" | "allInSeries";
  onChange: (scope: SessionDeleteScope) => void;
}) {
  const trackRef = useRef<HTMLDivElement | null>(null);
  const [indicator, setIndicator] = useState({ left: TRACK_PADDING, width: 0 });
  const activeIndex = value === "allInSeries" ? 1 : 0;

  const measureIndicator = useCallback(() => {
    const track = trackRef.current;
    if (!track) return;
    const inner = track.clientWidth - TRACK_PADDING * 2;
    const width = inner / 2;
    const left = TRACK_PADDING + activeIndex * width;
    setIndicator((prev) =>
      prev.left === left && prev.width === width ? prev : { left, width },
    );
  }, [activeIndex]);

  useLayoutEffect(() => {
    measureIndicator();
    const track = trackRef.current;
    if (!track) return;
    const ro = new ResizeObserver(() => measureIndicator());
    ro.observe(track);
    return () => ro.disconnect();
  }, [measureIndicator]);

  return (
    <div
      ref={trackRef}
      role="tablist"
      aria-label="Apply edits to this session or all sessions in the series"
      data-session-series-scope=""
      className="relative box-border overflow-hidden bg-muted/70"
      style={{ height: TRACK_HEIGHT, borderRadius: ISLAND_RADIUS }}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute bg-white transition-[left,width] duration-150 ease-out"
        style={{
          left: indicator.width > 0 ? indicator.left : TRACK_PADDING,
          width: indicator.width > 0 ? indicator.width : 0,
          height: TRACK_HEIGHT - TRACK_PADDING * 2,
          top: TRACK_PADDING,
          borderRadius: TAB_RADIUS,
        }}
      />
      <div
        className="relative grid h-full items-center"
        style={{
          gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
          padding: TRACK_PADDING,
        }}
      >
        {TABS.map((tab) => {
          const selected = tab.key === value;
          return (
            <button
              key={tab.key}
              type="button"
              role="tab"
              aria-selected={selected}
              onClick={() => onChange(tab.key)}
              className={[
                "relative z-[1] flex h-full items-center justify-center truncate text-[12px] leading-none transition-colors",
                selected
                  ? "font-medium text-muted-foreground"
                  : "font-normal text-muted-foreground/80 hover:text-muted-foreground",
              ].join(" ")}
            >
              {tab.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

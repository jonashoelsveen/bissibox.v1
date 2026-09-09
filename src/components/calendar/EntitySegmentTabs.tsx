import { useCallback, useLayoutEffect, useRef, useState } from "react";

const TRACK_HEIGHT = 26;
const TRACK_PADDING = 2;
const SEGMENT_INNER_GAP = 2;

const OUTER_RADIUS = TRACK_HEIGHT / 2;
const BUBBLE_HEIGHT = TRACK_HEIGHT - TRACK_PADDING * 2;
const BUBBLE_RADIUS = OUTER_RADIUS - TRACK_PADDING;

export type EntitySegmentTab<K extends string = string> = {
  key: K;
  label: string;
};

/**
 * Minimal iOS-style segmented tab island for entity session editor.
 */
export function EntitySegmentTabs<K extends string>({
  tabs,
  active,
  onChange,
}: {
  tabs: Array<EntitySegmentTab<K>>;
  active: K;
  onChange: (tab: K) => void;
}) {
  const trackRef = useRef<HTMLDivElement | null>(null);
  const [indicator, setIndicator] = useState({ left: TRACK_PADDING, width: 0 });

  const activeIndex = Math.max(0, tabs.findIndex((tab) => tab.key === active));

  const measureIndicator = useCallback(() => {
    const track = trackRef.current;
    if (!track || tabs.length === 0) return;
    const trackWidth = track.clientWidth;
    const segmentWidth = (trackWidth - TRACK_PADDING * 2) / tabs.length;

    const isFirst = activeIndex === 0;
    const isLast = activeIndex === tabs.length - 1;
    const hasMultiple = tabs.length > 1;

    const insetLeft = hasMultiple && !isFirst ? SEGMENT_INNER_GAP / 2 : 0;
    const insetRight = hasMultiple && !isLast ? SEGMENT_INNER_GAP / 2 : 0;

    const width = Math.max(segmentWidth - insetLeft - insetRight, 0);
    const left = TRACK_PADDING + activeIndex * segmentWidth + insetLeft;
    setIndicator((prev) =>
      prev.left === left && prev.width === width ? prev : { left, width },
    );
  }, [activeIndex, tabs.length]);

  useLayoutEffect(() => {
    measureIndicator();
    const track = trackRef.current;
    if (!track) return;
    const ro = new ResizeObserver(() => measureIndicator());
    ro.observe(track);
    return () => ro.disconnect();
  }, [measureIndicator]);

  return (
    <div className="px-0 pb-0.5" role="tablist" aria-label="Session sections">
      <div
        ref={trackRef}
        className="relative box-border overflow-hidden border border-black/[0.05] bg-[#f2f2f7]/95 dark:border-white/[0.08] dark:bg-muted/60"
        style={{ height: TRACK_HEIGHT, borderRadius: OUTER_RADIUS }}
      >
        <div
          aria-hidden
          className="pointer-events-none absolute bg-card transition-[left,width] duration-150 ease-out dark:bg-background"
          style={{
            left: indicator.width > 0 ? indicator.left : TRACK_PADDING,
            width: indicator.width > 0 ? indicator.width : 0,
            height: BUBBLE_HEIGHT,
            top: "50%",
            transform: "translateY(-50%)",
            borderRadius: BUBBLE_RADIUS,
            boxShadow: "0 0.5px 1px rgba(0,0,0,0.04)",
          }}
        />
        <div
          className="relative grid h-full items-center"
          style={{
            gridTemplateColumns: `repeat(${tabs.length}, minmax(0, 1fr))`,
            padding: TRACK_PADDING,
          }}
        >
          {tabs.map((tab) => {
            const selected = tab.key === active;
            return (
              <button
                key={tab.key}
                type="button"
                role="tab"
                aria-selected={selected}
                onClick={() => onChange(tab.key)}
                className={[
                  "relative z-[1] flex h-full items-center justify-center truncate px-0.5 text-[11px] leading-none transition-colors",
                  selected
                    ? "font-medium text-ink"
                    : "font-normal text-muted-foreground hover:text-ink/70",
                ].join(" ")}
              >
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

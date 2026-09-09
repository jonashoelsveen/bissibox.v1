/**
 * iPhone 17 Pro–style device chrome for static app / ticket photo previews.
 * Not an interactive simulator — screen is image, children, or a placeholder.
 */

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/** Outer device width; height follows ~19.5:9 screen inside the bezel. */
export const IPHONE_17_PRO_DEVICE_WIDTH = 352;
const DEVICE_W = IPHONE_17_PRO_DEVICE_WIDTH;
const BEZEL = 11;
/** Screen aspect ≈ 19.5:9 (contemporary Pro). */
const SCREEN_ASPECT = 19.5 / 9;
const OUTER_RADIUS = 52;
const SCREEN_RADIUS = 40;

export const IPHONE_17_PRO_SCREEN_WIDTH = DEVICE_W - BEZEL * 2;
export const IPHONE_17_PRO_SCREEN_HEIGHT = Math.round(
  IPHONE_17_PRO_SCREEN_WIDTH * SCREEN_ASPECT,
);

export type Iphone17ProFrameProps = {
  /** Full-bleed screen image (preferred path for app/ticket screenshots). */
  screenSrc?: string | null;
  screenAlt?: string;
  /** Optional React screen content when not using a photo yet. */
  children?: ReactNode;
  className?: string;
};

export function Iphone17ProFrame({
  screenSrc = null,
  screenAlt = "App preview",
  children,
  className,
}: Iphone17ProFrameProps) {
  const screenW = IPHONE_17_PRO_SCREEN_WIDTH;
  const screenH = IPHONE_17_PRO_SCREEN_HEIGHT;
  const deviceH = screenH + BEZEL * 2;

  return (
    <div
      className={cn("relative shrink-0 select-none", className)}
      style={{ width: DEVICE_W, height: deviceH }}
      aria-label="iPhone preview"
    >
      {/* Side buttons — volume (left) */}
      <span
        aria-hidden
        className="absolute left-0 top-[118px] h-[28px] w-[3px] -translate-x-[2px] rounded-l-sm bg-[#3A3A3C]"
      />
      <span
        aria-hidden
        className="absolute left-0 top-[158px] h-[52px] w-[3px] -translate-x-[2px] rounded-l-sm bg-[#3A3A3C]"
      />
      <span
        aria-hidden
        className="absolute left-0 top-[218px] h-[52px] w-[3px] -translate-x-[2px] rounded-l-sm bg-[#3A3A3C]"
      />
      {/* Power (right) */}
      <span
        aria-hidden
        className="absolute right-0 top-[176px] h-[72px] w-[3px] translate-x-[2px] rounded-r-sm bg-[#3A3A3C]"
      />

      {/* Titanium chassis */}
      <div
        className="absolute inset-0"
        style={{
          borderRadius: OUTER_RADIUS,
          background:
            "linear-gradient(145deg, #5C5C5E 0%, #2C2C2E 42%, #1C1C1E 78%, #3A3A3C 100%)",
          boxShadow:
            "0 24px 56px -20px rgba(0,0,0,0.45), 0 8px 20px -12px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.18), inset 0 -1px 0 rgba(0,0,0,0.35)",
        }}
      >
        {/* Inner rim */}
        <div
          className="absolute inset-[3px]"
          style={{
            borderRadius: OUTER_RADIUS - 3,
            background:
              "linear-gradient(180deg, #2A2A2C 0%, #0A0A0A 100%)",
            boxShadow: "inset 0 0 0 1px rgba(255,255,255,0.06)",
          }}
        />

        {/* Screen well */}
        <div
          className="absolute overflow-hidden bg-black"
          style={{
            top: BEZEL,
            left: BEZEL,
            width: screenW,
            height: screenH,
            borderRadius: SCREEN_RADIUS,
          }}
        >
          {screenSrc ? (
            <img
              src={screenSrc}
              alt={screenAlt}
              draggable={false}
              className="pointer-events-none absolute inset-0 h-full w-full object-cover"
            />
          ) : children ? (
            <div className="pointer-events-none absolute inset-0 h-full w-full overflow-hidden">
              {children}
            </div>
          ) : (
            <div
              aria-hidden
              className="absolute inset-0"
              style={{
                background:
                  "linear-gradient(165deg, #F2F2F7 0%, #E5E5EA 48%, #D1D1D6 100%)",
              }}
            />
          )}

          {/* Dynamic Island */}
          <div
            aria-hidden
            className="pointer-events-none absolute left-1/2 top-[11px] z-10 -translate-x-1/2"
            style={{
              width: 112,
              height: 34,
              borderRadius: 20,
              background: "#0A0A0A",
              boxShadow: "inset 0 0 0 1px rgba(255,255,255,0.06)",
            }}
          />

          {/* Home indicator */}
          <div
            aria-hidden
            className="pointer-events-none absolute bottom-[8px] left-1/2 z-10 -translate-x-1/2"
            style={{
              width: 118,
              height: 4,
              borderRadius: 999,
              background: "rgba(0,0,0,0.45)",
            }}
          />
        </div>
      </div>
    </div>
  );
}

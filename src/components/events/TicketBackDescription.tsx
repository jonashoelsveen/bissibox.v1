/**
 * Shared ticket-back description surface — same physical size & typography
 * for About editing and Tickets display so text always matches.
 */

import { useLayoutEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import {
  EVENT_DESCRIPTION_MAX_CHARS,
  EVENT_TICKET_HEIGHT,
} from "./event-ui-types";

/** Same max width as EventTicketsSection ticket card. */
export const EVENT_TICKET_MAX_WIDTH_CLASS = "max-w-[720px]";

export const EVENT_TICKET_HEIGHT_PX = EVENT_TICKET_HEIGHT;

/** Ticket side notches — same mask as EventTicketsSection. */
export const ticketMaskStyle = {
  WebkitMaskImage:
    "radial-gradient(12px at left 62%, transparent 98%, #000), radial-gradient(12px at right 62%, transparent 98%, #000)",
  WebkitMaskPosition: "left, right",
  WebkitMaskSize: "51% 100%, 51% 100%",
  WebkitMaskRepeat: "no-repeat",
  maskImage:
    "radial-gradient(12px at left 62%, transparent 98%, #000), radial-gradient(12px at right 62%, transparent 98%, #000)",
  maskPosition: "left, right",
  maskSize: "51% 100%, 51% 100%",
  maskRepeat: "no-repeat",
} as const;

function CapacityRing({ fillRatio }: { fillRatio: number }) {
  const size = 22;
  const stroke = 2.5;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const ratio = Math.min(1, Math.max(0, fillRatio));
  const grey = "#8E8E93";

  return (
    <div
      className="pointer-events-none absolute right-0 top-0 z-10"
      title="Description capacity"
      aria-hidden
    >
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="rgba(255,255,255,0.28)"
          strokeWidth={stroke}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={grey}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - ratio)}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </svg>
    </div>
  );
}

type InnerProps = {
  children: React.ReactNode;
  showCapacity?: boolean;
  fillRatio?: number;
};

/** Inner padding + Description label — shared by About editor and Tickets back. */
export function TicketBackDescriptionInner({
  children,
  showCapacity = false,
  fillRatio = 0,
}: InnerProps) {
  return (
    <div className="flex h-full min-h-0 min-w-0 flex-1 flex-col px-8 py-8">
      <div className="relative mb-2 shrink-0">
        <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-white/70">
          Description
        </p>
        {showCapacity ? <CapacityRing fillRatio={fillRatio} /> : null}
      </div>
      <div className="relative min-h-0 flex-1">{children}</div>
    </div>
  );
}

const descriptionTextClass =
  "h-full overflow-hidden text-[15px] leading-relaxed text-white whitespace-pre-wrap break-words";

export function TicketBackDescriptionText({ text }: { text: string }) {
  const body = text.trim() ? text : "No description";
  return <p className={descriptionTextClass}>{body}</p>;
}

type ShellProps = {
  children: React.ReactNode;
  className?: string;
  withMask?: boolean;
};

/** Outer ticket-back chrome — identical size to Tickets section card. */
export function TicketBackShell({
  children,
  className,
  withMask = true,
}: ShellProps) {
  return (
    <div
      className={cn(
        "relative w-full overflow-hidden rounded-[14px] bg-[#8E8E93] text-white",
        "shadow-[0_12px_40px_-18px_rgba(0,0,0,0.35)]",
        className,
      )}
      style={{
        height: EVENT_TICKET_HEIGHT,
        ...(withMask ? ticketMaskStyle : null),
      }}
    >
      {children}
    </div>
  );
}

export function TicketBackDescriptionView({ text }: { text: string }) {
  return (
    <TicketBackShell>
      <TicketBackDescriptionInner>
        <TicketBackDescriptionText text={text} />
      </TicketBackDescriptionInner>
    </TicketBackShell>
  );
}

function CapacityRingOnLight({
  fillRatio,
  remainingLabel,
}: {
  fillRatio: number;
  remainingLabel: string;
}) {
  const size = 24;
  const stroke = 2.25;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  // Keep sub-pixel progress so the arc advances smoothly while typing.
  const ratio = Math.min(1, Math.max(0, fillRatio));
  const grey = "#8E8E93";

  return (
    <div
      className="pointer-events-none absolute right-3 top-3 z-10"
      title={remainingLabel}
      aria-hidden
    >
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="rgba(0,0,0,0.12)"
          strokeWidth={stroke}
        />
        {ratio > 0.0005 ? (
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke={grey}
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={c}
            strokeDashoffset={c * (1 - ratio)}
            transform={`rotate(-90 ${size / 2} ${size / 2})`}
          />
        ) : null}
      </svg>
    </div>
  );
}

/** Shared canvas for per-character width — avoids allocating on every keystroke. */
let measureCtx: CanvasRenderingContext2D | null = null;
function getMeasureCtx(): CanvasRenderingContext2D | null {
  if (measureCtx) return measureCtx;
  if (typeof document === "undefined") return null;
  const canvas = document.createElement("canvas");
  measureCtx = canvas.getContext("2d");
  return measureCtx;
}

/**
 * Precise fill of the content box: completed lines + how far the current
 * line has progressed across the width (not just whole-line height steps).
 */
function measureLineProgress(
  text: string,
  contentWidth: number,
  style: CSSStyleDeclaration,
  availableHeight: number,
): number {
  if (!text || contentWidth <= 0 || availableHeight <= 0) return 0;

  const ctx = getMeasureCtx();
  const lineHeightRaw = parseFloat(style.lineHeight);
  const fontSize = parseFloat(style.fontSize) || 15;
  const lineHeight =
    Number.isFinite(lineHeightRaw) && lineHeightRaw > 0
      ? lineHeightRaw
      : fontSize * 1.625;
  const maxLines = availableHeight / lineHeight;
  if (maxLines <= 0) return 0;

  if (!ctx) {
    // Fallback: height-only (coarse).
    return Math.min(1, text.length > 0 ? lineHeight / availableHeight : 0);
  }

  ctx.font = style.font;
  const widthOf = (s: string) => ctx.measureText(s).width;

  let completedLines = 0;
  let lastLineFraction = 0;
  const paragraphs = text.split("\n");

  for (let p = 0; p < paragraphs.length; p++) {
    const para = paragraphs[p];
    // Hard newline with empty segment → a blank line.
    if (para.length === 0) {
      completedLines += 1;
      lastLineFraction = 0;
      continue;
    }

    // Character wrap to match overflow-wrap:break-word / pre-wrap.
    let line = "";
    for (let i = 0; i < para.length; i++) {
      const next = line + para[i];
      if (line.length > 0 && widthOf(next) > contentWidth) {
        completedLines += 1;
        line = para[i];
      } else {
        line = next;
      }
    }
    completedLines += 1;
    lastLineFraction = Math.min(1, widthOf(line) / contentWidth);
  }

  // Finished lines count as 1; the active line contributes its width fraction.
  const usedLines = Math.max(0, completedLines - 1) + lastLineFraction;
  return Math.min(1, usedLines / maxLines);
}

/**
 * Mirror-measure typed text against the textarea’s real content box.
 * `fits` uses layout height; `ratio` uses per-line width for smooth ring progress.
 */
function measureDescriptionFit(
  el: HTMLTextAreaElement,
  text: string,
): { contentHeight: number; availableHeight: number; fits: boolean; ratio: number } {
  const availableHeight = el.clientHeight;
  if (!text) {
    return { contentHeight: 0, availableHeight, fits: true, ratio: 0 };
  }

  const style = getComputedStyle(el);
  const padX =
    (parseFloat(style.paddingLeft) || 0) + (parseFloat(style.paddingRight) || 0);
  const contentWidth = Math.max(0, el.clientWidth - padX);

  const mirror = document.createElement("div");
  mirror.setAttribute("aria-hidden", "true");
  mirror.style.cssText = [
    "position:absolute",
    "visibility:hidden",
    "pointer-events:none",
    "left:-99999px",
    "top:0",
    `width:${el.clientWidth}px`,
    `box-sizing:${style.boxSizing}`,
    `padding:${style.paddingTop} ${style.paddingRight} ${style.paddingBottom} ${style.paddingLeft}`,
    `border-top:${style.borderTopWidth} solid transparent`,
    `border-right:${style.borderRightWidth} solid transparent`,
    `border-bottom:${style.borderBottomWidth} solid transparent`,
    `border-left:${style.borderLeftWidth} solid transparent`,
    `font:${style.font}`,
    `letter-spacing:${style.letterSpacing}`,
    `line-height:${style.lineHeight}`,
    `text-transform:${style.textTransform}`,
    "white-space:pre-wrap",
    "overflow-wrap:break-word",
    "word-wrap:break-word",
  ].join(";");
  // Trailing newline does not advance layout in a div unless given a space.
  mirror.textContent = text.endsWith("\n") ? `${text} ` : text;
  document.body.appendChild(mirror);
  const contentHeight = mirror.scrollHeight;
  mirror.remove();

  const fits = contentHeight <= availableHeight + 1;
  const ratio = measureLineProgress(text, contentWidth, style, availableHeight);
  // If layout says full, pin the ring to full even if width-fraction undershoots.
  const cappedRatio = fits ? ratio : 1;
  return { contentHeight, availableHeight, fits, ratio: cappedRatio };
}

/** About-page description editor — plain grey field at ticket height (not ticket-shaped). */
export function TicketBackDescriptionEditor({
  value,
  onChange,
}: {
  value: string;
  onChange: (next: string) => void;
}) {
  const taRef = useRef<HTMLTextAreaElement>(null);
  const lastGoodRef = useRef(value);
  const [fillRatio, setFillRatio] = useState(0);

  const refreshCapacity = (text: string = value) => {
    const el = taRef.current;
    if (!el) return { fits: true, ratio: 0 };
    const measured = measureDescriptionFit(el, text);
    setFillRatio(measured.ratio);
    return measured;
  };

  useLayoutEffect(() => {
    const { fits } = refreshCapacity(value);
    if (fits) {
      lastGoodRef.current = value;
      return;
    }
    if (value !== lastGoodRef.current) {
      onChange(lastGoodRef.current);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- remeasure when value changes
  }, [value]);

  useLayoutEffect(() => {
    const el = taRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => {
      refreshCapacity(value);
    });
    ro.observe(el);
    return () => ro.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  const tryInsert = (next: string) => {
    const capped = next.slice(0, EVENT_DESCRIPTION_MAX_CHARS);
    const el = taRef.current;
    if (!el) {
      onChange(capped);
      return;
    }

    // Deletions / shorter text always allowed.
    if (capped.length <= value.length) {
      onChange(capped);
      return;
    }

    const { fits } = measureDescriptionFit(el, capped);
    if (fits) onChange(capped);
  };

  const remainingPct = Math.round((1 - fillRatio) * 100);

  return (
    <div
      className="relative w-full overflow-hidden rounded-lg border-0 bg-secondary/50"
      style={{ height: EVENT_TICKET_HEIGHT }}
    >
      <CapacityRingOnLight
        fillRatio={fillRatio}
        remainingLabel={
          fillRatio >= 1
            ? "Description is full"
            : `${remainingPct}% space remaining`
        }
      />
      <span className="sr-only" aria-live="polite">
        {fillRatio >= 1
          ? "Description is full"
          : `${remainingPct}% of description space remaining`}
      </span>
      {/*
        Same content chrome as the ticket back (px-8 py-8 + label band) so
        fill / stop align with what the ticket can actually show.
      */}
      <div className="flex h-full min-h-0 flex-col px-8 py-8">
        <div
          className="mb-2 shrink-0 text-[11px] font-medium uppercase tracking-[0.12em] text-transparent select-none"
          aria-hidden
        >
          Description
        </div>
        <textarea
          ref={taRef}
          rows={1}
          value={value}
          onChange={(e) => tryInsert(e.target.value)}
          onBeforeInput={(e) => {
            const input = e.nativeEvent as InputEvent;
            if (
              input.inputType?.startsWith("delete") ||
              input.inputType === "historyUndo"
            ) {
              return;
            }
            const el = e.currentTarget;
            const start = el.selectionStart ?? value.length;
            const end = el.selectionEnd ?? value.length;
            if (start !== end) return;
            // Only block when the current text already fills the box.
            if (!measureDescriptionFit(el, value).fits) e.preventDefault();
          }}
          onPaste={(e) => {
            e.preventDefault();
            const pasted = e.clipboardData.getData("text") ?? "";
            const el = e.currentTarget;
            const start = el.selectionStart ?? value.length;
            const end = el.selectionEnd ?? value.length;
            const before = value.slice(0, start);
            const after = value.slice(end);
            const room =
              EVENT_DESCRIPTION_MAX_CHARS - before.length - after.length;
            const insert = pasted.slice(0, Math.max(0, room));

            let lo = 0;
            let hi = insert.length;
            let best = "";
            while (lo <= hi) {
              const mid = (lo + hi) >> 1;
              const candidate = before + insert.slice(0, mid) + after;
              if (measureDescriptionFit(el, candidate).fits) {
                best = insert.slice(0, mid);
                lo = mid + 1;
              } else {
                hi = mid - 1;
              }
            }
            onChange(before + best + after);
          }}
          placeholder="Add a description…"
          aria-label="Description"
          maxLength={EVENT_DESCRIPTION_MAX_CHARS}
          className={cn(
            "min-h-0 w-full flex-1 resize-none overflow-hidden border-0 bg-transparent",
            "p-0 text-[15px] leading-relaxed text-ink outline-none",
            "placeholder:text-muted-foreground/60 whitespace-pre-wrap break-words",
          )}
        />
      </div>
    </div>
  );
}

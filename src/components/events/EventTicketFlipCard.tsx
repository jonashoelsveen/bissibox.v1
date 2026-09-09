/**
 * Flip ticket card used on the Event Tickets tab (large editor) and mirrored
 * inside the iPhone preview. Visual state is controlled by the parent so both
 * instances stay in sync.
 */

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import {
  DEFAULT_SUBEVENT_COLOR,
  DEFAULT_TICKET_COLOR,
  EVENT_TICKET_HEIGHT,
  formatSubeventTime,
  type EventDraft,
  type EventSubeventDraft,
} from "./event-ui-types";
import {
  TicketBackDescriptionInner,
  TicketBackDescriptionText,
  ticketMaskStyle,
} from "./TicketBackDescription";
import {
  TicketControlVisual,
  type TicketControlPayload,
} from "./TicketControlVisual";

export const EVENT_TICKET_REF_WIDTH = 720;

export function ticketInk(hex: string): string {
  const raw = hex.replace("#", "").trim();
  if (raw.length !== 6) return "#1C1C1E";
  const r = Number.parseInt(raw.slice(0, 2), 16);
  const g = Number.parseInt(raw.slice(2, 4), 16);
  const b = Number.parseInt(raw.slice(4, 6), 16);
  if ([r, g, b].some((n) => Number.isNaN(n))) return "#1C1C1E";
  const lum = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
  return lum > 0.62 ? "#1C1C1E" : "#FFFFFF";
}

export function ticketMuted(ink: string): string {
  return ink === "#FFFFFF" ? "rgba(255,255,255,0.72)" : "rgba(28,28,30,0.55)";
}

export function ticketRule(ink: string): string {
  return ink === "#FFFFFF" ? "rgba(255,255,255,0.35)" : "rgba(28,28,30,0.18)";
}

export type EventTicketFlipCardProps = {
  draft: EventDraft;
  flipped: boolean;
  inspecting: boolean;
  primarySubevent: EventSubeventDraft | null;
  subeventLabel: string;
  controlPayload: TicketControlPayload | null;
  controlError: string | null;
  controlLoading: boolean;
  /** When false, flip / inspection are display-only (phone mirror). */
  interactive?: boolean;
  onFlipToggle?: () => void;
  onInspectToggle?: () => void;
  className?: string;
  /** Fixed layout width for scaled mirrors (defaults to fluid 100%). */
  width?: number | string;
};

export function EventTicketFlipCard({
  draft,
  flipped,
  inspecting,
  primarySubevent,
  subeventLabel,
  controlPayload,
  controlError,
  controlLoading,
  interactive = true,
  onFlipToggle,
  onInspectToggle,
  className,
  width = "100%",
}: EventTicketFlipCardProps) {
  const color = draft.ticketColor || DEFAULT_TICKET_COLOR;
  const ink = ticketInk(color);
  const muted = ticketMuted(ink);
  const rule = ticketRule(ink);

  return (
    <div
      className={cn("relative", className)}
      style={{
        width,
        height: EVENT_TICKET_HEIGHT,
        perspective: 1400,
      }}
    >
      <div
        role={interactive ? "button" : undefined}
        tabIndex={interactive ? 0 : undefined}
        aria-pressed={interactive ? flipped : undefined}
        aria-label={
          interactive
            ? flipped
              ? "Show ticket front"
              : "Show ticket back"
            : undefined
        }
        aria-hidden={!interactive ? true : undefined}
        onClick={interactive ? onFlipToggle : undefined}
        onKeyDown={
          interactive
            ? (e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  onFlipToggle?.();
                }
              }
            : undefined
        }
        className={cn(
          "relative h-full w-full rounded-[14px] outline-none",
          "transition-transform duration-700 ease-[cubic-bezier(0.4,0.0,0.2,1)]",
          "[transform-style:preserve-3d]",
          interactive &&
            "cursor-pointer focus-visible:ring-2 focus-visible:ring-ink/20",
        )}
        style={{
          transform: flipped ? "rotateX(180deg)" : "rotateX(0deg)",
          transformOrigin: "center center",
        }}
      >
        {/* Front */}
        <div
          aria-hidden={flipped}
          className={cn(
            "absolute inset-0 flex overflow-hidden rounded-[14px]",
            "shadow-[0_12px_40px_-18px_rgba(0,0,0,0.35)]",
            "[backface-visibility:hidden]",
          )}
          style={{
            backgroundColor: color,
            color: ink,
            ...ticketMaskStyle,
          }}
        >
          <div className="flex min-w-0 flex-[1.55] flex-col justify-between px-8 py-8 pr-10">
            <div className="min-w-0 space-y-4">
              <TicketField label="Event" muted={muted}>
                <p className="truncate text-[28px] font-semibold leading-tight tracking-tight">
                  {draft.name.trim() || "Untitled event"}
                </p>
              </TicketField>

              <TicketField label="Time" muted={muted}>
                <p className="truncate text-[15px] font-medium">
                  {formatSubeventTime(draft.startsAt) || "No time"}
                </p>
              </TicketField>

              <TicketField label="Location" muted={muted}>
                {draft.location.name.trim() ? (
                  interactive ? (
                    <a
                      href={
                        typeof draft.location.latitude === "number" &&
                        typeof draft.location.longitude === "number"
                          ? `https://www.google.com/maps/search/?api=1&query=${draft.location.latitude},${draft.location.longitude}`
                          : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(draft.location.name.trim())}`
                      }
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      className="inline-block max-w-full truncate text-[15px] font-medium underline decoration-current/35 underline-offset-2 transition-opacity hover:opacity-80"
                      style={{ color: ink }}
                    >
                      {draft.location.name.trim()}
                    </a>
                  ) : (
                    <p className="truncate text-[15px] font-medium underline decoration-current/35 underline-offset-2">
                      {draft.location.name.trim()}
                    </p>
                  )
                ) : (
                  <p className="truncate text-[15px] font-medium">No location</p>
                )}
              </TicketField>

              <TicketField label="Subevent" muted={muted}>
                <p className="truncate text-[15px] font-medium">{subeventLabel}</p>
              </TicketField>
            </div>
          </div>

          <div
            aria-hidden
            className="relative w-0 shrink-0 self-stretch"
            style={{ borderLeft: `1.5px dashed ${rule}` }}
          />

          <div className="flex w-[210px] shrink-0 flex-col px-6 py-8 sm:w-[240px]">
            <TicketField label="Participant" muted={muted}>
              <p className="truncate text-[18px] font-semibold leading-snug">
                Participant name
              </p>
            </TicketField>

            {interactive ? (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onInspectToggle?.();
                }}
                className={cn(
                  "mt-3 inline-flex h-8 w-fit items-center justify-center rounded-lg px-3 text-[12px] font-semibold transition-colors",
                  inspecting
                    ? "bg-white/25 ring-1 ring-inset ring-white/40"
                    : "bg-black/15 hover:bg-black/25",
                )}
                style={{ color: ink }}
                aria-pressed={inspecting}
              >
                {inspecting ? "Hide inspection" : "Inspection"}
              </button>
            ) : (
              <span
                className={cn(
                  "mt-3 inline-flex h-8 w-fit items-center justify-center rounded-lg px-3 text-[12px] font-semibold",
                  inspecting
                    ? "bg-white/25 ring-1 ring-inset ring-white/40"
                    : "bg-black/15",
                )}
                style={{ color: ink }}
              >
                {inspecting ? "Hide inspection" : "Inspection"}
              </span>
            )}

            <div className="relative mt-3 min-h-0 flex-1 overflow-hidden">
              {!inspecting && (
                <p
                  className="absolute bottom-0 text-[11px] font-medium uppercase tracking-[0.14em]"
                  style={{ color: muted }}
                >
                  Admit one
                </p>
              )}
              {inspecting && (
                <div className="absolute inset-0 flex flex-col">
                  {controlLoading && (
                    <p className="text-[12px]" style={{ color: muted }}>
                      Generating control…
                    </p>
                  )}
                  {controlError && (
                    <p className="text-[12px] text-red-700/90">{controlError}</p>
                  )}
                  {controlPayload && !controlLoading && (
                    <TicketControlVisual
                      payload={controlPayload}
                      className="h-full max-h-full max-w-none min-h-0 flex-1 rounded-lg"
                      compact
                      subevent={
                        primarySubevent
                          ? {
                              name: primarySubevent.name || "Untitled",
                              color:
                                primarySubevent.color || DEFAULT_SUBEVENT_COLOR,
                            }
                          : null
                      }
                    />
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Back */}
        <div
          aria-hidden={!flipped}
          className={cn(
            "absolute inset-0 flex overflow-hidden rounded-[14px]",
            "bg-[#8E8E93] text-white",
            "shadow-[0_12px_40px_-18px_rgba(0,0,0,0.35)]",
            "[backface-visibility:hidden] [transform:rotateX(180deg)]",
          )}
          style={ticketMaskStyle}
        >
          <TicketBackDescriptionInner>
            <TicketBackDescriptionText text={draft.description} />
          </TicketBackDescriptionInner>
        </div>
      </div>
    </div>
  );
}

function TicketField({
  label,
  muted,
  children,
}: {
  label: string;
  muted: string;
  children: ReactNode;
}) {
  return (
    <div className="min-w-0">
      <p
        className="mb-1.5 text-[11px] font-medium uppercase tracking-[0.12em]"
        style={{ color: muted }}
      >
        {label}
      </p>
      {children}
    </div>
  );
}

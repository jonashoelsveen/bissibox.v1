/**
 * Ticket visual control — deterministic daily sitewide rules + HMAC verification.
 * Pure/CPU-only after ticket status is resolved (target ≪ 50ms).
 */

import { createHmac } from "crypto";

export type TicketControlVisualRules = {
  primaryColor: string;
  secondaryColor: string;
  animationType: string;
  animationSpeedSeconds: string;
  dailyControlWord: string;
  dailyIconIdentifier: string;
};

export type TicketControlPayload = {
  ticketId: string;
  controlTimestamp: string;
  visualRules: TicketControlVisualRules;
  verificationHash: string;
};

/** Predefined color pairs — day-of-year indexes into this list (sitewide). */
export const CONTROL_COLOR_PAIRS: ReadonlyArray<{
  primary: string;
  secondary: string;
}> = [
  { primary: "#FF5733", secondary: "#C70039" },
  { primary: "#FF8C00", secondary: "#FF4500" },
  { primary: "#EAB308", secondary: "#CA8A04" },
  { primary: "#22C55E", secondary: "#15803D" },
  { primary: "#06B6D4", secondary: "#0E7490" },
  { primary: "#3B82F6", secondary: "#1D4ED8" },
  { primary: "#8B5CF6", secondary: "#6D28D9" },
  { primary: "#EC4899", secondary: "#BE185D" },
  { primary: "#F43F5E", secondary: "#9F1239" },
  { primary: "#14B8A6", secondary: "#0F766E" },
  { primary: "#A855F7", secondary: "#7E22CE" },
  { primary: "#F97316", secondary: "#C2410C" },
  { primary: "#84CC16", secondary: "#4D7C0F" },
  { primary: "#0EA5E9", secondary: "#0369A1" },
  { primary: "#EF4444", secondary: "#B91C1C" },
  { primary: "#6366F1", secondary: "#4338CA" },
  { primary: "#D946EF", secondary: "#A21CAF" },
  { primary: "#10B981", secondary: "#047857" },
  { primary: "#FB7185", secondary: "#E11D48" },
  { primary: "#38BDF8", secondary: "#0284C7" },
  { primary: "#FACC15", secondary: "#EAB308" },
  { primary: "#4ADE80", secondary: "#16A34A" },
  { primary: "#C084FC", secondary: "#9333EA" },
  { primary: "#FB923C", secondary: "#EA580C" },
  { primary: "#2DD4BF", secondary: "#0D9488" },
  { primary: "#818CF8", secondary: "#4F46E5" },
  { primary: "#F472B6", secondary: "#DB2777" },
  { primary: "#FDE047", secondary: "#FACC15" },
  { primary: "#67E8F9", secondary: "#06B6D4" },
  { primary: "#A3E635", secondary: "#65A30D" },
  { primary: "#FDA4AF", secondary: "#F43F5E" },
];

export const CONTROL_WORDS: readonly string[] = [
  "FJORD",
  "NORD",
  "LYS",
  "STORM",
  "HAV",
  "FJELL",
  "IS",
  "VIND",
  "REGN",
  "SOL",
  "MÅNE",
  "SKOG",
  "ELVE",
  "TIND",
  "BRE",
  "DAL",
  "KYST",
  "ØY",
  "FOS",
  "SNØ",
  "ILD",
  "STEIN",
  "TRÆ",
  "BIRD",
  "ULV",
  "ØRN",
  "LAKS",
  "REIN",
  "POLAR",
  "AURORA",
  "MIDNATT",
];

export const CONTROL_ICONS: readonly string[] = [
  "icon_anchor_04",
  "icon_wave_01",
  "icon_mountain_02",
  "icon_compass_03",
  "icon_ticket_05",
  "icon_shield_06",
  "icon_pulse_07",
  "icon_star_08",
  "icon_boat_09",
  "icon_bridge_10",
  "icon_lantern_11",
  "icon_trail_12",
];

export const CONTROL_ANIMATIONS: ReadonlyArray<{
  type: string;
  speedSeconds: string;
}> = [
  { type: "pulse_wave", speedSeconds: "2.5" },
  { type: "sweep_diagonal", speedSeconds: "2.0" },
  { type: "ripple_expand", speedSeconds: "2.8" },
  { type: "band_scroll", speedSeconds: "1.8" },
  { type: "breathe_glow", speedSeconds: "3.0" },
  { type: "split_flash", speedSeconds: "2.2" },
];

function getControlSecretBase(): string {
  const dedicated = process.env.TICKET_CONTROL_SECRET;
  if (dedicated && dedicated.length >= 16) return dedicated;
  const session = process.env.APONNA_SESSION_SECRET;
  if (session && session.length >= 16) return session;
  if (process.env.NODE_ENV !== "production") {
    return "local-dev-ticket-control-secret";
  }
  throw new Error("TICKET_CONTROL_SECRET (or APONNA_SESSION_SECRET) is missing or too short");
}

/** UTC calendar day key + day-of-year (1–366). */
export function utcDayParts(now = new Date()): {
  dayKey: string;
  dayOfYear: number;
  isoTimestamp: string;
} {
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth();
  const d = now.getUTCDate();
  const start = Date.UTC(y, 0, 0);
  const today = Date.UTC(y, m, d);
  const dayOfYear = Math.floor((today - start) / 86_400_000);
  const dayKey = `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  return { dayKey, dayOfYear, isoTimestamp: now.toISOString().replace(/\.\d{3}Z$/, "Z") };
}

/** Daily rotating HMAC key — changes every UTC calendar day. */
export function rotatingControlKey(dayKey: string): Buffer {
  return createHmac("sha256", getControlSecretBase())
    .update(`ticket-control:${dayKey}`)
    .digest();
}

export function visualRulesForDay(dayOfYear: number): TicketControlVisualRules {
  const pair = CONTROL_COLOR_PAIRS[(dayOfYear - 1) % CONTROL_COLOR_PAIRS.length]!;
  const word = CONTROL_WORDS[(dayOfYear - 1) % CONTROL_WORDS.length]!;
  const icon = CONTROL_ICONS[(dayOfYear - 1) % CONTROL_ICONS.length]!;
  const anim = CONTROL_ANIMATIONS[(dayOfYear - 1) % CONTROL_ANIMATIONS.length]!;
  return {
    primaryColor: pair.primary,
    secondaryColor: pair.secondary,
    animationType: anim.type,
    animationSpeedSeconds: anim.speedSeconds,
    dailyControlWord: word,
    dailyIconIdentifier: icon,
  };
}

export function signTicketControl(opts: {
  ticketId: string;
  controlTimestamp: string;
  visualRules: TicketControlVisualRules;
  dayKey: string;
}): string {
  const { ticketId, controlTimestamp, visualRules, dayKey } = opts;
  const material = [
    ticketId,
    controlTimestamp,
    visualRules.primaryColor,
    visualRules.secondaryColor,
    visualRules.animationType,
    visualRules.animationSpeedSeconds,
    visualRules.dailyControlWord,
    visualRules.dailyIconIdentifier,
    dayKey,
  ].join("|");
  return createHmac("sha256", rotatingControlKey(dayKey))
    .update(material)
    .digest("hex");
}

export function buildTicketControlPayload(
  ticketId: string,
  now = new Date(),
): TicketControlPayload {
  const { dayKey, dayOfYear, isoTimestamp } = utcDayParts(now);
  const visualRules = visualRulesForDay(dayOfYear);
  const verificationHash = signTicketControl({
    ticketId,
    controlTimestamp: isoTimestamp,
    visualRules,
    dayKey,
  });
  return {
    ticketId,
    controlTimestamp: isoTimestamp,
    visualRules,
    verificationHash,
  };
}

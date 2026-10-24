export type ColorValue = string;

export const STANDARD_COLORS_NAMED: { hex: ColorValue; name: string }[] = [
  { hex: "#ef4444", name: "Red" },
  { hex: "#f97316", name: "Orange" },
  { hex: "#eab308", name: "Yellow" },
  { hex: "#22c55e", name: "Green" },
  { hex: "#06b6d4", name: "Cyan" },
  { hex: "#3b82f6", name: "Blue" },
  { hex: "#8b5cf6", name: "Purple" },
  { hex: "#ec4899", name: "Pink" },
  { hex: "#a16207", name: "Brown" },
];

export const STANDARD_COLORS: ColorValue[] = STANDARD_COLORS_NAMED.map((c) => c.hex);
/** Chromatic swatches without Brown (diary / metrics palettes). */
export const STANDARD_COLORS_8: ColorValue[] = STANDARD_COLORS_NAMED.filter(
  (c) => c.name !== "Brown",
).map((c) => c.hex);
/** Default colour for a newly created calendar session (Blue). */
export const SESSION_COLOR_BLUE: ColorValue = "#3b82f6";
export const DEFAULT_SESSION_COLOR: ColorValue = SESSION_COLOR_BLUE;
export const SESSION_COLOR_WHITE: ColorValue = "#ffffff";
/** Palette / stored Black colour (legacy sessions only). */
export const SESSION_COLOR_BLACK: ColorValue = "#2c2c2e";
/** Slightly lighter charcoal for the resting Black session tile. */
export const SESSION_COLOR_BLACK_IDLE: ColorValue = "#3a3a3c";
/** Clicked / active Black session fill. */
export const SESSION_COLOR_BLACK_ACTIVE: ColorValue = "#000000";
/** Grey ink / left rail for White session tiles. */
export const SESSION_WHITE_INK = "#9CA3AF";
/** Clicked / active White session fill — same as the resting grey rail. */
export const SESSION_COLOR_WHITE_ACTIVE: ColorValue = SESSION_WHITE_INK;

function hexEquals(a: string | null | undefined, b: string): boolean {
  return !!a && a.toLowerCase() === b.toLowerCase();
}

export function isSessionWhiteColor(color: string | null | undefined): boolean {
  return hexEquals(color, SESSION_COLOR_WHITE);
}

export function isSessionBlackColor(color: string | null | undefined): boolean {
  return hexEquals(color, SESSION_COLOR_BLACK);
}

export type SessionTileChrome = {
  fill: string;
  fg: string;
  bar: string;
};

/** Fill, title/time, and left rail for a calendar session tile. */
export function sessionTileChrome(
  color: string | null | undefined,
  isActive = false,
): SessionTileChrome {
  const hex = color || DEFAULT_SESSION_COLOR;
  if (isSessionWhiteColor(hex)) {
    return isActive
      ? { fill: SESSION_COLOR_WHITE_ACTIVE, fg: "#ffffff", bar: "#ffffff" }
      : { fill: SESSION_COLOR_WHITE, fg: SESSION_WHITE_INK, bar: SESSION_WHITE_INK };
  }
  if (isSessionBlackColor(hex)) {
    return {
      fill: isActive ? SESSION_COLOR_BLACK_ACTIVE : SESSION_COLOR_BLACK_IDLE,
      fg: "#ffffff",
      bar: "#ffffff",
    };
  }
  return {
    fill: isActive ? hex : `color-mix(in srgb, ${hex} 18%, white)`,
    fg: isActive ? "#ffffff" : hex,
    bar: hex,
  };
}

/**
 * Week and day tile fill. Light theme keeps the white mix above.
 * Dark theme uses the month-chip tint over the canvas, so the same
 * session colour reads the same in every view.
 */
export function sessionWeekDayTileFill(
  color: string | null | undefined,
  isActive = false,
  dark = false,
): string {
  const fill = sessionTileChrome(color, isActive).fill;
  if (
    !dark ||
    isActive ||
    !color ||
    isSessionWhiteColor(color) ||
    isSessionBlackColor(color)
  ) {
    return fill;
  }
  return `linear-gradient(${color}1F, ${color}1F), var(--card)`;
}

/**
 * Co-stripe shared by member team tiles and the member team-session menu.
 * Lighter than the previous #e5e5ea band.
 */
export const TEAM_SESSION_STRIPE_GREY = "#f3f3f6";

/**
 * Member view of a team session. The colour band stays the current tint.
 * The other band is that tint stepped toward a lighter grey. Stripes run
 * from the top-right toward the bottom-left.
 */
export function withTeamSessionStripes(fill: string): string {
  const co = `color-mix(in srgb, ${fill} 68%, ${TEAM_SESSION_STRIPE_GREY})`;
  return `repeating-linear-gradient(135deg, ${fill} 0 6px, ${co} 6px 12px)`;
}

/** Session menu and left panel charcoal. */
const SESSION_MENU_CHARCOAL = "#1c1c1e";
/** One step lighter, so the dark diagonal still reads on that charcoal. */
const SESSION_MENU_STRIPE = "#2a2a2c";

/**
 * Member team-session menu. Light theme is frosted white and a light grey.
 * Dark theme uses the same charcoal as the normal session menu, with a
 * slightly lifted co-stripe so the diagonal stays visible.
 */
export function teamSessionMenuBackground(dark = false): string {
  if (dark) {
    return `repeating-linear-gradient(135deg, ${SESSION_MENU_CHARCOAL} 0 6px, ${SESSION_MENU_STRIPE} 6px 12px)`;
  }
  const white = "color-mix(in oklch, var(--card) 70%, transparent)";
  const grey = `color-mix(in srgb, ${TEAM_SESSION_STRIPE_GREY} 70%, transparent)`;
  return `repeating-linear-gradient(135deg, ${white} 0 6px, ${grey} 6px 12px)`;
}

/** Month-chip fill (12% tint) with White / Black exceptions. */
export function sessionMonthChipChrome(
  color: string | null | undefined,
  isActive = false,
): { backgroundColor: string; color: string; boxShadow: string } {
  const chrome = sessionTileChrome(color, isActive);
  if (isSessionWhiteColor(color) || isSessionBlackColor(color) || !color) {
    return {
      backgroundColor: color ? chrome.fill : "hsl(var(--secondary))",
      color: chrome.fg,
      boxShadow: `inset 3px 0 0 ${chrome.bar}`,
    };
  }
  return {
    backgroundColor: isActive ? color : `${color}1F`,
    color: isActive ? "#ffffff" : color,
    boxShadow: `inset 3px 0 0 ${chrome.bar}`,
  };
}

export function standardColorLabel(hex: string | null | undefined): string {
  if (!hex) return "Blue";
  if (isSessionWhiteColor(hex)) return "White";
  if (isSessionBlackColor(hex)) return "Black";
  const named = STANDARD_COLORS_NAMED.find(
    (c) => c.hex.toLowerCase() === hex.toLowerCase(),
  );
  return named?.name ?? "Custom";
}

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
      boxShadow: `inset 2px 0 0 ${chrome.bar}`,
    };
  }
  return {
    backgroundColor: isActive ? color : `${color}1F`,
    color: isActive ? "#ffffff" : color,
    boxShadow: `inset 2px 0 0 ${chrome.bar}`,
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

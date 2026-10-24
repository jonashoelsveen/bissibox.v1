/**
 * Session-menu field chrome (Notion-style).
 * Idle matches the card. Hover is a thin inset outline. Active/open uses the grey well.
 */
export function sessionPopoverFieldClass(
  active: boolean,
  tone: "light" | "dark" = "light",
) {
  return [
    "rounded-[10px]",
    tone === "dark"
      ? active
        ? "bg-white/[0.10]"
        : "hover:shadow-[inset_0_0_0_1px_rgba(255,255,255,0.18)]"
      : active
        ? "bg-muted/70"
        : "hover:shadow-[inset_0_0_0_1px_var(--session-field-hover-outline)]",
  ].join(" ");
}

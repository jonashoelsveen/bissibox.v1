/**
 * Session-menu field chrome (Notion-style).
 * Idle matches the card. Hover is a thin inset outline. Active/open uses the grey well.
 */
export function sessionPopoverFieldClass(active: boolean) {
  return [
    "rounded-[10px]",
    active
      ? "bg-muted/70"
      : "hover:shadow-[inset_0_0_0_1px_rgba(0,0,0,0.14)]",
  ].join(" ");
}

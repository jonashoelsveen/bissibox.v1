/**
 * Minimal "home" glyph used as the leftmost icon in the top tab bar on
 * the Aponna Cloud home page. Sharp square frame with a horizontal handle
 * near the top — no corner radius. Renders as a stroked SVG so it inherits
 * currentColor.
 */
export function HomeIcon({
  className,
  strokeWidth = 2.2,
}: {
  className?: string;
  strokeWidth?: number;
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="square"
      strokeLinejoin="miter"
      shapeRendering="geometricPrecision"
      aria-hidden="true"
    >
      <rect x="3" y="3" width="18" height="18" />
      <line x1="8" y1="8" x2="14" y2="8" />
    </svg>
  );
}

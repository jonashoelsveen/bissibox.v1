/**
 * Minimal "home" glyph used as the leftmost icon in the top tab bar.
 * A rounded square frame with a small horizontal handle near the top,
 * rendered as a clean stroked SVG so it inherits currentColor.
 */
export function HomeIcon({
  className,
  strokeWidth = 1.6,
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
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="3.25" y="3.25" width="17.5" height="17.5" rx="3" />
      <line x1="9" y1="7.75" x2="15" y2="7.75" />
    </svg>
  );
}

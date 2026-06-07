/**
 * Single-building glyph used for the "Organization" app tile in the
 * apps menu. Matches the lucide outline weight used for Calendar / Diary /
 * Photos (strokeWidth ~1.75). Shows a tall building with a centered door
 * and two rows of two windows above.
 */
export function OrganizationIcon({
  className,
  strokeWidth = 1.75,
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
      {/* building outline */}
      <rect x="5" y="3" width="14" height="18" rx="0.5" />
      {/* centered door at the bottom */}
      <path d="M10.5 21V16h3v5" />
      {/* row of windows (top) */}
      <line x1="8" y1="7" x2="9.5" y2="7" />
      <line x1="14.5" y1="7" x2="16" y2="7" />
      {/* row of windows (middle) */}
      <line x1="8" y1="11" x2="9.5" y2="11" />
      <line x1="14.5" y1="11" x2="16" y2="11" />
    </svg>
  );
}

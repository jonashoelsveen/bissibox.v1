/**
 * Single-building glyph used for the Entity app tile and entity profile
 * rows. Matches the lucide outline weight used for Calendar / Events
 * (strokeWidth ~1.75). Tall building with a centered door and two rows of
 * three narrow windows above.
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
      {/* row of windows (top) — three narrow windows taller than wide */}
      <rect x="7.5" y="6" width="1" height="2" rx="0.25" />
      <rect x="11.5" y="6" width="1" height="2" rx="0.25" />
      <rect x="15.5" y="6" width="1" height="2" rx="0.25" />
      {/* row of windows (middle) */}
      <rect x="7.5" y="10.5" width="1" height="2" rx="0.25" />
      <rect x="11.5" y="10.5" width="1" height="2" rx="0.25" />
      <rect x="15.5" y="10.5" width="1" height="2" rx="0.25" />
    </svg>
  );
}

import { useId } from "react";

const PERIWINKLE = "#8E8CF0";

/** Same member silhouette as organization person rows. */
function MemberGlyph() {
  return (
    <>
      <circle cx="8" cy="3.85" r="3.1" />
      <path d="M3.15 13.35A4.85 4.85 0 0 1 12.85 13.35L12.85 14H3.15v-.65Z" />
    </>
  );
}

/**
 * Group mark: a full member, and a slightly smaller member on the right.
 * A gap following the front figure's outline keeps them apart. The smaller
 * head stays fully visible, and the smaller body's left edge follows that gap.
 */
export function GroupMembersIcon({
  className = "h-4 w-4 shrink-0",
}: {
  className?: string;
}) {
  const maskId = `group-member-gap-${useId().replace(/:/g, "")}`;
  const front = "scale(0.94) translate(-3.15 -0.75)";
  return (
    <svg viewBox="-0.45 -1.35 15.4 15.4" aria-hidden className={className}>
      <defs>
        <mask id={maskId} maskUnits="userSpaceOnUse" x="-4" y="-4" width="24" height="24">
          <rect x="-4" y="-4" width="24" height="24" fill="white" />
          <g fill="black" transform={front}>
            <circle cx="8" cy="13.35" r="5.28" />
          </g>
        </mask>
      </defs>
      <g
        fill={PERIWINKLE}
        mask={`url(#${maskId})`}
        transform="translate(6.55 1.59) scale(0.82) translate(-3.15 -0.75)"
      >
        <MemberGlyph />
      </g>
      <g fill={PERIWINKLE} transform={front}>
        <MemberGlyph />
      </g>
    </svg>
  );
}

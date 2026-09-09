/**
 * Aponna brand mark for top tab bars (Cloud + Account).
 * Sourced from Proton Drive/Aponna/icon4.svg.
 */

import {
  TOP_BAR_BRAND_LABEL_CLASS,
  topBarBrandLabelStyle,
} from "@/lib/cloud-landing-design";

export const TOP_BAR_BRAND_ICON_CLASS = "h-[30px] w-[30px]";

export function HomeIcon({ className = TOP_BAR_BRAND_ICON_CLASS }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 216 234"
      preserveAspectRatio="xMidYMid meet"
      className={className}
      aria-hidden="true"
    >
      <g transform="translate(0,234) scale(0.1,-0.1)" fill="currentColor" stroke="none">
        <path d="M180 2110 l0 -90 650 0 650 0 0 90 0 90 -650 0 -650 0 0 -90z" />
        <path d="M190 990 l0 -880 880 0 880 0 0 880 0 880 -880 0 -880 0 0 -880z" />
      </g>
    </svg>
  );
}

/** Standard top-tab-bar brand mark — shared by cloud and account surfaces. */
export function TopBarBrandMark({
  className = TOP_BAR_BRAND_ICON_CLASS,
}: {
  className?: string;
  strokeWidth?: number;
}) {
  return <HomeIcon className={className} />;
}

/** Brand mark + optional surface label (e.g. Account) in minimal top tab bars. */
export function TopBarBrandTitle({
  label,
  onClick,
  ariaLabel,
}: {
  label?: string;
  onClick?: () => void;
  ariaLabel?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={ariaLabel ?? label}
      className="flex shrink-0 cursor-pointer items-center gap-1 border-0 bg-transparent p-0 text-[#1d1d1f]"
      style={label ? topBarBrandLabelStyle : undefined}
    >
      <TopBarBrandMark />
      {label ? (
        <span className={TOP_BAR_BRAND_LABEL_CLASS} style={topBarBrandLabelStyle}>
          {label}
        </span>
      ) : null}
    </button>
  );
}

/** Clickable home/brand control used in minimal top tab bars. */
export function TopBarBrandButton({
  onClick,
  ariaLabel = "Home",
}: {
  onClick?: () => void;
  ariaLabel?: string;
}) {
  return (
    <button
      type="button"
      aria-label={ariaLabel}
      onClick={onClick}
      className="flex items-center justify-center text-[#1d1d1f] hover:bg-black/5"
      style={{ height: 34, width: 34 }}
    >
      <TopBarBrandMark />
    </button>
  );
}

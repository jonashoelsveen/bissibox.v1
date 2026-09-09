import Svg, { Circle, Path } from "react-native-svg";

export function PeriwinkleFolderIcon({ size = 16 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 16 16" aria-hidden>
      <Path
        d="M1.5 3.25C1.5 2.56 2.06 2 2.75 2h3.05l1.2 1.2h6.25c.69 0 1.25.56 1.25 1.25v7.3c0 .69-.56 1.25-1.25 1.25H2.75c-.69 0-1.25-.56-1.25-1.25V3.25Z"
        fill="#8E8CF0"
      />
      <Path
        d="M1.5 4.75h13v6.05c0 .69-.56 1.25-1.25 1.25H2.75c-.69 0-1.25-.56-1.25-1.25V4.75Z"
        fill="#A5A3F5"
      />
    </Svg>
  );
}

/** Filled user silhouette — light grey for every person row (matches web). */
export function OverviewUserIcon({ color, size = 14 }: { color: string; size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 16 16" aria-hidden>
      <Circle cx="8" cy="3.85" r="3.1" fill={color} />
      <Path d="M3.15 13.35A4.85 4.85 0 0 1 12.85 13.35L12.85 14H3.15v-.65Z" fill={color} />
    </Svg>
  );
}

export const ADMIN_USER_ICON_COLOR = "#3C3C43";
export const MEMBER_USER_ICON_COLOR = "#AEAEB2";

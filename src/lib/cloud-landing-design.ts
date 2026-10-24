import type { CSSProperties } from "react";

export const CLOUD_PAGE_BG = "#fafafa";

/** Shared top tab bar (cloud landing chrome, account landing, and platform). */
export const MINIMAL_TOP_TAB_BAR_HEIGHT = 48;
export const MINIMAL_TOP_TAB_BAR_PADDING_X = 16;

export const minimalTopTabBarShellStyle = {
  backgroundColor: CLOUD_PAGE_BG,
  height: MINIMAL_TOP_TAB_BAR_HEIGHT,
  paddingLeft: MINIMAL_TOP_TAB_BAR_PADDING_X,
  paddingRight: MINIMAL_TOP_TAB_BAR_PADDING_X,
} as const;

export const CLOUD_FOOTER_BG = "#f5f5f7";

/** Shared max width for account top bar + page content. */
export const ACCOUNT_PAGE_MAX_WIDTH = 980;

export const HELVETICA_STACK =
  '-apple-system, BlinkMacSystemFont, "Helvetica Neue", Helvetica, Arial, sans-serif';

/**
 * Strong periwinkle for Active profile / membership status.
 * Distinct from the pale Training tile (#B8B8FF), which is too light for labels.
 */
export const ACTIVE_STATUS_COLOR = "#5C5CFF";

/** Vertical nudge for Cloud / Account labels beside the brand icon. */
export const TOP_BAR_BRAND_LABEL_CLASS = "relative top-0.5";

export const topBarBrandLabelStyle: CSSProperties = {
  fontFamily: HELVETICA_STACK,
  fontSize: 22,
  fontWeight: 600,
  letterSpacing: "-0.01em",
  lineHeight: 1,
  whiteSpace: "nowrap",
};

/** Bissibox Cloud / Account hero display width. Other heroes use this width times their scale. */
export const HERO_ILLUSTRATION_DISPLAY_PX = 576;
export const HERO_ILLUSTRATION_DISPLAY_VW = 111.6;

/** Half of 1280×800 WXGA — the standard 13" laptop CSS width (Tailwind `sm`). */
export const BISSIBOX_DESKTOP_MIN_PX = 640;

export const BISSIBOX_COMPACT_SCREEN_NOTICE =
  "Bissibox is an intuitive calendar that helps you organize your every day life. With an overview of future activities you are always prepared.";

export const CLOUD_LANDING_CHROME_PATHS = ["/", "/cloud/individuals", "/cloud/entities"] as const;

export function isCloudLandingChromePath(path: string) {
  return (CLOUD_LANDING_CHROME_PATHS as readonly string[]).includes(path);
}

export const landingHeroPadding = {
  paddingTop: "clamp(120px, 22vh, 240px)",
  paddingBottom: "clamp(120px, 22vh, 240px)",
} as const;

/** Compact top pad when a hero illustration sits above the title. */
export const LANDING_COMPACT_ILLUSTRATION_PAD_TOP = "clamp(40px, 7vh, 80px)";

/** Light space under the upper Sign in before the black band (midpoint of original and tight). */
export const LANDING_DARK_BAND_GAP_ABOVE = `calc((48px + ${landingHeroPadding.paddingBottom}) / 2)`;

export const landingHeroTitleStyle: CSSProperties = {
  fontFamily: HELVETICA_STACK,
  fontSize: "clamp(56px, 9vw, 112px)",
  lineHeight: 1.02,
  letterSpacing: "-0.04em",
  fontWeight: 600,
  color: "#1d1d1f",
};

export const landingAccountTitleStyle: CSSProperties = {
  fontFamily: HELVETICA_STACK,
  fontSize: "clamp(40px, 6vw, 72px)",
  lineHeight: 1.05,
  letterSpacing: "-0.03em",
  fontWeight: 600,
  color: "#1d1d1f",
};

export const landingHeroBodyStyle: CSSProperties = {
  fontFamily: HELVETICA_STACK,
  fontSize: "clamp(17px, 1.4vw, 21px)",
  fontWeight: 400,
  color: "#1d1d1f",
};

export const landingMutedBodyStyle: CSSProperties = {
  fontFamily: HELVETICA_STACK,
  fontSize: "clamp(17px, 1.4vw, 21px)",
  fontWeight: 400,
  color: "#6e6e73",
};

/** Apple-style pill radius for Sign in buttons (capsule ends at any button height). */
export const SIGN_IN_BUTTON_BORDER_RADIUS = 980;

/** Same black as the Sign in button — entities home band. */
export const LANDING_DARK_SECTION_BG = "#1d1d1f";

export const landingPrimaryButtonStyle: CSSProperties = {
  backgroundColor: LANDING_DARK_SECTION_BG,
  borderRadius: SIGN_IN_BUTTON_BORDER_RADIUS,
  padding: "14px 36px",
  fontFamily: HELVETICA_STACK,
  fontSize: 17,
  fontWeight: 500,
  letterSpacing: "-0.01em",
  color: "#ffffff",
};

/** Same Sign in pill, sized for the 48px top tab bar. */
export const landingPrimaryButtonCompactStyle: CSSProperties = {
  ...landingPrimaryButtonStyle,
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  height: 32,
  padding: "0 18px",
  fontSize: 14,
  lineHeight: 1,
};

export const landingPrimaryButtonOnDarkStyle: CSSProperties = {
  ...landingPrimaryButtonStyle,
  backgroundColor: "#ffffff",
  color: LANDING_DARK_SECTION_BG,
};

/** Inline “Read more” on cloud landing hero lines — underline hides on hover. */
export const landingReadMoreClassName = "underline hover:no-underline";

export function landingHeroSectionPadding(
  compactTop = false,
  /** Extra top space so a hero illustration can sit above the title. */
  withHeroIllustration = false,
): CSSProperties {
  let paddingTop: string = landingHeroPadding.paddingTop;
  if (compactTop && withHeroIllustration) {
    paddingTop = LANDING_COMPACT_ILLUSTRATION_PAD_TOP;
  } else if (compactTop) {
    paddingTop = "clamp(48px, 8vh, 96px)";
  } else if (withHeroIllustration) {
    // Less empty pad above the art; title sits below the illustration.
    paddingTop = "clamp(56px, 10vh, 120px)";
  }
  return {
    paddingTop,
    paddingBottom: landingHeroPadding.paddingBottom,
  };
}

export const accountNavLabelStyle: CSSProperties = {
  fontFamily: HELVETICA_STACK,
  fontSize: 17,
  fontWeight: 400,
  color: "#1d1d1f",
};

export const accountNavActiveStyle: CSSProperties = {
  ...accountNavLabelStyle,
  fontWeight: 600,
};

export const accountNavSignOutStyle: CSSProperties = {
  ...accountNavLabelStyle,
  color: "#ff3b30",
};

export const accountSectionTitleStyle: CSSProperties = {
  fontFamily: HELVETICA_STACK,
  fontSize: 28,
  fontWeight: 600,
  letterSpacing: "-0.02em",
  color: "#1d1d1f",
};

export const accountSectionBodyStyle: CSSProperties = {
  fontFamily: HELVETICA_STACK,
  fontSize: 17,
  fontWeight: 400,
  lineHeight: 1.5,
  color: "#6e6e73",
};

/** Apple-style account form fields — shared corner radius on all controls. */
export const ACCOUNT_FIELD_BORDER_RADIUS = 10;

export const accountFieldLabelStyle: CSSProperties = {
  fontFamily: HELVETICA_STACK,
  fontSize: 12,
  fontWeight: 600,
  letterSpacing: "0.04em",
  textTransform: "uppercase",
  color: "#1d1d1f",
};

export const accountFieldControlStyle: CSSProperties = {
  fontFamily: HELVETICA_STACK,
  fontSize: 17,
  fontWeight: 400,
  color: "#1d1d1f",
  backgroundColor: "#e5e5ea",
  borderRadius: ACCOUNT_FIELD_BORDER_RADIUS,
  border: "none",
  width: "100%",
  height: 36,
  padding: "0 12px",
  lineHeight: "36px",
  boxSizing: "border-box",
  outline: "none",
  WebkitAppearance: "none",
  appearance: "none",
};

export const accountHeaderActionStyle: CSSProperties = {
  fontFamily: HELVETICA_STACK,
  fontSize: 17,
  fontWeight: 400,
  color: "#0066cc",
  background: "none",
  border: "none",
  padding: 0,
  cursor: "pointer",
};

import { Platform } from "react-native";

const ANDROID_ICON_ONLY = {
  tabBarItemLabelVisibilityMode: "unlabeled" as const,
  tabBarItemActiveIndicatorEnabled: false,
};

export const NATIVE_TAB_APPEARANCE = {
  android: ANDROID_ICON_ONLY,
};

export const TEAM_TAB_ICONS = {
  ios: {
    icon: { type: "sfSymbol" as const, name: "person.2" },
    selectedIcon: { type: "sfSymbol" as const, name: "person.2.fill" },
  },
  android: {
    icon: { type: "drawableResource" as const, name: "ic_tab_team" },
    selectedIcon: { type: "drawableResource" as const, name: "ic_tab_team" },
  },
};

export const CALENDAR_TAB_ICONS = {
  ios: {
    icon: { type: "sfSymbol" as const, name: "calendar" },
    selectedIcon: { type: "sfSymbol" as const, name: "calendar" },
  },
  android: {
    icon: { type: "drawableResource" as const, name: "ic_tab_calendar" },
    selectedIcon: { type: "drawableResource" as const, name: "ic_tab_calendar" },
  },
};

export const PROFILE_TAB_ICONS = {
  ios: {
    icon: { type: "sfSymbol" as const, name: "person.crop.circle" },
    selectedIcon: { type: "sfSymbol" as const, name: "person.crop.circle.fill" },
  },
  android: {
    icon: { type: "drawableResource" as const, name: "ic_tab_profile" },
    selectedIcon: { type: "drawableResource" as const, name: "ic_tab_profile" },
  },
};

export function tabScreenIcons(iconSet: typeof CALENDAR_TAB_ICONS) {
  return {
    ios: iconSet.ios,
    android: {
      ...iconSet.android,
      standardAppearance: NATIVE_TAB_APPEARANCE.android,
    },
  };
}

/** Content height of the native tab bar (safe area is additional). */
export function nativeTabBarContentHeight() {
  return Platform.OS === "android" ? 64 : 49;
}

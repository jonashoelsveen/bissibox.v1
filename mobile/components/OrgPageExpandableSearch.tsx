import { Search } from "lucide-react-native";
import { memo, useEffect, useMemo, useRef, useState } from "react";
import {
  Animated,
  Pressable,
  StyleSheet,
  TextInput,
  View,
} from "react-native";
import { ORG_ACTION_BUTTON_SIZE } from "@/components/OrgPageActionMenu";
import { SearchFieldTextClearButton } from "@/components/RosterSearchField";
import { GlassChrome } from "@/components/GlassChrome";
import { useTheme, type ThemeMode } from "@/lib/theme";

export const ORG_SEARCH_BUTTON_SIZE = ORG_ACTION_BUTTON_SIZE;
const ICON_SIZE = 20;
const ICON_SLOT = 24;
const PILL_PAD_LEFT = 14;
const ICON_GAP = 10;
const CLEAR_BTN_SIZE = 20;
const CLEAR_TRAILING_INSET = 18;
const ICON_LEFT_COLLAPSED = (ORG_SEARCH_BUTTON_SIZE - ICON_SLOT) / 2;
/** Progress thresholds — ordered so overlay lifts before field accepts input/text. */
const OVERLAY_OFF_AT = 0.05;
const FIELD_INTERACTIVE_AT = 0.14;
const FIELD_VISIBLE_AT = 0.38;
const FOCUS_AT = 0.4;

function searchFieldClearColors(mode: ThemeMode) {
  if (mode === "light") {
    return { fill: "#636366", icon: "#FFFFFF" };
  }
  return { fill: "rgba(120,120,128,0.85)", icon: "#FFFFFF" };
}

function readAnimProgress(anim: Animated.Value): number {
  const legacy = anim as Animated.Value & { __getValue?: () => number };
  return typeof legacy.__getValue === "function" ? legacy.__getValue() : 0;
}

/**
 * Liquid-glass search control: round icon button that springs open to a pill,
 * expanding right until it meets the top-right × button.
 */
export function OrgPageExpandableSearch(props: {
  value: string;
  onChange: (value: string) => void;
  onActivate: () => void;
  active: boolean;
  searchModeAnim: Animated.Value;
  placeholder: string;
  borderRadius?: number;
  /** Width when fully open (row width minus the + spacer and gap). */
  expandedWidth: number;
}) {
  return <OrgPageExpandableSearchInner {...props} />;
}

const OrgPageExpandableSearchInner = memo(function OrgPageExpandableSearchInner({
  value,
  onChange,
  onActivate,
  active,
  searchModeAnim,
  placeholder,
  borderRadius = 24,
  expandedWidth,
}: {
  value: string;
  onChange: (value: string) => void;
  onActivate: () => void;
  active: boolean;
  searchModeAnim: Animated.Value;
  placeholder: string;
  borderRadius?: number;
  expandedWidth: number;
}) {
  const inputRef = useRef<TextInput>(null);
  const focusRequestedRef = useRef(false);
  const { C, mode } = useTheme();
  const [overlayActive, setOverlayActive] = useState(true);
  const [fieldInteractive, setFieldInteractive] = useState(false);
  const fontSize = 17;
  const collapsedWidth = ORG_SEARCH_BUTTON_SIZE;
  const openWidth = Math.max(collapsedWidth, expandedWidth);
  const clearColors = searchFieldClearColors(mode);
  const showClear = active && value.length > 0;
  const fieldPointerEvents = active && !overlayActive ? "auto" : "none";

  const handleClear = () => {
    onChange("");
    inputRef.current?.focus();
  };

  useEffect(() => {
    focusRequestedRef.current = false;

    if (!active) {
      setOverlayActive(true);
      setFieldInteractive(false);
      return;
    }

    let overlay = true;
    let interactive = false;

    const applyProgress = (progress: number) => {
      const nextOverlay = progress < OVERLAY_OFF_AT;
      const nextInteractive = progress > FIELD_INTERACTIVE_AT;

      if (nextOverlay !== overlay) {
        overlay = nextOverlay;
        setOverlayActive(nextOverlay);
      }
      if (nextInteractive !== interactive) {
        interactive = nextInteractive;
        setFieldInteractive(nextInteractive);
      }
      if (progress >= FOCUS_AT && !focusRequestedRef.current) {
        focusRequestedRef.current = true;
        inputRef.current?.focus();
      }
    };

    const listenerId = searchModeAnim.addListener(({ value: progress }) => applyProgress(progress));
    applyProgress(readAnimProgress(searchModeAnim));

    return () => searchModeAnim.removeListener(listenerId);
  }, [active, searchModeAnim]);

  const width = useMemo(
    () =>
      searchModeAnim.interpolate({
        inputRange: [0, 1],
        outputRange: [collapsedWidth, openWidth],
        extrapolate: "clamp",
      }),
    [searchModeAnim, collapsedWidth, openWidth],
  );

  const radius = useMemo(
    () =>
      searchModeAnim.interpolate({
        inputRange: [0, 1],
        outputRange: [collapsedWidth / 2, borderRadius],
        extrapolate: "clamp",
      }),
    [searchModeAnim, collapsedWidth, borderRadius],
  );

  const fieldOpacity = useMemo(
    () =>
      searchModeAnim.interpolate({
        inputRange: [0, FIELD_VISIBLE_AT, 1],
        outputRange: [0, 0, 1],
        extrapolate: "clamp",
      }),
    [searchModeAnim],
  );

  const iconLeft = useMemo(
    () =>
      searchModeAnim.interpolate({
        inputRange: [0, 1],
        outputRange: [ICON_LEFT_COLLAPSED, PILL_PAD_LEFT],
        extrapolate: "clamp",
      }),
    [searchModeAnim],
  );

  const foreground = (
    <View pointerEvents="box-none" style={styles.foreground}>
      <Animated.View
        pointerEvents="none"
        style={{
          position: "absolute",
          left: iconLeft,
          top: 0,
          bottom: 0,
          width: ICON_SLOT,
          justifyContent: "center",
          alignItems: "center",
        }}
      >
        <Search size={ICON_SIZE} color={C.text} strokeWidth={2.35} />
      </Animated.View>

      <Animated.View
        pointerEvents={fieldPointerEvents}
        style={{
          flex: 1,
          flexDirection: "row",
          alignItems: "center",
          paddingLeft: PILL_PAD_LEFT,
          paddingRight: showClear ? CLEAR_BTN_SIZE + CLEAR_TRAILING_INSET + 4 : 10,
          height: ORG_SEARCH_BUTTON_SIZE,
          opacity: fieldOpacity,
        }}
      >
        <View style={{ width: ICON_SIZE + ICON_GAP, flexShrink: 0 }} />
        <TextInput
          ref={inputRef}
          value={value}
          onChangeText={onChange}
          onFocus={onActivate}
          placeholder={fieldInteractive ? placeholder : ""}
          placeholderTextColor={C.secondary}
          autoCapitalize="none"
          autoCorrect={false}
          clearButtonMode="never"
          returnKeyType="search"
          style={{
            flex: 1,
            minWidth: 0,
            paddingVertical: 0,
            color: C.text,
            fontSize,
            height: ORG_SEARCH_BUTTON_SIZE,
            transform: [{ translateY: -1 }],
          }}
        />
      </Animated.View>

      {showClear ? (
        <Animated.View
          pointerEvents={fieldPointerEvents}
          style={[styles.clearSlot, { opacity: fieldOpacity }]}
        >
          <SearchFieldTextClearButton
            onPress={handleClear}
            fill={clearColors.fill}
            iconColor={clearColors.icon}
            size={CLEAR_BTN_SIZE}
          />
        </Animated.View>
      ) : null}
    </View>
  );

  return (
    <Animated.View
      style={{
        width,
        height: ORG_SEARCH_BUTTON_SIZE,
        borderRadius: radius,
        overflow: "hidden",
        zIndex: 12,
        elevation: 12,
        flexShrink: 0,
      }}
    >
      <GlassChrome.Lens
        shape={active ? "capsule" : "circle"}
        cornerRadius={borderRadius}
        layout="fill"
        interactive
        style={StyleSheet.absoluteFill}
      >
        {foreground}
        {overlayActive ? (
          <Pressable
            onPress={onActivate}
            accessibilityRole="button"
            accessibilityLabel="Search"
            style={[StyleSheet.absoluteFill, styles.tapOverlay]}
          />
        ) : null}
      </GlassChrome.Lens>
    </Animated.View>
  );
});

const styles = StyleSheet.create({
  foreground: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 2,
    elevation: 2,
  },
  clearSlot: {
    position: "absolute",
    right: CLEAR_TRAILING_INSET,
    top: 0,
    bottom: 0,
    width: CLEAR_BTN_SIZE,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 50,
    elevation: 50,
  },
  tapOverlay: {
    zIndex: 1,
  },
});

export const ORG_PAGE_HEADER_BUTTON_TOP = 4;

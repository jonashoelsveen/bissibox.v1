import { Search, X } from "lucide-react-native";
import {
  GlassControlShell,
} from "@/components/glass/GlassChrome";
import {
  Animated,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { useTheme, type ThemeMode } from "@/lib/theme";

const CANCEL_SLOT_GAP = 8;
/** Match typed text inset inside the vipps search pill. */
const VIPPS_PLACEHOLDER_OFFSET_Y = 4.5;

function vippsCompactPillHeight(compact: boolean) {
  return compact ? 42 : 50;
}

function vippsCancelButtonSize(compact: boolean, matchPillHeight = false) {
  if (matchPillHeight) return vippsCompactPillHeight(compact);
  return compact ? 36 : 40;
}

function vippsSearchStyle(mode: ThemeMode) {
  if (mode === "light") {
    return {
      fill: "rgba(255,255,255,0.88)",
      border: "rgba(0,0,0,0.05)",
      icon: "#000000",
      placeholder: "#8E8E93",
      fontSize: 17,
      iconSize: 19,
      cancelFill: "#FFFFFF",
      cancelFillPressed: "#FFFFFF",
      cancelIcon: "#3C3C43",
      inlineClearFill: "#636366",
      inlineClearIcon: "#FFFFFF",
    };
  }
  return {
    fill: "rgba(255,255,255,0.18)",
    border: "rgba(255,255,255,0.08)",
    icon: "#FFFFFF",
    placeholder: "#8E8E93",
    fontSize: 17,
    iconSize: 19,
    cancelFill: "#2E2E2E",
    cancelFillPressed: "#2E2E2E",
    cancelIcon: "#FFFFFF",
    inlineClearFill: "rgba(120,120,128,0.85)",
    inlineClearIcon: "#FFFFFF",
  };
}

export function SearchFieldTextClearButton({
  onPress,
  fill,
  iconColor,
  size,
}: {
  onPress: () => void;
  fill: string;
  iconColor: string;
  size: number;
}) {
  const iconSize = Math.round(size * 0.52);

  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.72}
      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      accessibilityRole="button"
      accessibilityLabel="Clear search text"
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: fill,
        flexShrink: 0,
      }}
    >
      <X size={iconSize} color={iconColor} strokeWidth={2.75} />
    </TouchableOpacity>
  );
}

function NativeCircleCancelButton({
  onPress,
  fill,
  fillPressed,
  borderColor,
  iconColor,
  size,
  iconSize,
  shadowStyle,
}: {
  onPress?: () => void;
  fill: string;
  fillPressed: string;
  borderColor: string;
  iconColor: string;
  size: number;
  iconSize: number;
  shadowStyle?: ViewStyle;
}) {
  const radius = size / 2;
  const icon = <X size={iconSize} color={iconColor} strokeWidth={2.75} />;

  return (
    <Pressable
      onPress={onPress}
      hitSlop={6}
      accessibilityRole="button"
      accessibilityLabel="Close search"
      android_ripple={
        Platform.OS === "android"
          ? { color: "rgba(0,0,0,0.12)", borderless: true, radius }
          : undefined
      }
      style={({ pressed }) => ({
        width: size,
        height: size,
        borderRadius: radius,
        overflow: "hidden",
        transform: [{ scale: pressed ? 0.94 : 1 }],
        ...shadowStyle,
      })}
    >
      {({ pressed }) => (
        <View
          style={{
            width: size,
            height: size,
            borderRadius: radius,
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: pressed ? fillPressed : fill,
            borderWidth: 1,
            borderColor,
          }}
        >
          {icon}
        </View>
      )}
    </Pressable>
  );
}

export function vippsSearchCancelSlot(compact: boolean) {
  return vippsCompactPillHeight(compact) + CANCEL_SLOT_GAP;
}

/** @deprecated use vippsSearchCancelSlot(compact) */
export const VIPPS_SEARCH_CANCEL_SLOT = vippsSearchCancelSlot(true);

export function RosterSearchField({
  value,
  onChange,
  onFocus,
  onActivate,
  onCancel,
  active = false,
  searchModeAnim,
  placeholder = "Search members",
  compact = false,
  borderRadius = 16,
  containerStyle,
  variant = "default",
  hideCancelButton = false,
  trailingActionInset,
}: {
  value: string;
  onChange: (value: string) => void;
  onFocus?: () => void;
  onActivate?: () => void;
  onCancel?: () => void;
  active?: boolean;
  searchModeAnim?: Animated.Value;
  placeholder?: string;
  compact?: boolean;
  borderRadius?: number;
  containerStyle?: StyleProp<ViewStyle>;
  variant?: "default" | "vipps" | "glass";
  /** When true, omits the trailing cancel control (e.g. org page uses the top-right +/×). */
  hideCancelButton?: boolean;
  /** Animates container right inset when search opens (pairs with top-right action button). */
  trailingActionInset?: number;
}) {
  const { C, mode } = useTheme();
  const isGlass = variant === "glass";
  const isVippsLike = variant === "vipps" || isGlass;
  const vipps = isVippsLike ? vippsSearchStyle(mode) : null;
  const useSearchModeAnim = isVippsLike && searchModeAnim != null;
  const useAnimatedCancel = useSearchModeAnim && !hideCancelButton;
  const pillHeight = vippsCompactPillHeight(compact);
  const cancelBtnSize =
    isVippsLike ? pillHeight : vippsCancelButtonSize(compact);
  const cancelIconSize =
    isVippsLike ? Math.round(cancelBtnSize / 2) : compact ? 18 : 20;
  const inputPadV = compact ? 10 : 14;
  const fontSize = vipps?.fontSize ?? (compact ? 15 : 16);
  const iconSize = vipps?.iconSize ?? (compact ? 17 : 18);
  const showInlineTextClear = isVippsLike && value.length > 0;
  const textClearSize = compact ? 20 : 22;
  const inlineClearSlotWidth = isVippsLike ? textClearSize : 0;
  const pillPaddingRight = isVippsLike ? 8 : 12;
  const useVippsPlaceholderOverlay = isVippsLike;

  const cancelGapMargin = useAnimatedCancel
    ? searchModeAnim.interpolate({
        inputRange: [0, 1],
        outputRange: [0, CANCEL_SLOT_GAP],
      })
    : active
      ? CANCEL_SLOT_GAP
      : 0;

  const cancelWrapWidth = useAnimatedCancel
    ? searchModeAnim.interpolate({
        inputRange: [0, 1],
        outputRange: [0, cancelBtnSize],
      })
    : active
      ? cancelBtnSize
      : 0;

  const cancelOpacity = useAnimatedCancel
    ? searchModeAnim.interpolate({
        inputRange: [0, 0.18, 1],
        outputRange: [0, 0, 1],
      })
    : active
      ? 1
      : 0;

  const cancelScale = useAnimatedCancel
    ? searchModeAnim.interpolate({
        inputRange: [0, 0.22, 1],
        outputRange: [0.55, 0.55, 1],
      })
    : active
      ? 1
      : 0.55;

  const paddingTop = useSearchModeAnim
    ? searchModeAnim!.interpolate({
        inputRange: [0, 1],
        outputRange: [8, 10],
      })
    : active
      ? 10
      : 8;

  const paddingRight =
    useSearchModeAnim && hideCancelButton && trailingActionInset != null
      ? searchModeAnim!.interpolate({
          inputRange: [0, 1],
          outputRange: [12, trailingActionInset],
        })
      : useSearchModeAnim
        ? 16
        : 12;

  const handleFocus = () => {
    onFocus?.();
    onActivate?.();
  };

  const textClearButton = showInlineTextClear ? (
    <SearchFieldTextClearButton
      onPress={() => onChange("")}
      fill={vipps?.inlineClearFill ?? "#636366"}
      iconColor={vipps?.inlineClearIcon ?? "#FFFFFF"}
      size={textClearSize}
    />
  ) : null;

  const inlineClearSlot =
    isVippsLike ? (
      <View
        pointerEvents="none"
        style={{
          width: inlineClearSlotWidth,
          flexShrink: 0,
          alignSelf: "center",
        }}
      />
    ) : null;

  const inlineClearOverlay =
    isVippsLike ? (
      <View
        pointerEvents="box-none"
        style={{
          position: "absolute",
          right: pillPaddingRight,
          top: 0,
          bottom: 0,
          width: inlineClearSlotWidth,
          alignItems: "center",
          justifyContent: "center",
          zIndex: 10,
          elevation: 10,
        }}
      >
        {textClearButton}
      </View>
    ) : null;

  const pillBody = (
    <>
      <Search
        size={iconSize}
        color={isGlass ? C.secondary : (vipps?.icon ?? C.secondary)}
        style={{ marginRight: 10, flexShrink: 0 }}
      />
      <View
        style={{
          flex: 1,
          minWidth: 0,
          height: pillHeight,
          justifyContent: "center",
          overflow: "hidden",
        }}
      >
        <TextInput
          value={value}
          onChangeText={onChange}
          onFocus={handleFocus}
          placeholder={useVippsPlaceholderOverlay ? "" : placeholder}
          placeholderTextColor={vipps?.placeholder ?? C.secondary}
          autoCapitalize="none"
          autoCorrect={false}
          clearButtonMode="never"
          returnKeyType="search"
          style={{
            width: "100%",
            paddingVertical: inputPadV,
            color: C.text,
            fontSize,
          }}
        />
        {useVippsPlaceholderOverlay ? (
          <Text
            pointerEvents="none"
            numberOfLines={1}
            style={{
              position: "absolute",
              left: 0,
              right: 0,
              top: inputPadV + VIPPS_PLACEHOLDER_OFFSET_Y,
              color: vipps?.placeholder ?? C.secondary,
              fontSize,
              lineHeight: fontSize,
              opacity: value ? 0 : 1,
            }}
          >
            {placeholder}
          </Text>
        ) : null}
      </View>
      {inlineClearSlot}
      {inlineClearOverlay}
    </>
  );

  const searchPill = isGlass ? (
    <GlassControlShell borderRadius={borderRadius} style={{ height: pillHeight }}>
      <View
        style={{
          flex: 1,
          flexDirection: "row",
          alignItems: "center",
          height: pillHeight,
          paddingLeft: 14,
          paddingRight: pillPaddingRight,
          position: "relative",
        }}
      >
        {pillBody}
      </View>
    </GlassControlShell>
  ) : (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        height: pillHeight,
        backgroundColor: vipps?.fill ?? C.inputBg,
        borderWidth: 1,
        borderColor: vipps?.border ?? C.separator,
        borderRadius,
        paddingLeft: 14,
        paddingRight: pillPaddingRight,
        position: "relative",
        ...(variant === "vipps"
          ? {
              shadowColor: "#000",
              shadowOffset: { width: 0, height: 1 },
              shadowOpacity: mode === "light" ? 0.05 : 0.2,
              shadowRadius: 4,
              elevation: 1,
            }
          : null),
      }}
    >
      {pillBody}
    </View>
  );

  const cancelButton = (
    <NativeCircleCancelButton
      onPress={onCancel}
      size={cancelBtnSize}
      iconSize={cancelIconSize}
      fill={vipps?.cancelFill ?? vipps?.fill ?? C.inputBg}
      fillPressed={vipps?.cancelFillPressed ?? vipps?.cancelFill ?? vipps?.fill ?? C.inputBg}
      borderColor={vipps?.border ?? C.separator}
      iconColor={vipps?.cancelIcon ?? C.secondary}
      shadowStyle={
        variant === "vipps"
          ? {
              shadowColor: "#000",
              shadowOffset: { width: 0, height: 1 },
              shadowOpacity: mode === "light" ? 0.05 : 0.2,
              shadowRadius: 4,
              elevation: 1,
            }
          : undefined
      }
    />
  );

  if (useSearchModeAnim && hideCancelButton) {
    return (
      <Animated.View
        style={[
          {
            paddingLeft: 12,
            paddingBottom: 8,
            paddingTop,
            paddingRight,
          },
          containerStyle,
        ]}
      >
        {searchPill}
      </Animated.View>
    );
  }

  if (useAnimatedCancel) {
    return (
      <Animated.View
        style={[
          {
            paddingLeft: 12,
            paddingRight: 16,
            paddingBottom: 8,
            paddingTop,
          },
          containerStyle,
        ]}
      >
        <View style={{ flexDirection: "row", alignItems: "center" }}>
          <Animated.View style={{ flex: 1, marginRight: cancelGapMargin }}>{searchPill}</Animated.View>
          <Animated.View
            pointerEvents={active ? "auto" : "none"}
            style={{
              width: cancelWrapWidth,
              height: cancelBtnSize,
              opacity: cancelOpacity,
              overflow: "hidden",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Animated.View style={{ transform: [{ scale: cancelScale }] }}>{cancelButton}</Animated.View>
          </Animated.View>
        </View>
      </Animated.View>
    );
  }

  return (
    <View
      style={[
        {
          paddingHorizontal: 12,
          paddingBottom: 8,
          flexDirection: "row",
          alignItems: "center",
          gap: CANCEL_SLOT_GAP,
        },
        containerStyle,
      ]}
    >
      <View style={{ flex: 1 }}>{searchPill}</View>
      {active ? cancelButton : null}
    </View>
  );
}

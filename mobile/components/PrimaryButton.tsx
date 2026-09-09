import { type ReactNode } from "react";
import { Dimensions, Platform, Pressable, Text, View } from "react-native";
import { GlassChrome } from "@/components/GlassChrome";
import { useTheme } from "@/lib/theme";

/** Space to reserve at the bottom of scroll content so rows pass under the floating button */
export const FLOATING_ACTION_CLEARANCE = 84;

/** Apple-style continuous corner radius for primary action pills. */
const PRIMARY_BUTTON_RADIUS = 999;

export function PrimaryButton({
  label,
  onPress,
  disabled,
  floating = false,
  floatingBottomInset = 0,
  icon,
  backgroundColor,
  labelColor = "#ffffff",
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  floating?: boolean;
  /** Lifts a floating button above overlays such as the bottom tab bar. */
  floatingBottomInset?: number;
  icon?: ReactNode;
  backgroundColor?: string;
  labelColor?: string;
}) {
  const { C } = useTheme();
  const fill = backgroundColor ?? C.accent;

  const pill =
    floating && Platform.OS === "ios" ? (
      <GlassChrome.Lens
        shape="capsule"
        interactive
        onPress={onPress}
        disabled={disabled}
        accessibilityLabel={label}
        style={{ width: "100%" }}
      >
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "center",
            gap: 8,
            paddingVertical: 15,
            paddingHorizontal: 20,
          }}
        >
          {icon}
          <Text style={{ color: labelColor, fontSize: 16, fontWeight: "600", letterSpacing: -0.2 }}>
            {label}
          </Text>
        </View>
      </GlassChrome.Lens>
    ) : (
      <Pressable
        onPress={onPress}
        disabled={disabled}
        style={({ pressed }) => ({
          opacity: disabled ? 0.5 : pressed ? 0.85 : 1,
          transform: [{ scale: pressed && !disabled ? 0.97 : 1 }],
        })}
      >
        <View
          style={{
            backgroundColor: fill,
            borderRadius: PRIMARY_BUTTON_RADIUS,
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "center",
            gap: 8,
            paddingVertical: 15,
            ...(floating
              ? {
                  shadowColor: "#000",
                  shadowOffset: { width: 0, height: 4 },
                  shadowOpacity: 0.2,
                  shadowRadius: 10,
                  elevation: 8,
                }
              : null),
          }}
        >
          {icon}
          <Text style={{ color: labelColor, fontSize: 16, fontWeight: "600", letterSpacing: -0.2 }}>
            {label}
          </Text>
        </View>
      </Pressable>
    );

  if (floating) {
    return (
      <View
        pointerEvents="box-none"
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          bottom: floatingBottomInset,
          paddingHorizontal: 16,
          paddingTop: 10,
          paddingBottom: 10,
          zIndex: 10,
        }}
      >
        {pill}
      </View>
    );
  }

  return (
    <View style={{ paddingHorizontal: 16, paddingTop: 10, paddingBottom: 10, backgroundColor: C.bg }}>
      {pill}
    </View>
  );
}

export const SHEET_HEIGHT = Math.round(Dimensions.get("window").height * 0.55);
export const SHEET_KEYBOARD_GAP = 8;
export const SHEET_HANDLE_BLOCK = 32;
export const SHEET_INPUT_ROW = 56;
export const SHEET_ACTION_ROW = 58;
export const SHEET_COLOR_PICKER_SLOT = 118;
export const SHEET_GROUP_FIELD = 52;
export const SHEET_GROUP_LABEL = 18;
export const SHEET_COMPACT_GAP = 8;

export function compactSheetHeight(bottomInset: number, withFooter = false) {
  const pad = Math.max(bottomInset, 20);
  return (
    SHEET_HANDLE_BLOCK
    + SHEET_INPUT_ROW
    + SHEET_COMPACT_GAP
    + pad
    + (withFooter ? SHEET_ACTION_ROW + 16 : 0)
  );
}

export function activitySheetHeight(
  bottomInset: number,
  opts: { withFooter?: boolean; withColorPicker?: boolean } = {},
) {
  const { withFooter = true, withColorPicker = false } = opts;
  const pad = Math.max(bottomInset, 20);
  return (
    SHEET_HANDLE_BLOCK
    + SHEET_INPUT_ROW
    + (withColorPicker ? SHEET_COLOR_PICKER_SLOT + 12 : 0)
    + (withFooter ? SHEET_ACTION_ROW + 16 : 0)
    + 16
    + pad
  );
}

/** Gap between the top of the screen and the group sheet (above the team name header). */
export const GROUP_SHEET_TOP_GAP = 10;

export function groupSheetHeight(topInset: number) {
  return Dimensions.get("window").height - topInset - GROUP_SHEET_TOP_GAP;
}

/** @deprecated use compactSheetHeight() */
export const COMPACT_SHEET_HEIGHT = 200;
/** @deprecated use compactSheetHeight(_, true) */
export const COMPACT_SHEET_WITH_FOOTER_HEIGHT = 260;
/** @deprecated use activitySheetHeight() */
export const ACTIVITY_SHEET_HEIGHT = 340;
/** Extra height for add-group sheet legacy constant */
export const GROUP_SHEET_EXTRA_HEIGHT = Math.round(Dimensions.get("window").height * 0.1);
export const GROUP_SHEET_HEIGHT = SHEET_HEIGHT + GROUP_SHEET_EXTRA_HEIGHT;

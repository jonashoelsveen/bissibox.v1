import { Check, Trash2, X } from "lucide-react-native";
import { View } from "react-native";
import { GlassChrome } from "@/components/GlassChrome";
import { useTheme } from "@/lib/theme";

const BUTTON_SIZE = 44;
const ICON_SIZE = 20;

type IconVariant = "delete" | "cancel" | "save";

function variantConfig(variant: IconVariant, C: ReturnType<typeof useTheme>["C"]) {
  switch (variant) {
    case "delete":
      return { Icon: Trash2, color: C.danger };
    case "cancel":
      return { Icon: X, color: C.text };
    case "save":
      return { Icon: Check, color: C.accent };
  }
}

function NativeGlassIconButton({
  variant,
  onPress,
  disabled,
  accessibilityLabel,
}: {
  variant: IconVariant;
  onPress: () => void;
  disabled?: boolean;
  accessibilityLabel: string;
}) {
  const { C } = useTheme();
  const { Icon, color } = variantConfig(variant, C);

  return (
    <GlassChrome.Lens
      shape="circle"
      interactive
      size={BUTTON_SIZE}
      onPress={onPress}
      disabled={disabled}
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled: !!disabled }}
    >
      <View
        style={{
          width: BUTTON_SIZE,
          height: BUTTON_SIZE,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Icon size={ICON_SIZE} color={color} strokeWidth={2.35} />
      </View>
    </GlassChrome.Lens>
  );
}

export function NativeSheetIconFooter({
  onDelete,
  onCancel,
  onSave,
  saveDisabled,
  borderless,
  compact,
}: {
  onDelete?: () => void;
  onCancel?: () => void;
  onSave?: () => void;
  saveDisabled?: boolean;
  borderless?: boolean;
  compact?: boolean;
}) {
  const { C } = useTheme();

  return (
    <View
      style={{
        paddingHorizontal: compact ? 4 : 0,
        paddingTop: borderless ? 0 : 12,
        borderTopWidth: borderless ? 0 : 1,
        borderTopColor: C.separator,
        marginTop: borderless ? 0 : compact ? 16 : 12,
        marginBottom: borderless ? 14 : 0,
        minHeight: BUTTON_SIZE,
      }}
    >
      <GlassChrome.Container
        spacing={12}
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          width: "100%",
        }}
      >
        {onDelete ? (
          <NativeGlassIconButton
            variant="delete"
            onPress={onDelete}
            accessibilityLabel="Delete"
          />
        ) : (
          <View style={{ width: BUTTON_SIZE, height: BUTTON_SIZE }} />
        )}
        {onCancel ? (
          <NativeGlassIconButton
            variant="cancel"
            onPress={onCancel}
            accessibilityLabel="Cancel"
          />
        ) : null}
        {onSave ? (
          <NativeGlassIconButton
            variant="save"
            onPress={onSave}
            disabled={saveDisabled}
            accessibilityLabel="Done"
          />
        ) : null}
      </GlassChrome.Container>
    </View>
  );
}

export const NATIVE_SHEET_ICON_SIZE = BUTTON_SIZE;

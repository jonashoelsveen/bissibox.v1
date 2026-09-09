import { forwardRef, useEffect, useImperativeHandle, useRef, type RefObject } from "react";
import {
  StyleSheet,
  Text,
  TextInput,
  View,
  type StyleProp,
  type TextInputProps,
  type TextStyle,
  type ViewStyle,
} from "react-native";

type SheetTextInputProps = TextInputProps & {
  /** When true (default), focus and show the soft keyboard on mount / sheet open. */
  focusOnOpen?: boolean;
};

/** TextInput tuned for bottom-sheet modals — keyboard ready as the sheet opens. */
export const SheetTextInput = forwardRef<TextInput, SheetTextInputProps>(function SheetTextInput(
  { focusOnOpen = true, ...props },
  ref,
) {
  const innerRef = useRef<TextInput>(null);

  useImperativeHandle(ref, () => innerRef.current as TextInput);

  useEffect(() => {
    if (!focusOnOpen) return;

    let cancelled = false;
    const focus = () => {
      if (!cancelled) innerRef.current?.focus();
    };

    focus();
    const raf = requestAnimationFrame(() => requestAnimationFrame(focus));
    const t = setTimeout(focus, 100);

    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      clearTimeout(t);
    };
  }, [focusOnOpen]);

  return (
    <TextInput
      ref={innerRef}
      autoFocus={focusOnOpen}
      showSoftInputOnFocus
      {...props}
    />
  );
});

const SESSION_TITLE_FONT_SIZE = 16;
/** Placeholder sits slightly below the raw padding inset to match native text baseline. */
const SESSION_TITLE_PLACEHOLDER_OFFSET_Y = 6;

function readVerticalPadding(flat: TextStyle): number {
  if (typeof flat.paddingVertical === "number") return flat.paddingVertical;
  if (typeof flat.paddingTop === "number") return flat.paddingTop;
  return 14;
}

type SessionTitleFieldProps = SheetTextInputProps & {
  placeholder?: string;
  placeholderTextColor?: string;
  style?: StyleProp<TextStyle>;
  containerStyle?: StyleProp<ViewStyle>;
};

/** Session sheet title row — typed text uses native layout; placeholder mirrors its inset. */
export const SessionTitleField = forwardRef<TextInput, SessionTitleFieldProps>(function SessionTitleField(
  {
    placeholder = "Session title",
    placeholderTextColor = "#8E8E93",
    value,
    style,
    containerStyle,
    focusOnOpen = true,
    ...props
  },
  ref,
) {
  const flat = StyleSheet.flatten(style) ?? {};
  const padH = typeof flat.paddingHorizontal === "number" ? flat.paddingHorizontal : 16;
  const padV = readVerticalPadding(flat);
  const fontSize = typeof flat.fontSize === "number" ? flat.fontSize : SESSION_TITLE_FONT_SIZE;
  const showPlaceholder = !value;

  return (
    <View style={containerStyle}>
      <SheetTextInput
        ref={ref}
        focusOnOpen={focusOnOpen}
        value={value}
        style={style}
        placeholder=""
        {...props}
      />
      {showPlaceholder ? (
        <Text
          pointerEvents="none"
          style={{
            position: "absolute",
            left: padH,
            right: padH,
            top: padV + SESSION_TITLE_PLACEHOLDER_OFFSET_Y,
            color: placeholderTextColor,
            fontSize,
            lineHeight: fontSize,
          }}
        >
          {placeholder}
        </Text>
      ) : null}
    </View>
  );
});

/** Focus a sheet field as soon as the native Modal is shown. */
export function focusSheetInput(ref: RefObject<TextInput | null>) {
  const focus = () => ref.current?.focus();
  requestAnimationFrame(() => requestAnimationFrame(focus));
  setTimeout(focus, 100);
}

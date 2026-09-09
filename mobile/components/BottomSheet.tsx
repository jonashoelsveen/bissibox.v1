import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  Animated,
  Dimensions,
  Keyboard,
  Modal,
  Platform,
  Pressable,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "@/lib/theme";
import { SHEET_HEIGHT, SHEET_KEYBOARD_GAP } from "@/components/PrimaryButton";
import { createSheetDismissPanResponder } from "@/lib/sheetDismissSwipe";

interface BottomSheetProps {
  visible: boolean;
  onClose: () => void;
  children: ReactNode;
  height?: number;
  /** Shorter base height while the keyboard is open (e.g. footer hidden). */
  keyboardBaseHeight?: number;
  keyboardAware?: boolean;
  /** Keep sheet height fixed while the keyboard is open (content still lifts). */
  fixedHeight?: boolean;
  /** Swipe down on the handle to dismiss (session blind logic). */
  swipeToDismiss?: boolean;
  onKeyboardChange?: (open: boolean) => void;
  onReady?: () => void;
}

export function BottomSheet({
  visible,
  onClose,
  children,
  height: baseHeight = SHEET_HEIGHT,
  keyboardBaseHeight,
  keyboardAware = true,
  fixedHeight = false,
  swipeToDismiss = false,
  onKeyboardChange,
  onReady,
}: BottomSheetProps) {
  const insets = useSafeAreaInsets();
  const { C } = useTheme();
  const slideAnim = useRef(new Animated.Value(baseHeight)).current;
  const keyboardPadAnim = useRef(new Animated.Value(0)).current;
  const heightAnim = useRef(new Animated.Value(baseHeight)).current;
  const backdropAnim = useRef(new Animated.Value(1)).current;
  const onReadyRef = useRef(onReady);
  const onCloseRef = useRef(onClose);
  const targetHeightRef = useRef(baseHeight);
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  onReadyRef.current = onReady;
  onCloseRef.current = onClose;

  const bottomPad = Math.max(insets.bottom, 20);
  const keyboardLift =
    keyboardAware && keyboardHeight > 0
      ? Math.max(0, keyboardHeight - bottomPad + SHEET_KEYBOARD_GAP)
      : 0;

  const activeBaseHeight =
    keyboardLift > 0 && keyboardBaseHeight != null ? keyboardBaseHeight : baseHeight;

  const targetHeight = useMemo(() => {
    if (fixedHeight || !keyboardAware || keyboardLift === 0) return baseHeight;
    const maxHeight = Dimensions.get("window").height - insets.top - SHEET_KEYBOARD_GAP;
    return Math.min(maxHeight, activeBaseHeight + keyboardLift);
  }, [baseHeight, activeBaseHeight, fixedHeight, keyboardAware, keyboardLift, insets.top]);

  targetHeightRef.current = targetHeight;

  const dismissPanResponder = useRef(
    createSheetDismissPanResponder({
      slideAnim,
      backdropAnim,
      getHeight: () => targetHeightRef.current,
      onDismiss: () => {
        Keyboard.dismiss();
        onCloseRef.current();
      },
    }),
  ).current;

  useEffect(() => {
    onKeyboardChange?.(keyboardHeight > 0);
  }, [keyboardHeight, onKeyboardChange]);

  useEffect(() => {
    if (!visible) {
      slideAnim.setValue(baseHeight);
      keyboardPadAnim.setValue(0);
      heightAnim.setValue(baseHeight);
      if (swipeToDismiss) backdropAnim.setValue(1);
      return;
    }
    slideAnim.setValue(baseHeight);
    if (swipeToDismiss) backdropAnim.setValue(1);
    Animated.spring(slideAnim, {
      toValue: 0,
      useNativeDriver: false,
      damping: 28,
      stiffness: 280,
    }).start();
  }, [visible, baseHeight, slideAnim, keyboardPadAnim, heightAnim, swipeToDismiss, backdropAnim]);

  useEffect(() => {
    if (!visible || !keyboardAware) {
      setKeyboardHeight(0);
      return;
    }
    const showEvent = Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
    const hideEvent = Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide";
    const showSub = Keyboard.addListener(showEvent, (e) => {
      setKeyboardHeight(e.endCoordinates.height);
    });
    const hideSub = Keyboard.addListener(hideEvent, () => {
      setKeyboardHeight(0);
    });
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, [visible, keyboardAware]);

  useEffect(() => {
    Animated.timing(keyboardPadAnim, {
      toValue: keyboardLift,
      duration: 250,
      useNativeDriver: false,
    }).start();
  }, [keyboardLift, keyboardPadAnim]);

  useEffect(() => {
    Animated.timing(heightAnim, {
      toValue: targetHeight,
      duration: 250,
      useNativeDriver: false,
    }).start();
  }, [targetHeight, heightAnim]);

  const handleModalShow = () => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => onReadyRef.current?.());
    });
  };

  function close() {
    Keyboard.dismiss();
    Animated.timing(slideAnim, {
      toValue: targetHeight,
      duration: 220,
      useNativeDriver: false,
    }).start(({ finished }) => {
      if (finished) onClose();
    });
  }

  if (!visible) return null;

  const handleBlock = (
    <View
      style={{
        alignSelf: "center",
        width: 38,
        height: 4,
        borderRadius: 2,
        backgroundColor: C.separator,
        marginTop: 12,
        marginBottom: 16,
      }}
    />
  );

  return (
    <Modal visible transparent animationType="none" onRequestClose={close} onShow={handleModalShow}>
      {swipeToDismiss ? (
        <Animated.View
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: "rgba(0,0,0,0.45)",
            opacity: backdropAnim,
          }}
        >
          <Pressable style={{ flex: 1 }} onPress={close} />
        </Animated.View>
      ) : (
        <Pressable
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: "rgba(0,0,0,0.45)",
          }}
          onPress={close}
        />
      )}
      <View style={{ flex: 1, justifyContent: "flex-end" }} pointerEvents="box-none">
        <Animated.View
          style={{
            height: heightAnim,
            backgroundColor: C.sheet,
            borderTopLeftRadius: 22,
            borderTopRightRadius: 22,
            paddingBottom: bottomPad,
            transform: [{ translateY: slideAnim }],
          }}
        >
          {swipeToDismiss ? (
            <View {...dismissPanResponder.panHandlers}>{handleBlock}</View>
          ) : (
            handleBlock
          )}
          <Animated.View style={{ flex: 1, paddingBottom: keyboardPadAnim }}>{children}</Animated.View>
        </Animated.View>
      </View>
    </Modal>
  );
}

export function SheetDismissArea({
  children,
  onDismiss = () => Keyboard.dismiss(),
}: {
  children: ReactNode;
  onDismiss?: () => void;
}) {
  return (
    <Pressable style={{ flex: 1 }} onPress={onDismiss}>
      {children}
    </Pressable>
  );
}

export function SheetCompactBody({
  children,
  footer,
}: {
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <View style={{ flex: 1, justifyContent: "flex-end", paddingHorizontal: 16, paddingBottom: 4, minHeight: 56 }}>
      {children}
      {footer}
    </View>
  );
}

export function SheetFooter({
  onDelete,
  onSave,
  onCancel,
  saveLabel = "Save",
  deleteLabel = "Delete",
  compact,
  borderless,
  saveDisabled,
}: {
  onDelete?: () => void;
  onSave?: () => void;
  onCancel?: () => void;
  saveLabel?: string;
  deleteLabel?: string;
  compact?: boolean;
  borderless?: boolean;
  saveDisabled?: boolean;
}) {
  const { C } = useTheme();
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        paddingHorizontal: compact ? 4 : 20,
        paddingTop: borderless ? 0 : 12,
        borderTopWidth: borderless ? 0 : 1,
        borderTopColor: C.separator,
        marginTop: borderless ? 0 : compact ? 16 : 12,
        marginBottom: borderless ? 14 : 0,
      }}
    >
      {onDelete ? (
        <Pressable onPress={onDelete} hitSlop={8}>
          {({ pressed }) => (
            <Text style={{ color: C.danger, fontSize: 16, opacity: pressed ? 0.6 : 1 }}>
              {deleteLabel}
            </Text>
          )}
        </Pressable>
      ) : (
        <View />
      )}
      <View style={{ flexDirection: "row", alignItems: "center", gap: 20 }}>
        {onCancel && (
          <Pressable onPress={onCancel} hitSlop={8}>
            {({ pressed }) => (
              <Text style={{ color: C.secondary, fontSize: 16, opacity: pressed ? 0.6 : 1 }}>
                Cancel
              </Text>
            )}
          </Pressable>
        )}
        {onSave && (
          <Pressable onPress={onSave} disabled={saveDisabled} hitSlop={8}>
            {({ pressed }) => (
              <Text
                style={{
                  color: C.accent,
                  fontSize: 16,
                  fontWeight: "600",
                  opacity: pressed || saveDisabled ? 0.6 : 1,
                }}
              >
                {saveLabel}
              </Text>
            )}
          </Pressable>
        )}
      </View>
    </View>
  );
}

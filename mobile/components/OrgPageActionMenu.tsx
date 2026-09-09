import { Plus, X } from "lucide-react-native";
import { useCallback, useEffect, useState } from "react";
import {
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
  Animated as RNAnimated,
} from "react-native";
import Animated, {
  interpolate,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from "react-native-reanimated";
import {
  GlassChrome,
  GlassInteractiveTarget,
  GlassPanel,
} from "@/components/GlassChrome";
import { useTheme } from "@/lib/theme";

export const ORG_ACTION_BUTTON_SIZE = 44;
/** Right padding for search row when the top-right action button is shown as ×. */
export const ORG_SEARCH_TRAILING_INSET = 12 + ORG_ACTION_BUTTON_SIZE + 8;
const ICON_SIZE = 20;
const ICON_SLOT = 24;
const MENU_MIN_WIDTH = 228;
const MENU_RADIUS = 16;
const MENU_ITEM_HEIGHT = 44;
const MENU_GAP = 6;

const OPEN_SPRING = { damping: 17, stiffness: 280, mass: 0.72 };
const CLOSE_SPRING = { damping: 22, stiffness: 340, mass: 0.65 };
const PRESS_SPRING = { damping: 20, stiffness: 480, mass: 0.45 };
const SEARCH_SPRING = { damping: 20, stiffness: 300, mass: 0.68 };

type MenuAction = "addGroup" | "inviteAdmin" | "inviteMember";

const MENU_ITEMS: Array<{ key: MenuAction; label: string }> = [
  { key: "addGroup", label: "Add group" },
  { key: "inviteAdmin", label: "Invite admin" },
  { key: "inviteMember", label: "Invite member" },
];

function ActionMenuItem({
  label,
  isLast,
  onPress,
}: {
  label: string;
  isLast: boolean;
  onPress: () => void;
}) {
  const { C, mode } = useTheme();

  return (
    <GlassInteractiveTarget
      onPress={onPress}
      accessibilityRole="menuitem"
      accessibilityLabel={label}
      animateScale={false}
    >
      <View
        style={{
          height: MENU_ITEM_HEIGHT,
          justifyContent: "center",
          paddingHorizontal: 16,
          borderBottomWidth: isLast ? 0 : StyleSheet.hairlineWidth,
          borderBottomColor: mode === "light" ? "rgba(0, 0, 0, 0.08)" : "rgba(255, 255, 255, 0.12)",
        }}
      >
        <Text style={{ color: C.text, fontSize: 16, fontWeight: "400" }} numberOfLines={1}>
          {label}
        </Text>
      </View>
    </GlassInteractiveTarget>
  );
}

export function OrgPageActionMenu({
  onAddGroup,
  onInviteAdmin,
  onInviteMember,
  onSearchCancel,
  searchActive = false,
  searchModeAnim,
  hidden = false,
  inline = false,
  idleTop = 4,
  right = 12,
  menuAnchorTop,
}: {
  onAddGroup: () => void;
  onInviteAdmin: () => void;
  onInviteMember: () => void;
  onSearchCancel?: () => void;
  searchActive?: boolean;
  /** When provided, plus/× morph tracks this value instead of a separate spring. */
  searchModeAnim?: RNAnimated.Value;
  hidden?: boolean;
  /** When true, skip absolute positioning (parent handles layout). */
  inline?: boolean;
  idleTop?: number;
  right?: number;
  /** Screen-row offset for the dropdown menu when `inline`. */
  menuAnchorTop?: number;
}) {
  const { C, mode } = useTheme();
  const [open, setOpen] = useState(false);
  const progress = useSharedValue(0);
  const searchProgress = useSharedValue(0);

  const finishClose = useCallback(() => setOpen(false), []);

  const closeMenu = useCallback(() => {
    progress.value = withSpring(0, CLOSE_SPRING, (finished) => {
      if (finished) runOnJS(finishClose)();
    });
  }, [finishClose, progress]);

  const openMenu = useCallback(() => {
    setOpen(true);
    progress.value = withSpring(1, OPEN_SPRING);
  }, [progress]);

  useEffect(() => {
    if (searchModeAnim) return;
    searchProgress.value = withSpring(searchActive ? 1 : 0, SEARCH_SPRING);
  }, [searchActive, searchModeAnim, searchProgress]);

  useEffect(() => {
    if (!searchModeAnim) return;
    const apply = (value: number) => {
      searchProgress.value = value;
    };
    const listenerId = searchModeAnim.addListener(({ value }) => apply(value));
    return () => searchModeAnim.removeListener(listenerId);
  }, [searchModeAnim, searchProgress]);

  useEffect(() => {
    if (searchActive && open) closeMenu();
  }, [closeMenu, open, searchActive]);

  useEffect(() => {
    if (!hidden) return;
    if (open) closeMenu();
  }, [closeMenu, hidden, open]);

  const handleSelect = useCallback(
    (action: MenuAction) => {
      closeMenu();
      const run = () => {
        if (action === "addGroup") onAddGroup();
        else if (action === "inviteAdmin") onInviteAdmin();
        else onInviteMember();
      };
      if (Platform.OS === "ios") {
        setTimeout(run, 180);
      } else {
        run();
      }
    },
    [closeMenu, onAddGroup, onInviteAdmin, onInviteMember],
  );

  const handlePress = useCallback(() => {
    if (searchActive) {
      onSearchCancel?.();
      return;
    }
    if (open) closeMenu();
    else openMenu();
  }, [closeMenu, onSearchCancel, open, openMenu, searchActive]);

  const shellAnimatedStyle = useAnimatedStyle(() => {
    if (inline) {
      return { opacity: hidden ? 0 : 1 };
    }
    return { opacity: hidden ? 0 : 1, top: idleTop };
  });

  const menuAnimatedStyle = useAnimatedStyle(() => {
    const p = progress.value;
    return {
      opacity: interpolate(p, [0, 0.35, 1], [0, 0.85, 1]),
      transform: [
        { scale: interpolate(p, [0, 1], [0.82, 1]) },
        { translateY: interpolate(p, [0, 1], [-10, 0]) },
        { translateX: interpolate(p, [0, 1], [10, 0]) },
      ],
    };
  });

  const backdropAnimatedStyle = useAnimatedStyle(() => ({
    opacity: interpolate(progress.value, [0, 1], [0, 0.18]),
  }));

  const plusIconStyle = useAnimatedStyle(() => {
    const p = Math.max(searchProgress.value, progress.value);
    return {
      opacity: interpolate(p, [0, 0.55, 1], [1, 0.15, 0]),
      transform: [{ rotate: `${interpolate(p, [0, 1], [0, 45])}deg` }],
    };
  });

  const xIconStyle = useAnimatedStyle(() => {
    const p = Math.max(searchProgress.value, progress.value);
    return {
      opacity: interpolate(p, [0, 0.45, 1], [0, 0.85, 1]),
    };
  });

  const anchorTop = menuAnchorTop ?? idleTop;
  const menuTop = anchorTop + ORG_ACTION_BUTTON_SIZE + MENU_GAP;

  const a11yLabel = searchActive
    ? "Cancel search"
    : open
      ? "Close actions menu"
      : "Open actions menu";

  return (
    <>
      <Animated.View
        pointerEvents={hidden ? "none" : "auto"}
        style={[
          inline
            ? undefined
            : {
                position: "absolute",
                right,
                zIndex: 130,
              },
          shellAnimatedStyle,
        ]}
      >
        <GlassChrome.Lens
          shape="circle"
          interactive
          size={ORG_ACTION_BUTTON_SIZE}
          onPress={handlePress}
          accessibilityLabel={a11yLabel}
          accessibilityState={{ expanded: open }}
        >
          <View
            style={{
              width: ORG_ACTION_BUTTON_SIZE,
              height: ORG_ACTION_BUTTON_SIZE,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <View
              style={{
                width: ICON_SLOT,
                height: ICON_SLOT,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
            <Animated.View style={[{ position: "absolute" }, plusIconStyle]}>
              <Plus size={ICON_SIZE} color={C.text} strokeWidth={2.35} />
            </Animated.View>
            <Animated.View style={[{ position: "absolute" }, xIconStyle]}>
              <X size={ICON_SIZE} color={C.text} strokeWidth={2.35} />
            </Animated.View>
            </View>
          </View>
        </GlassChrome.Lens>
      </Animated.View>

      <Modal visible={open} transparent animationType="none" onRequestClose={closeMenu}>
        <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
          <Pressable style={StyleSheet.absoluteFill} onPress={closeMenu} accessibilityLabel="Dismiss menu">
            <Animated.View
              style={[
                StyleSheet.absoluteFill,
                { backgroundColor: "#000000" },
                backdropAnimatedStyle,
              ]}
            />
          </Pressable>

          <Animated.View
            pointerEvents="box-none"
            style={[
              {
                position: "absolute",
                right,
                minWidth: MENU_MIN_WIDTH,
                shadowColor: "#000",
                shadowOffset: { width: 0, height: 10 },
                shadowOpacity: mode === "light" ? 0.14 : 0.32,
                shadowRadius: 24,
                elevation: 16,
              },
              menuAnimatedStyle,
              { top: menuTop },
            ]}
          >
            <GlassPanel borderRadius={MENU_RADIUS} style={{ overflow: "hidden" }}>
              {MENU_ITEMS.map((item, index) => (
                <ActionMenuItem
                  key={item.key}
                  label={item.label}
                  isLast={index === MENU_ITEMS.length - 1}
                  onPress={() => handleSelect(item.key)}
                />
              ))}
            </GlassPanel>
          </Animated.View>
        </View>
      </Modal>
    </>
  );
}

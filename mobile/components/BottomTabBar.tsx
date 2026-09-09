import { CalendarDays } from "lucide-react-native";
import { useCallback, useEffect, useMemo, useRef, type ReactNode } from "react";
import { StyleSheet, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  Extrapolation,
  interpolate,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withSpring,
  withTiming,
  type SharedValue,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { GlassBubble, GlassIsland } from "@/components/glass/GlassChrome";
import { ProfileIcon, TeamIcon } from "@/components/icons/ProfileIcons";
import { useTheme } from "@/lib/theme";

export type AppTab = "team" | "calendar" | "profile";

export const TAB_BAR_ISLAND_HEIGHT = 56;
const TAB_BAR_RADIUS = 28;
const TAB_BAR_TOP_PADDING = 10;
/** Nudge island closer to the screen bottom edge (pt). */
const TAB_BAR_BOTTOM_NUDGE = 12;
const TAB_SLOT_WIDTH = 58;
const TAB_GAP_TWO = 16;
const TAB_GAP_THREE = 8;
const ISLAND_H_PADDING = 8;
const BUBBLE_HEIGHT = 48;
const BUBBLE_WIDTH = TAB_SLOT_WIDTH;
const BUBBLE_RADIUS = BUBBLE_HEIGHT / 2;
const TAB_ICON_SIZE = 24;
const TAB_ICON_FRAME = 28;
const TAB_ICON_STROKE = 2.1;

const SNAP_SPRING = { damping: 18, stiffness: 240, mass: 0.82 };
const PRESS_SPRING = { damping: 22, stiffness: 420, mass: 0.55 };

/** Extra scroll padding when tab bar floats over content (excluding safe area). */
export const TAB_BAR_SCROLL_EXTRA = 72;

/** Bottom inset below the island (safe area, optionally nudged down). */
function tabBarBottomInset(safeAreaBottom: number) {
  return Math.max(Math.max(safeAreaBottom, 8) - TAB_BAR_BOTTOM_NUDGE, 4);
}

/** Visible height of the floating tab bar (excluding scroll padding). */
export function bottomTabBarHeight(safeAreaBottom: number) {
  return TAB_BAR_TOP_PADDING + TAB_BAR_ISLAND_HEIGHT + tabBarBottomInset(safeAreaBottom);
}

/** Reserve at bottom of scroll content when tab bar overlays (includes safe area). */
export function bottomTabBarOverlayClearance(safeAreaBottom: number) {
  return TAB_BAR_SCROLL_EXTRA + bottomTabBarHeight(safeAreaBottom);
}

type TabItem = {
  key: AppTab;
  label: string;
};

function tabGapForCount(count: number) {
  return count === 2 ? TAB_GAP_TWO : TAB_GAP_THREE;
}

function tabCenterX(index: number, tabGap: number) {
  return ISLAND_H_PADDING + TAB_SLOT_WIDTH / 2 + index * (TAB_SLOT_WIDTH + tabGap);
}

function tabIslandWidth(tabCount: number, tabGap: number) {
  return tabCount * TAB_SLOT_WIDTH + (tabCount - 1) * tabGap + ISLAND_H_PADDING * 2;
}

function clampWorklet(value: number, min: number, max: number) {
  "worklet";
  return Math.min(max, Math.max(min, value));
}

function nearestTabIndexWorklet(x: number, tabCount: number, tabGap: number, velocityX = 0) {
  "worklet";
  let index = 0;
  let minDist = Number.MAX_VALUE;
  for (let i = 0; i < tabCount; i += 1) {
    const center = ISLAND_H_PADDING + TAB_SLOT_WIDTH / 2 + i * (TAB_SLOT_WIDTH + tabGap);
    const dist = Math.abs(center - x);
    if (dist < minDist) {
      minDist = dist;
      index = i;
    }
  }
  if (Math.abs(velocityX) > 380) {
    index = clampWorklet(index + (velocityX > 0 ? 1 : -1), 0, tabCount - 1);
  }
  return index;
}

function snapIndicatorWorklet(
  index: number,
  tabGap: number,
  velocityX: number,
  indicatorX: SharedValue<number>,
  indicatorWidth: SharedValue<number>,
  indicatorScale: SharedValue<number>,
) {
  "worklet";
  const target = ISLAND_H_PADDING + TAB_SLOT_WIDTH / 2 + index * (TAB_SLOT_WIDTH + tabGap);
  const delta = Math.abs(target - indicatorX.value);
  const bridge = Math.min(BUBBLE_WIDTH + delta * 0.55, BUBBLE_WIDTH * 2.1);

  indicatorScale.value = withSpring(1, PRESS_SPRING);
  indicatorWidth.value = withSequence(
    withTiming(bridge, { duration: Math.min(160, 80 + delta * 0.35) }),
    withSpring(BUBBLE_WIDTH, SNAP_SPRING),
  );
  indicatorX.value = withSpring(target, {
    ...SNAP_SPRING,
    velocity: velocityX / 1000,
  });
}

function AnimatedTabIcon({
  index,
  tabGap,
  indicatorX,
  activeColor,
  inactiveColor,
  kind,
  label,
  selected,
}: {
  index: number;
  tabGap: number;
  indicatorX: SharedValue<number>;
  activeColor: string;
  inactiveColor: string;
  kind: AppTab;
  label: string;
  selected: boolean;
}) {
  const wrapperStyle = useAnimatedStyle(() => {
    const center = ISLAND_H_PADDING + TAB_SLOT_WIDTH / 2 + index * (TAB_SLOT_WIDTH + tabGap);
    const proximity = interpolate(
      Math.abs(center - indicatorX.value),
      [0, TAB_SLOT_WIDTH * 0.72],
      [1, 0],
      Extrapolation.CLAMP,
    );
    return {
      transform: [{ scale: 0.9 + proximity * 0.1 }],
    };
  });

  const filledStyle = useAnimatedStyle(() => {
    const center = ISLAND_H_PADDING + TAB_SLOT_WIDTH / 2 + index * (TAB_SLOT_WIDTH + tabGap);
    const proximity = interpolate(
      Math.abs(center - indicatorX.value),
      [0, TAB_SLOT_WIDTH * 0.55],
      [1, 0],
      Extrapolation.CLAMP,
    );
    return { opacity: proximity };
  });

  const outlineStyle = useAnimatedStyle(() => {
    const center = ISLAND_H_PADDING + TAB_SLOT_WIDTH / 2 + index * (TAB_SLOT_WIDTH + tabGap);
    const proximity = interpolate(
      Math.abs(center - indicatorX.value),
      [0, TAB_SLOT_WIDTH * 0.55],
      [1, 0],
      Extrapolation.CLAMP,
    );
    return { opacity: 1 - proximity };
  });

  const renderPair = (icon: (props: { color: string; strokeWidth: number }) => ReactNode) => (
    <View style={styles.iconStack}>
      <Animated.View style={[styles.iconLayer, outlineStyle]} pointerEvents="none">
        {icon({ color: inactiveColor, strokeWidth: TAB_ICON_STROKE })}
      </Animated.View>
      <Animated.View style={[styles.iconLayer, filledStyle]} pointerEvents="none">
        {icon({ color: activeColor, strokeWidth: TAB_ICON_STROKE })}
      </Animated.View>
    </View>
  );

  return (
    <Animated.View
      style={[styles.tabSlot, wrapperStyle]}
      accessibilityRole="tab"
      accessibilityState={{ selected }}
      accessibilityLabel={label}
    >
      {kind === "team"
        ? renderPair(({ color, strokeWidth }) => (
            <TeamIcon size={TAB_ICON_SIZE} color={color} strokeWidth={strokeWidth} />
          ))
        : kind === "calendar"
          ? renderPair(({ color, strokeWidth }) => (
              <CalendarDays size={TAB_ICON_SIZE} color={color} strokeWidth={strokeWidth} />
            ))
          : renderPair(({ color, strokeWidth }) => (
              <ProfileIcon size={TAB_ICON_SIZE} color={color} strokeWidth={strokeWidth} />
            ))}
    </Animated.View>
  );
}

export function BottomTabBar({
  tab,
  onChange,
  showTeamTab,
}: {
  tab: AppTab;
  onChange: (t: AppTab) => void;
  showTeamTab: boolean;
}) {
  const insets = useSafeAreaInsets();
  const { C } = useTheme();
  const draggingRef = useRef(false);

  const items = useMemo<TabItem[]>(
    () => [
      ...(showTeamTab ? [{ key: "team" as AppTab, label: "Organization" }] : []),
      { key: "calendar", label: "Calendar" },
      { key: "profile", label: "Profile" },
    ],
    [showTeamTab],
  );

  const tabCount = items.length;
  const tabGap = tabGapForCount(tabCount);
  const islandWidth = tabIslandWidth(tabCount, tabGap);
  const activeIndex = Math.max(0, items.findIndex((item) => item.key === tab));

  const tabCountSV = useSharedValue(tabCount);
  const tabGapSV = useSharedValue(tabGap);
  const indicatorX = useSharedValue(tabCenterX(activeIndex, tabGap));
  const indicatorWidth = useSharedValue(BUBBLE_WIDTH);
  const indicatorScale = useSharedValue(1);
  const panStartX = useSharedValue(0);

  useEffect(() => {
    tabCountSV.value = tabCount;
    tabGapSV.value = tabGap;
  }, [tabCount, tabGap, tabCountSV, tabGapSV]);

  const setDragging = useCallback((value: boolean) => {
    draggingRef.current = value;
  }, []);

  const emitTabAtIndex = useCallback(
    (index: number) => {
      const next = items[index]?.key;
      if (next && next !== tab) onChange(next);
    },
    [items, onChange, tab],
  );

  useEffect(() => {
    if (draggingRef.current) return;
    const idx = Math.max(0, items.findIndex((item) => item.key === tab));
    indicatorX.value = withSpring(tabCenterX(idx, tabGap), SNAP_SPRING);
    indicatorWidth.value = withSpring(BUBBLE_WIDTH, SNAP_SPRING);
    indicatorScale.value = withSpring(1, PRESS_SPRING);
  }, [tab, items, tabGap, indicatorScale, indicatorWidth, indicatorX]);

  const panGesture = useMemo(
    () =>
      Gesture.Pan()
        .activeOffsetX([-6, 6])
        .failOffsetY([-14, 14])
        .onBegin(() => {
          panStartX.value = indicatorX.value;
          indicatorScale.value = withSpring(0.92, PRESS_SPRING);
          runOnJS(setDragging)(true);
        })
        .onUpdate((event) => {
          const gap = tabGapSV.value;
          const count = tabCountSV.value;
          const minX = ISLAND_H_PADDING + TAB_SLOT_WIDTH / 2 - 10;
          const maxX = ISLAND_H_PADDING + TAB_SLOT_WIDTH / 2 + (count - 1) * (TAB_SLOT_WIDTH + gap) + 10;
          const nextX = clampWorklet(panStartX.value + event.translationX, minX, maxX);
          indicatorX.value = nextX;

          const velocityStretch = clampWorklet(Math.abs(event.velocityX) / 28, 0, 22);
          const travelStretch = clampWorklet(Math.abs(event.translationX) * 0.07, 0, 18);
          indicatorWidth.value = BUBBLE_WIDTH + Math.max(velocityStretch, travelStretch);
        })
        .onEnd((event) => {
          const gap = tabGapSV.value;
          const count = tabCountSV.value;
          const index = nearestTabIndexWorklet(indicatorX.value, count, gap, event.velocityX);
          snapIndicatorWorklet(
            index,
            gap,
            event.velocityX,
            indicatorX,
            indicatorWidth,
            indicatorScale,
          );
          runOnJS(emitTabAtIndex)(index);
        })
        .onFinalize(() => {
          indicatorScale.value = withSpring(1, PRESS_SPRING);
          runOnJS(setDragging)(false);
        }),
    [
      emitTabAtIndex,
      indicatorScale,
      indicatorWidth,
      indicatorX,
      panStartX,
      setDragging,
      tabCountSV,
      tabGapSV,
    ],
  );

  const tapGesture = useMemo(
    () =>
      Gesture.Tap()
        .maxDuration(220)
        .onBegin(() => {
          indicatorScale.value = withSpring(0.94, PRESS_SPRING);
        })
        .onEnd((event) => {
          const gap = tabGapSV.value;
          const count = tabCountSV.value;
          const index = nearestTabIndexWorklet(event.x, count, gap, 0);
          snapIndicatorWorklet(index, gap, 0, indicatorX, indicatorWidth, indicatorScale);
          runOnJS(emitTabAtIndex)(index);
        })
        .onFinalize(() => {
          indicatorScale.value = withSpring(1, PRESS_SPRING);
        }),
    [emitTabAtIndex, indicatorScale, indicatorWidth, indicatorX, tabCountSV, tabGapSV],
  );

  const composedGesture = useMemo(
    () => Gesture.Exclusive(panGesture, tapGesture),
    [panGesture, tapGesture],
  );

  const bubbleStyle = useAnimatedStyle(() => ({
    width: indicatorWidth.value,
    transform: [
      { translateX: indicatorX.value - indicatorWidth.value / 2 },
      { scaleY: indicatorScale.value },
      {
        scaleX: interpolate(indicatorScale.value, [0.92, 1], [1.05, 1], Extrapolation.CLAMP),
      },
    ],
  }));

  return (
    <View
      pointerEvents="box-none"
      style={[styles.root, { paddingBottom: tabBarBottomInset(insets.bottom) }]}
    >
      <GestureDetector gesture={composedGesture}>
        <GlassIsland
          borderRadius={TAB_BAR_RADIUS}
          mergeSpacing={BUBBLE_WIDTH}
          style={{ width: islandWidth, height: TAB_BAR_ISLAND_HEIGHT }}
          accessibilityRole="tablist"
        >
          <Animated.View pointerEvents="none" style={[styles.bubble, bubbleStyle]}>
            <GlassBubble borderRadius={BUBBLE_RADIUS} style={StyleSheet.absoluteFill} />
          </Animated.View>
          <View style={[styles.tabRow, { gap: tabGap }]} pointerEvents="none">
            {items.map((item, index) => (
              <AnimatedTabIcon
                key={item.key}
                index={index}
                tabGap={tabGap}
                indicatorX={indicatorX}
                activeColor={C.accent}
                inactiveColor={C.secondary}
                kind={item.key}
                label={item.label}
                selected={tab === item.key}
              />
            ))}
          </View>
        </GlassIsland>
      </GestureDetector>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    width: "100%",
    alignItems: "center",
    paddingTop: TAB_BAR_TOP_PADDING,
  },
  bubble: {
    position: "absolute",
    top: (TAB_BAR_ISLAND_HEIGHT - BUBBLE_HEIGHT) / 2,
    height: BUBBLE_HEIGHT,
    borderRadius: BUBBLE_RADIUS,
  },
  tabRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: ISLAND_H_PADDING,
  },
  tabSlot: {
    width: TAB_SLOT_WIDTH,
    height: BUBBLE_HEIGHT,
    alignItems: "center",
    justifyContent: "center",
  },
  iconStack: {
    width: TAB_ICON_FRAME,
    height: TAB_ICON_FRAME,
    position: "relative",
    alignItems: "center",
    justifyContent: "center",
  },
  iconLayer: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    alignItems: "center",
    justifyContent: "center",
  },
});

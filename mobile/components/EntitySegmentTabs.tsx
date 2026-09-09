import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, memo, type ReactElement } from "react";
import { StyleSheet, useWindowDimensions, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  Extrapolation,
  cancelAnimation,
  interpolate,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withSpring,
  withTiming,
  type SharedValue,
} from "react-native-reanimated";
import { GlassBubble, GlassIsland } from "@/components/glass/GlassChrome";
import { useTheme } from "@/lib/theme";

const TRACK_HEIGHT = 36;
const TRACK_PADDING = 4;
const OUTER_RADIUS = 22;
const INNER_RADIUS = 18;

const SNAP_SPRING = { damping: 18, stiffness: 240, mass: 0.82 };
const PRESS_SPRING = { damping: 22, stiffness: 420, mass: 0.55 };

function segmentCenterX(index: number, segmentWidth: number) {
  "worklet";
  return TRACK_PADDING + segmentWidth / 2 + index * segmentWidth;
}

function clampWorklet(value: number, min: number, max: number) {
  "worklet";
  return Math.min(max, Math.max(min, value));
}

function nearestSegmentIndexWorklet(
  x: number,
  tabCount: number,
  segmentWidth: number,
  velocityX = 0,
) {
  "worklet";
  if (segmentWidth <= 0 || tabCount <= 0) return 0;

  let index = 0;
  let minDist = Number.MAX_VALUE;
  for (let i = 0; i < tabCount; i += 1) {
    const center = segmentCenterX(i, segmentWidth);
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
  segmentWidth: number,
  velocityX: number,
  indicatorX: SharedValue<number>,
  indicatorWidth: SharedValue<number>,
  indicatorScale: SharedValue<number>,
) {
  "worklet";
  const baseWidth = Math.max(segmentWidth - 2, 0);
  const target = segmentCenterX(index, segmentWidth);
  const delta = Math.abs(target - indicatorX.value);
  const bridge = Math.min(baseWidth + delta * 0.55, baseWidth * 2.1);

  indicatorScale.value = withSpring(1, PRESS_SPRING);
  indicatorWidth.value = withSequence(
    withTiming(bridge, { duration: Math.min(160, 80 + delta * 0.35) }),
    withSpring(baseWidth, SNAP_SPRING),
  );
  indicatorX.value = withSpring(target, {
    ...SNAP_SPRING,
    velocity: velocityX / 1000,
  });
}

const AnimatedSegmentLabel = memo(function AnimatedSegmentLabel({
  index,
  label,
  indicatorX,
  segmentWidthSV,
  activeColor,
  inactiveColor,
  selected,
}: {
  index: number;
  label: string;
  indicatorX: SharedValue<number>;
  segmentWidthSV: SharedValue<number>;
  activeColor: string;
  inactiveColor: string;
  selected: boolean;
}) {
  const activeStyle = useAnimatedStyle(() => {
    const segmentWidth = segmentWidthSV.value;
    if (segmentWidth <= 0) return { opacity: selected ? 1 : 0 };

    const center = segmentCenterX(index, segmentWidth);
    const proximity = interpolate(
      Math.abs(center - indicatorX.value),
      [0, segmentWidth * 0.55],
      [1, 0],
      Extrapolation.CLAMP,
    );
    return { opacity: proximity };
  });

  const inactiveStyle = useAnimatedStyle(() => {
    const segmentWidth = segmentWidthSV.value;
    if (segmentWidth <= 0) return { opacity: selected ? 0 : 1 };

    const center = segmentCenterX(index, segmentWidth);
    const proximity = interpolate(
      Math.abs(center - indicatorX.value),
      [0, segmentWidth * 0.55],
      [1, 0],
      Extrapolation.CLAMP,
    );
    return { opacity: 1 - proximity };
  });

  return (
    <View
      style={styles.labelSlot}
      accessibilityRole="tab"
      accessibilityState={{ selected }}
      accessibilityLabel={label}
    >
      <Animated.Text
        pointerEvents="none"
        numberOfLines={1}
        style={[styles.label, styles.labelInactive, inactiveStyle, { color: inactiveColor }]}
      >
        {label}
      </Animated.Text>
      <Animated.Text
        pointerEvents="none"
        numberOfLines={1}
        style={[
          styles.label,
          styles.labelActive,
          activeStyle,
          { color: activeColor },
        ]}
      >
        {label}
      </Animated.Text>
    </View>
  );
});

function EntitySegmentTabsInner<K extends string>({
  tabs,
  active,
  onChange,
}: {
  tabs: Array<{ key: K; label: string }>;
  active: K;
  onChange: (tab: K) => void;
}) {
  const { C } = useTheme();
  const { width: windowWidth } = useWindowDimensions();
  const isDraggingRef = useRef(false);
  const hasLayoutRef = useRef(false);
  const skipNextActiveSyncRef = useRef(false);

  const tabCount = tabs.length;
  const activeIndex = Math.max(0, tabs.findIndex((tab) => tab.key === active));

  const tabCountSV = useSharedValue(tabCount);
  const segmentWidthSV = useSharedValue(0);
  const indicatorX = useSharedValue(0);
  const indicatorWidth = useSharedValue(0);
  const indicatorScale = useSharedValue(1);
  const panStartX = useSharedValue(0);
  const lastTrackWidthRef = useRef(0);

  useEffect(() => {
    tabCountSV.value = tabCount;
  }, [tabCount, tabCountSV]);

  const setDragging = useCallback((value: boolean) => {
    isDraggingRef.current = value;
  }, []);

  const emitTabAtIndex = useCallback(
    (index: number) => {
      skipNextActiveSyncRef.current = true;
      const next = tabs[index];
      if (next && next.key !== active) onChange(next.key);
    },
    [active, onChange, tabs],
  );

  const snapToIndex = useCallback(
    (index: number, velocityX = 0, animate = true) => {
      const segmentWidth = segmentWidthSV.value;
      if (segmentWidth <= 0) return;

      const target = TRACK_PADDING + segmentWidth / 2 + index * segmentWidth;
      const baseWidth = Math.max(segmentWidth - 2, 0);

      if (!animate) {
        indicatorX.value = target;
        indicatorWidth.value = baseWidth;
        indicatorScale.value = 1;
        return;
      }

      const delta = Math.abs(target - indicatorX.value);
      const bridge = Math.min(baseWidth + delta * 0.55, baseWidth * 2.1);

      indicatorScale.value = withSpring(1, PRESS_SPRING);
      indicatorWidth.value = withSequence(
        withTiming(bridge, { duration: Math.min(160, 80 + delta * 0.35) }),
        withSpring(baseWidth, SNAP_SPRING),
      );
      indicatorX.value = withSpring(target, {
        ...SNAP_SPRING,
        velocity: velocityX / 1000,
      });
    },
    [indicatorScale, indicatorWidth, indicatorX, segmentWidthSV],
  );

  useEffect(() => {
    if (!hasLayoutRef.current || isDraggingRef.current || segmentWidthSV.value <= 0) return;
    if (skipNextActiveSyncRef.current) {
      skipNextActiveSyncRef.current = false;
      return;
    }

    const segmentWidth = segmentWidthSV.value;
    const target = TRACK_PADDING + segmentWidth / 2 + activeIndex * segmentWidth;
    const baseWidth = Math.max(segmentWidth - 2, 0);
    if (
      Math.abs(indicatorX.value - target) < 0.5 &&
      Math.abs(indicatorWidth.value - baseWidth) < 0.5
    ) {
      return;
    }

    snapToIndex(activeIndex, 0, true);
  }, [activeIndex, indicatorWidth, indicatorX, segmentWidthSV, snapToIndex]);

  const applyIndicatorAtIndex = useCallback(
    (index: number, segmentWidth: number) => {
      const target = TRACK_PADDING + segmentWidth / 2 + index * segmentWidth;
      const baseWidth = Math.max(segmentWidth - 2, 0);
      indicatorX.value = target;
      indicatorWidth.value = baseWidth;
      indicatorScale.value = 1;
    },
    [indicatorScale, indicatorWidth, indicatorX],
  );

  useLayoutEffect(() => {
    if (hasLayoutRef.current || tabCount <= 0) return;
    const estimatedTrackWidth = windowWidth - 24;
    if (estimatedTrackWidth <= 0) return;
    const segmentWidth = (estimatedTrackWidth - TRACK_PADDING * 2) / tabCount;
    if (segmentWidth <= 0) return;
    segmentWidthSV.value = segmentWidth;
    applyIndicatorAtIndex(activeIndex, segmentWidth);
  }, [applyIndicatorAtIndex, segmentWidthSV, tabCount, windowWidth]);

  const panGesture = useMemo(
    () =>
      Gesture.Pan()
        .activeOffsetX([-6, 6])
        .failOffsetY([-14, 14])
        .onBegin(() => {
          cancelAnimation(indicatorX);
          cancelAnimation(indicatorWidth);
          panStartX.value = indicatorX.value;
          indicatorScale.value = withSpring(0.92, PRESS_SPRING);
          runOnJS(setDragging)(true);
        })
        .onUpdate((event) => {
          const segmentWidth = segmentWidthSV.value;
          const count = tabCountSV.value;
          if (segmentWidth <= 0) return;

          const minX = segmentCenterX(0, segmentWidth) - 10;
          const maxX = segmentCenterX(count - 1, segmentWidth) + 10;
          const nextX = clampWorklet(panStartX.value + event.translationX, minX, maxX);
          indicatorX.value = nextX;

          const velocityStretch = Math.min(Math.abs(event.velocityX) / 2200, 0.18);
          const travelStretch = Math.min(Math.abs(event.translationX) / 180, 0.12);
          const baseWidth = Math.max(segmentWidth - 2, 0);
          indicatorWidth.value = baseWidth + Math.max(velocityStretch, travelStretch) * baseWidth;
        })
        .onEnd((event) => {
          const segmentWidth = segmentWidthSV.value;
          const count = tabCountSV.value;
          if (segmentWidth <= 0) return;

          const index = nearestSegmentIndexWorklet(
            indicatorX.value,
            count,
            segmentWidth,
            event.velocityX,
          );
          snapIndicatorWorklet(
            index,
            segmentWidth,
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
      segmentWidthSV,
      setDragging,
      tabCountSV,
    ],
  );

  const tapGesture = useMemo(
    () =>
      Gesture.Tap()
        .maxDuration(220)
        .onBegin(() => {
          indicatorScale.value = withSpring(0.92, PRESS_SPRING);
        })
        .onEnd((event) => {
          const segmentWidth = segmentWidthSV.value;
          const count = tabCountSV.value;
          if (segmentWidth <= 0) return;

          const index = nearestSegmentIndexWorklet(event.x, count, segmentWidth, 0);
          snapIndicatorWorklet(
            index,
            segmentWidth,
            0,
            indicatorX,
            indicatorWidth,
            indicatorScale,
          );
          runOnJS(emitTabAtIndex)(index);
        })
        .onFinalize(() => {
          indicatorScale.value = withSpring(1, PRESS_SPRING);
        }),
    [
      emitTabAtIndex,
      indicatorScale,
      indicatorWidth,
      indicatorX,
      segmentWidthSV,
      tabCountSV,
    ],
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

  const onTrackLayout = useCallback(
    (width: number) => {
      if (width <= 0 || tabCount <= 0) return;
      const segmentWidth = (width - TRACK_PADDING * 2) / tabCount;
      const firstLayout = !hasLayoutRef.current;
      const widthChanged = Math.abs(width - lastTrackWidthRef.current) > 0.5;
      lastTrackWidthRef.current = width;
      segmentWidthSV.value = segmentWidth;
      if (firstLayout || widthChanged) {
        applyIndicatorAtIndex(activeIndex, segmentWidth);
      }
      hasLayoutRef.current = true;
    },
    [activeIndex, applyIndicatorAtIndex, segmentWidthSV, tabCount],
  );

  return (
    <View style={styles.root}>
      <GestureDetector gesture={composedGesture}>
        <GlassIsland
          borderRadius={OUTER_RADIUS}
          mergeSpacing={TRACK_HEIGHT}
          style={styles.trackShell}
          accessibilityRole="tablist"
          onLayout={({
            nativeEvent: {
              layout: { width },
            },
          }) => onTrackLayout(width)}
        >
          <Animated.View pointerEvents="none" style={[styles.bubble, bubbleStyle]}>
            <GlassBubble borderRadius={INNER_RADIUS} style={StyleSheet.absoluteFill} />
          </Animated.View>
          <View style={styles.labelRow} pointerEvents="none">
            {tabs.map((tab, index) => (
              <AnimatedSegmentLabel
                key={tab.key}
                index={index}
                label={tab.label}
                indicatorX={indicatorX}
                segmentWidthSV={segmentWidthSV}
                activeColor={C.text}
                inactiveColor={C.secondary}
                selected={tab.key === active}
              />
            ))}
          </View>
        </GlassIsland>
      </GestureDetector>
    </View>
  );
}

export const EntitySegmentTabs = memo(EntitySegmentTabsInner) as <K extends string>(props: {
  tabs: Array<{ key: K; label: string }>;
  active: K;
  onChange: (tab: K) => void;
}) => ReactElement;

const styles = StyleSheet.create({
  root: {
    paddingHorizontal: 12,
    paddingBottom: 4,
  },
  trackShell: {
    height: TRACK_HEIGHT,
    justifyContent: "center",
  },
  bubble: {
    position: "absolute",
    top: TRACK_PADDING,
    height: TRACK_HEIGHT - TRACK_PADDING * 2,
    borderRadius: INNER_RADIUS,
  },
  labelRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: TRACK_PADDING,
  },
  labelSlot: {
    flex: 1,
    height: TRACK_HEIGHT - TRACK_PADDING * 2,
    alignItems: "center",
    justifyContent: "center",
  },
  label: {
    fontSize: 13,
    textAlign: "center",
  },
  labelInactive: {
    position: "absolute",
    fontWeight: "500",
  },
  labelActive: {
    position: "absolute",
    fontWeight: "600",
  },
});

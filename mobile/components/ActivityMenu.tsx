import {
  Alert,
  Animated,
  Dimensions,
  Keyboard,
  Modal,
  Platform,
  Pressable,
  Text,
  TextInput,
  Vibration,
  View,
} from "react-native";
import { ScrollView as GHScrollView, Pressable as GHPressable } from "react-native-gesture-handler";
import { scheduleOnRN } from "react-native-worklets";
import ReAnimated, {
  cancelAnimation,
  runOnUI,
  useAnimatedReaction,
  useFrameCallback,
  useSharedValue,
  useAnimatedStyle,
  withSpring,
} from "react-native-reanimated";
import type { SharedValue } from "react-native-reanimated";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ChevronRight, EyeOff, Pencil, Plus } from "lucide-react-native";
import { createRef, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ComponentRef, type RefObject } from "react";
import type { UserCategory } from "@/hooks/useUserCategories";
import { useTheme } from "@/lib/theme";
import { supabase } from "@/lib/supabase";
import { FadedTitle, PageHeader } from "@/components/PageHeader";

// #region agent log
function debugLog(loc: string, msg: string, data: Record<string, unknown>, hyp: string) {
  fetch("http://127.0.0.1:7391/ingest/eae725c6-d5b2-4678-b46a-f5b0dc8bf77e", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "d420a0" },
    body: JSON.stringify({ sessionId: "d420a0", runId: "post-fix", hypothesisId: hyp, location: loc, message: msg, data, timestamp: Date.now() }),
  }).catch(() => {});
}
// #endregion

// Item dimensions — must match rendered height exactly for drag math
const ITEM_H = 52;   // height: 52 (border included)
const ITEM_GAP = 6;
const ITEM_STEP = ITEM_H + ITEM_GAP; // 58
const LIST_PADDING_TOP = 12;
const LIST_PADDING_BOTTOM_EMBEDDED = 8;
const LIST_PADDING_BOTTOM_MIN = 24;
const AUTO_SCROLL_ZONE = 44;
const AUTO_SCROLL_SPEED = 4;

function resolveDragTranslateY(
  translationY: number,
  itemStartScreenY: number,
  scrollDelta: number,
  zoneTop: number,
  zoneBottom: number,
  padTop: number,
  padBottom: number,
  adjustZonesForPageScroll = false,
): number {
  "worklet";
  let zTop = zoneTop;
  let zBottom = zoneBottom;
  if (adjustZonesForPageScroll) {
    zTop -= scrollDelta;
    zBottom -= scrollDelta;
  }
  if (zBottom <= zTop) {
    return translationY + scrollDelta;
  }
  const minTop = zTop + padTop;
  const maxTop = zBottom - padBottom - ITEM_H;
  let screenY = itemStartScreenY + translationY;
  if (maxTop < minTop) {
    screenY = (minTop + maxTop) / 2;
  } else if (screenY < minTop) {
    screenY = minTop;
  } else if (screenY > maxTop) {
    screenY = maxTop;
  }
  // Pin screen Y, then compensate for list scroll so the tab stays on the finger.
  return screenY - itemStartScreenY + scrollDelta;
}

function resolveHoverIndexFromDragOffset(
  fromIndex: number,
  dragOffset: number,
  total: number,
): number {
  "worklet";
  const rawIndex = fromIndex + Math.round(dragOffset / ITEM_STEP);
  return Math.max(0, Math.min(total - 1, rawIndex));
}

const NEW_ACTIVITY_NAME = "New activity";

export const SWATCHES = [
  "#ef4444", "#f97316", "#eab308",
  "#22c55e", "#06b6d4", "#3b82f6",
  "#8b5cf6", "#ec4899", "#a16207",
];

interface TeamGroup {
  id: string;
  name: string;
}

interface Props {
  categories: UserCategory[];
  onCreate: (name: string, color: string, groupId?: string | null) => Promise<UserCategory | null>;
  onUpdate: (id: string, patch: Partial<Pick<UserCategory, "name" | "color" | "hidden">>) => Promise<void>;
  onRemove: (id: string) => Promise<void>;
  teamName?: string;
  groups?: TeamGroup[];
}

type EditState = {
  cat: UserCategory;
  name: string;
  color: string;
  colorPickerOpen: boolean;
  isNew: boolean;
} | null;

interface PageScrollBinding {
  scrollRef: RefObject<ComponentRef<typeof GHScrollView> | null>;
  scrollOffsetRef: React.MutableRefObject<number>;
  scrollMaxYRef: React.MutableRefObject<number>;
  scrollYSV: SharedValue<number>;
  viewportRef: React.MutableRefObject<{ top: number; bottom: number }>;
}

// ── DraggableItem ──────────────────────────────────────────────────────────────

// Spring configs — iOS-style physics (damping / stiffness / mass)
const PICKUP_SCALE_SPRING = { damping: 14, stiffness: 220, mass: 0.85 };
const SNAP_SPRING = { damping: 28, stiffness: 190, mass: 1 };
const DRAG_SPRING = { damping: 40, stiffness: 300 };
const NEIGHBOR_SPRING = { damping: 16, stiffness: 200, mass: 0.9 };

function finishDropSnap(
  dropFromSV: SharedValue<number>,
  dropToSV: SharedValue<number>,
  dropDragSV: SharedValue<number>,
  dropOffsetSV: SharedValue<number>,
  droppingIdSV: SharedValue<string>,
  activeIdSV: SharedValue<string>,
  activeIndexSV: SharedValue<number>,
  hoverIndexSV: SharedValue<number>,
  dragDYSV: SharedValue<number>,
  dropAnimStartedSV: SharedValue<number>,
  catId: string,
) {
  "worklet";
  if (dropAnimStartedSV.value) return;
  dropAnimStartedSV.value = 1;
  activeIdSV.value = "";
  cancelAnimation(dragDYSV);
  dragDYSV.value = 0;
  activeIndexSV.value = -1;
  hoverIndexSV.value = -1;
  droppingIdSV.value = catId;
  const from = dropFromSV.value;
  const to = dropToSV.value;
  const endOffset = from === to ? dropDragSV.value : (from - to) * ITEM_STEP + dropDragSV.value;
  cancelAnimation(dropOffsetSV);
  dropOffsetSV.value = endOffset;
  // #region agent log
  scheduleOnRN(debugLog, "finishDropSnap", "snap after flushSync handoff", {
    catId, endOffset, from, to, dropDrag: dropDragSV.value,
  }, "H3");
  // #endregion
  dropOffsetSV.value = withSpring(0, SNAP_SPRING, (finished) => {
    if (finished) {
      droppingIdSV.value = "";
      dropOffsetSV.value = 0;
      dropAnimStartedSV.value = 0;
    }
  });
}

interface DraggableItemProps {
  cat: UserCategory;
  index: number;
  total: number;
  activeIndexSV: SharedValue<number>;
  activeIdSV: SharedValue<string>;
  hoverIndexSV: SharedValue<number>;
  droppingIdSV: SharedValue<string>;
  dropOffsetSV: SharedValue<number>;
  dropFromSV: SharedValue<number>;
  dropToSV: SharedValue<number>;
  dropDragSV: SharedValue<number>;
  dropAnimStartedSV: SharedValue<number>;
  dragDYSV: SharedValue<number>;
  commitGenSV: SharedValue<number>;
  scrollYSV: SharedValue<number>;
  initialScrollYSV: SharedValue<number>;
  dragZoneTopSV: SharedValue<number>;
  dragZoneBottomSV: SharedValue<number>;
  dragViewportTopSV: SharedValue<number>;
  dragViewportBottomSV: SharedValue<number>;
  dragPadBottomSV: SharedValue<number>;
  itemScreenYAtStartSV: SharedValue<number>;
  dragAbsoluteYSV: SharedValue<number>;
  adjustZonesForPageScrollSV: SharedValue<number>;
  onToggleHidden: (id: string) => void;
  onPressEdit: (cat: UserCategory) => void;
  onDragActivated: (itemIndex: number) => void;
  onDropCommit: (from: number, to: number, catId: string) => void;
  onItemDropped: (catId: string) => void;
  shouldSuppressPress: (catId: string) => boolean;
}

function DraggableItem({
  cat,
  index,
  total,
  activeIndexSV,
  activeIdSV,
  hoverIndexSV,
  droppingIdSV,
  dropOffsetSV,
  dropFromSV,
  dropToSV,
  dropDragSV,
  dropAnimStartedSV,
  dragDYSV,
  commitGenSV,
  scrollYSV,
  initialScrollYSV,
  dragZoneTopSV,
  dragZoneBottomSV,
  dragViewportTopSV,
  dragViewportBottomSV,
  dragPadBottomSV,
  itemScreenYAtStartSV,
  dragAbsoluteYSV,
  adjustZonesForPageScrollSV,
  onToggleHidden,
  onPressEdit,
  onDragActivated,
  onDropCommit,
  onItemDropped,
  shouldSuppressPress,
}: DraggableItemProps) {
  const { C, mode } = useTheme();
  const isHidden = cat.hidden;
  const catId = cat.id;
  const tabActiveBg = mode === "dark" ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.06)";
  const isHoldingSV = useSharedValue(false);

  const rowSurfaceStyle = useAnimatedStyle(() => {
    // Press highlight only during long-press wait — not during drag or drop snap
    const active = isHoldingSV.value && activeIdSV.value === "";
    return {
      backgroundColor: active ? tabActiveBg : C.tabBg,
      borderColor: C.tabBorder,
    };
  });

  const animStyle = useAnimatedStyle(() => {
    const ai = activeIndexSV.value;
    const hi = hoverIndexSV.value;
    const droppingId = droppingIdSV.value;

    if (droppingId === catId) {
      return {
        transform: [
          { translateY: dropOffsetSV.value },
          { scale: withSpring(1, SNAP_SPRING) },
        ],
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.22,
        shadowRadius: 12,
        elevation: 10,
        zIndex: 999,
        opacity: 0.97,
      };
    }

    // Id-stable drag visual — survives index change after flushSync reorder
    if (activeIdSV.value === catId) {
      const scrollDelta = scrollYSV.value - initialScrollYSV.value;
      const translateY = resolveDragTranslateY(
        dragDYSV.value,
        itemScreenYAtStartSV.value,
        scrollDelta,
        dragZoneTopSV.value,
        dragZoneBottomSV.value,
        LIST_PADDING_TOP,
        dragPadBottomSV.value,
        adjustZonesForPageScrollSV.value === 1,
      );
      return {
        transform: [
          { translateY },
          { scale: withSpring(1.05, PICKUP_SCALE_SPRING) },
        ],
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.22,
        shadowRadius: 12,
        elevation: 10,
        zIndex: 999,
        opacity: 0.97,
      };
    }

    if (ai < 0) {
      return {
        transform: [
          { translateY: 0 },
          { scale: 1 },
        ],
        shadowOpacity: 0,
        elevation: 0,
        zIndex: 1,
        opacity: 1,
      };
    }

    // Calculate how much this item shifts to make room for the dragged one
    let displacement = 0;
    if (ai < hi) {
      if (index > ai && index <= hi) displacement = -ITEM_STEP;
    } else if (ai > hi) {
      if (index >= hi && index < ai) displacement = ITEM_STEP;
    }

    return {
      transform: [
        { translateY: withSpring(displacement, DRAG_SPRING) },
        { scale: withSpring(1, NEIGHBOR_SPRING) },
      ],
      shadowOpacity: 0,
      elevation: 0,
      zIndex: 1,
      opacity: 1,
    };
  });

  const unlockDrag = () => {
    "worklet";
    activeIndexSV.value = -1;
    hoverIndexSV.value = -1;
    activeIdSV.value = "";
  };

  const clearDropAnimation = () => {
    "worklet";
    droppingIdSV.value = "";
    activeIdSV.value = "";
    dropAnimStartedSV.value = 0;
    cancelAnimation(dropOffsetSV);
    dropOffsetSV.value = 0;
    cancelAnimation(dragDYSV);
    dragDYSV.value = 0;
  };

  const gesture = Gesture.Pan()
    .activateAfterLongPress(350)
    .onBegin(() => {
      "worklet";
      isHoldingSV.value = true;
    })
    .onStart((e) => {
      "worklet";
      isHoldingSV.value = false;
      commitGenSV.value += 1;
      unlockDrag();
      clearDropAnimation();
      activeIdSV.value = catId;
      activeIndexSV.value = index;
      hoverIndexSV.value = index;
      initialScrollYSV.value = scrollYSV.value;
      dragAbsoluteYSV.value = e.absoluteY;
      scheduleOnRN(onDragActivated, index);
    })
    .onChange((e) => {
      "worklet";
      if (activeIdSV.value !== catId) return;
      dragDYSV.value = e.translationY;
      dragAbsoluteYSV.value = e.absoluteY;
      const scrollDelta = scrollYSV.value - initialScrollYSV.value;
      const dragOffset = resolveDragTranslateY(
        e.translationY,
        itemScreenYAtStartSV.value,
        scrollDelta,
        dragZoneTopSV.value,
        dragZoneBottomSV.value,
        LIST_PADDING_TOP,
        dragPadBottomSV.value,
        adjustZonesForPageScrollSV.value === 1,
      );
      hoverIndexSV.value = resolveHoverIndexFromDragOffset(index, dragOffset, total);
    })
    .onEnd(() => {
      "worklet";
      if (activeIdSV.value !== catId) return;
      isHoldingSV.value = false;
      const from = index;
      const to = hoverIndexSV.value;
      const gen = commitGenSV.value;
      const scrollDelta = scrollYSV.value - initialScrollYSV.value;
      const dragOffset = resolveDragTranslateY(
        dragDYSV.value,
        itemScreenYAtStartSV.value,
        scrollDelta,
        dragZoneTopSV.value,
        dragZoneBottomSV.value,
        LIST_PADDING_TOP,
        dragPadBottomSV.value,
        adjustZonesForPageScrollSV.value === 1,
      );
      const endOffset = (from - to) * ITEM_STEP + dragOffset;

      // #region agent log
      scheduleOnRN(debugLog, "onEnd", "drop end — defer visual handoff", {
        catId, from, to, dragAtEnd: dragDYSV.value, scrollDelta, dragOffset, endOffset, gen,
      }, "H1");
      // #endregion

      // Capture only — keep drag visual (activeId + dragDYSV) until flushSync + finishDropSnap
      dropFromSV.value = from;
      dropToSV.value = to;
      dropDragSV.value = dragOffset;
      dropAnimStartedSV.value = 0;

      scheduleOnRN(onItemDropped, catId);
      scheduleOnRN(onDropCommit, from, to, catId);
    })
    .onFinalize((_e, success) => {
      "worklet";
      isHoldingSV.value = false;
      // Only reset on cancelled gestures — successful drops hand off via onDropCommit → finishDropSnap
      if (!success && activeIdSV.value === catId) {
        unlockDrag();
        clearDropAnimation();
      }
    });

  return (
    <GestureDetector gesture={gesture}>
      <ReAnimated.View
        style={[
          {
            borderRadius: 12,
            // Shadow shape must match inner border radius
          },
          animStyle,
        ]}
      >
        {/* Inner: border + overflow clip — unified active surface across toggle + edit */}
        <ReAnimated.View
          style={[
            {
              flexDirection: "row",
              alignItems: "stretch",
              borderRadius: 12,
              borderWidth: 1,
              overflow: "hidden",
              height: ITEM_H,
            },
            rowSurfaceStyle,
          ]}
        >
          {/* Toggle visibility — full row minus edit area */}
          <GHPressable
            onPress={() => {
              if (shouldSuppressPress(cat.id)) return;
              onToggleHidden(cat.id);
            }}
            style={{ flex: 1 }}
          >
            {() => (
              <View
                style={{
                  flex: 1,
                  flexDirection: "row",
                  alignItems: "center",
                  paddingLeft: 14,
                  paddingRight: 10,
                }}
              >
                <View
                  style={{
                    width: 22,
                    height: 22,
                    borderRadius: 6,
                    backgroundColor: cat.color,
                    opacity: isHidden ? 0.3 : 1,
                    marginRight: 12,
                  }}
                />
                <Text
                  style={{
                    flex: 1,
                    fontSize: 16,
                    fontWeight: "500",
                    color: isHidden ? C.secondary : C.text,
                  }}
                  numberOfLines={1}
                >
                  {cat.name}
                </Text>
                {isHidden && (
                  <View style={{ marginRight: 4, opacity: 0.55 }}>
                    <EyeOff size={15} color={C.secondary} />
                  </View>
                )}
              </View>
            )}
          </GHPressable>

          {/* Edit — no divider, same background & hidden-opacity as the row */}
          <GHPressable
            onPress={() => onPressEdit(cat)}
            hitSlop={6}
            style={{
              paddingHorizontal: 18,
              alignItems: "center",
              justifyContent: "center",
              opacity: isHidden ? 0.4 : 1,
            }}
          >
            {({ pressed }) => (
              <Pencil size={17} color={pressed ? C.text : C.secondary} />
            )}
          </GHPressable>
        </ReAnimated.View>
      </ReAnimated.View>
    </GestureDetector>
  );
}

// ── SortableList ────────────────────────────────────────────────────────────────

interface SortableListProps {
  items: UserCategory[];
  onCommitDropReorder: (from: number, to: number) => void;
  onPersistReorder: (from: number, to: number) => void;
  onToggleHidden: (id: string) => void;
  onPressEdit: (cat: UserCategory) => void;
  fillScreen?: boolean;
  pageScroll?: PageScrollBinding;
  headerRef?: RefObject<View | null>;
  sectionRef?: RefObject<View | null>;
  bottomClampRef?: RefObject<View | null>;
}

function SortableList({
  items,
  onCommitDropReorder,
  onPersistReorder,
  onToggleHidden,
  onPressEdit,
  fillScreen = true,
  pageScroll,
  headerRef,
  sectionRef,
  bottomClampRef,
}: SortableListProps) {
  const { C } = useTheme();
  const insets = useSafeAreaInsets();
  const listPadBottom = fillScreen
    ? Math.max(insets.bottom, LIST_PADDING_BOTTOM_MIN)
    : LIST_PADDING_BOTTOM_EMBEDDED;
  const usesPageScroll = pageScroll != null;

  const activeIndexSV = useSharedValue(-1);
  const activeIdSV = useSharedValue("");
  const hoverIndexSV = useSharedValue(-1);
  const droppingIdSV = useSharedValue("");
  const dropOffsetSV = useSharedValue(0);
  const dropFromSV = useSharedValue(-1);
  const dropToSV = useSharedValue(-1);
  const dropDragSV = useSharedValue(0);
  const dropAnimStartedSV = useSharedValue(0);
  const dragDYSV = useSharedValue(0);
  const commitGenSV = useSharedValue(0);
  const scrollYSV = useSharedValue(0);
  const initialScrollYSV = useSharedValue(0);
  const dragZoneTopSV = useSharedValue(0);
  const dragZoneBottomSV = useSharedValue(0);
  const dragViewportTopSV = useSharedValue(0);
  const dragViewportBottomSV = useSharedValue(0);
  const dragPadBottomSV = useSharedValue(LIST_PADDING_BOTTOM_EMBEDDED);
  const itemScreenYAtStartSV = useSharedValue(0);
  const dragAbsoluteYSV = useSharedValue(0);
  const itemTotalSV = useSharedValue(0);
  const adjustZonesForPageScrollSV = useSharedValue(usesPageScroll ? 1 : 0);
  const dragScrollYSV = pageScroll?.scrollYSV ?? scrollYSV;

  useLayoutEffect(() => {
    adjustZonesForPageScrollSV.value = usesPageScroll ? 1 : 0;
  }, [adjustZonesForPageScrollSV, usesPageScroll]);

  const scrollRef = useRef<ComponentRef<typeof GHScrollView>>(null);
  const scrollOffsetRef = useRef(0);
  const scrollViewportHeightRef = useRef(0);
  const scrollMaxYRef = useRef(0);
  const dragZoneRef = useRef({
    top: 0,
    bottom: 0,
    viewportTop: 0,
    viewportBottom: 0,
    padTop: LIST_PADDING_TOP,
    padBottom: LIST_PADDING_BOTTOM_EMBEDDED,
  });
  const listViewRef = useRef<View>(null);
  const lastDropRef = useRef<{ catId: string; at: number }>({ catId: "", at: 0 });
  const pendingFinishDropRef = useRef<string>("");

  const orderKey = items.map((c) => c.id).join("|");

  useLayoutEffect(() => {
    itemTotalSV.value = items.length;
  }, [items.length, itemTotalSV]);

  const performAutoScrollRef = useRef<(absoluteY: number) => void>(() => {});

  const performAutoScroll = useCallback((absoluteY: number) => {
    const scrollBinding = pageScroll ?? {
      scrollRef,
      scrollOffsetRef,
      scrollMaxYRef,
      scrollYSV,
    };
    let viewportTop: number;
    let viewportBottom: number;
    let padTop: number;
    let padBottom: number;
    if (pageScroll) {
      const vp = pageScroll.viewportRef.current;
      viewportTop = vp.top;
      viewportBottom = vp.bottom;
      padTop = LIST_PADDING_TOP;
      padBottom = listPadBottom;
    } else {
      ({ viewportTop, viewportBottom, padTop, padBottom } = dragZoneRef.current);
    }
    if (viewportBottom <= viewportTop) return;
    const bottomEdge = viewportBottom - padBottom - AUTO_SCROLL_ZONE;
    const topEdge = viewportTop + padTop + AUTO_SCROLL_ZONE;
    if (absoluteY > bottomEdge) {
      const newY = Math.min(scrollBinding.scrollMaxYRef.current, scrollBinding.scrollOffsetRef.current + AUTO_SCROLL_SPEED);
      if (newY === scrollBinding.scrollOffsetRef.current) return;
      scrollBinding.scrollOffsetRef.current = newY;
      scrollBinding.scrollYSV.value = newY;
      scrollBinding.scrollRef.current?.scrollTo({ y: newY, animated: false });
    } else if (absoluteY < topEdge) {
      const newY = Math.max(0, scrollBinding.scrollOffsetRef.current - AUTO_SCROLL_SPEED);
      if (newY === scrollBinding.scrollOffsetRef.current) return;
      scrollBinding.scrollOffsetRef.current = newY;
      scrollBinding.scrollYSV.value = newY;
      scrollBinding.scrollRef.current?.scrollTo({ y: newY, animated: false });
    }
  }, [listPadBottom, pageScroll, scrollYSV]);

  useLayoutEffect(() => {
    performAutoScrollRef.current = performAutoScroll;
  }, [performAutoScroll]);

  const runAutoScroll = useCallback((absoluteY: number) => {
    performAutoScrollRef.current(absoluteY);
  }, []);

  useFrameCallback(() => {
    "worklet";
    if (activeIdSV.value === "") return;
    scheduleOnRN(runAutoScroll, dragAbsoluteYSV.value);
  });

  useAnimatedReaction(
    () => ({
      scrollY: dragScrollYSV.value,
      activeId: activeIdSV.value,
    }),
    ({ scrollY, activeId }) => {
      if (!activeId || activeIndexSV.value < 0) return;
      const scrollDelta = scrollY - initialScrollYSV.value;
      const dragOffset = resolveDragTranslateY(
        dragDYSV.value,
        itemScreenYAtStartSV.value,
        scrollDelta,
        dragZoneTopSV.value,
        dragZoneBottomSV.value,
        LIST_PADDING_TOP,
        dragPadBottomSV.value,
        adjustZonesForPageScrollSV.value === 1,
      );
      hoverIndexSV.value = resolveHoverIndexFromDragOffset(
        activeIndexSV.value,
        dragOffset,
        itemTotalSV.value,
      );
    },
  );

  const markDrop = useCallback((catId: string) => {
    lastDropRef.current = { catId, at: Date.now() };
  }, []);

  const shouldSuppressPress = useCallback((catId: string) => {
    const { catId: lastId, at } = lastDropRef.current;
    return lastId === catId && Date.now() - at < 200;
  }, []);

  const onDragActivated = useCallback((itemIndex: number) => {
    Vibration.vibrate(40);
    dragPadBottomSV.value = listPadBottom;

    const scrollOffset = pageScroll?.scrollOffsetRef.current ?? scrollOffsetRef.current;

    const applyZone = (
      zoneTop: number,
      zoneBottom: number,
      viewportTop: number,
      viewportBottom: number,
      listTopScreenY: number,
    ) => {
      dragZoneRef.current = {
        top: zoneTop,
        bottom: zoneBottom,
        viewportTop,
        viewportBottom,
        padTop: LIST_PADDING_TOP,
        padBottom: listPadBottom,
      };
      dragZoneTopSV.value = zoneTop;
      dragZoneBottomSV.value = zoneBottom;
      dragViewportTopSV.value = viewportTop;
      dragViewportBottomSV.value = viewportBottom;
      itemScreenYAtStartSV.value =
        listTopScreenY + LIST_PADDING_TOP + itemIndex * ITEM_STEP - scrollOffset;
    };

    const header = headerRef?.current;
    const section = sectionRef?.current;
    if (header && section) {
      header.measureInWindow((_hx, hy, _hw, hh) => {
        const zoneTop = hy + hh;
        const applyWithZoneBottom = (zoneBottom: number) => {
          listViewRef.current?.measureInWindow((_x, vy, _w, vh) => {
            applyZone(zoneTop, zoneBottom, vy, vy + vh, vy);
          });
        };
        const nextHeader = bottomClampRef?.current;
        if (nextHeader) {
          nextHeader.measureInWindow((_bx, by, _bw, _bh) => {
            applyWithZoneBottom(by);
          });
          return;
        }
        section.measureInWindow((_sx, _sy, _sw, sh) => {
          applyWithZoneBottom(_sy + sh);
        });
      });
      return;
    }

    listViewRef.current?.measureInWindow((_x, y, _w, h) => {
      applyZone(y, y + h, y, y + h, y);
    });
  }, [bottomClampRef, dragPadBottomSV, dragViewportBottomSV, dragViewportTopSV, dragZoneBottomSV, dragZoneTopSV, headerRef, itemScreenYAtStartSV, listPadBottom, pageScroll, sectionRef]);

  const handleDropCommit = useCallback(
    (from: number, to: number, catId: string) => {
      // #region agent log
      debugLog("onDropCommit", "drop commit start", { from, to, catId, t: Date.now() }, "H4");
      // #endregion
      pendingFinishDropRef.current = catId;
      if (from !== to) {
        onCommitDropReorder(from, to);
        void onPersistReorder(from, to);
        return;
      }
      pendingFinishDropRef.current = "";
      runOnUI((id: string) => {
        "worklet";
        finishDropSnap(
          dropFromSV,
          dropToSV,
          dropDragSV,
          dropOffsetSV,
          droppingIdSV,
          activeIdSV,
          activeIndexSV,
          hoverIndexSV,
          dragDYSV,
          dropAnimStartedSV,
          id,
        );
      })(catId);
    },
    [
      onCommitDropReorder,
      onPersistReorder,
      dropFromSV,
      dropToSV,
      dropDragSV,
      dropOffsetSV,
      droppingIdSV,
      activeIdSV,
      activeIndexSV,
      hoverIndexSV,
      dragDYSV,
      dropAnimStartedSV,
    ],
  );

  // Bridge frame gap: snap only after React Native commits the reordered layout
  useLayoutEffect(() => {
    const catId = pendingFinishDropRef.current;
    if (!catId) return;
    pendingFinishDropRef.current = "";
    // #region agent log
    debugLog("useLayoutEffect", "layout committed — finishDropSnap", { catId, orderKey, t: Date.now() }, "H5");
    // #endregion
    runOnUI((id: string) => {
      "worklet";
      finishDropSnap(
        dropFromSV,
        dropToSV,
        dropDragSV,
        dropOffsetSV,
        droppingIdSV,
        activeIdSV,
        activeIndexSV,
        hoverIndexSV,
        dragDYSV,
        dropAnimStartedSV,
        id,
      );
    })(catId);
  }, [orderKey, dropFromSV, dropToSV, dropDragSV, dropOffsetSV, droppingIdSV, activeIdSV, activeIndexSV, hoverIndexSV, dragDYSV, dropAnimStartedSV]);

  const listContent = (
    <>
      {items.map((cat, i) => (
        <DraggableItem
          key={cat.id}
          cat={cat}
          index={i}
          total={items.length}
          activeIndexSV={activeIndexSV}
          activeIdSV={activeIdSV}
          hoverIndexSV={hoverIndexSV}
          droppingIdSV={droppingIdSV}
          dropOffsetSV={dropOffsetSV}
          dropFromSV={dropFromSV}
          dropToSV={dropToSV}
          dropDragSV={dropDragSV}
          dropAnimStartedSV={dropAnimStartedSV}
          dragDYSV={dragDYSV}
          commitGenSV={commitGenSV}
          scrollYSV={dragScrollYSV}
          initialScrollYSV={initialScrollYSV}
          dragZoneTopSV={dragZoneTopSV}
          dragZoneBottomSV={dragZoneBottomSV}
          dragViewportTopSV={dragViewportTopSV}
          dragViewportBottomSV={dragViewportBottomSV}
          dragPadBottomSV={dragPadBottomSV}
          itemScreenYAtStartSV={itemScreenYAtStartSV}
          dragAbsoluteYSV={dragAbsoluteYSV}
          adjustZonesForPageScrollSV={adjustZonesForPageScrollSV}
          onToggleHidden={onToggleHidden}
          onPressEdit={onPressEdit}
          onDragActivated={onDragActivated}
          onDropCommit={handleDropCommit}
          onItemDropped={markDrop}
          shouldSuppressPress={shouldSuppressPress}
        />
      ))}

      {items.length === 0 && (
        <Text
          style={{
            color: C.secondary,
            fontSize: 15,
            textAlign: "center",
            marginTop: 40,
          }}
        >
          No activities yet. Tap + to add one.
        </Text>
      )}
    </>
  );

  const listContainerStyle = {
    paddingTop: LIST_PADDING_TOP,
    paddingHorizontal: 16,
    paddingBottom: listPadBottom,
    gap: ITEM_GAP,
  };

  return (
    <View
      ref={listViewRef}
      style={fillScreen ? { flex: 1, overflow: "hidden" } : { overflow: "hidden" }}
    >
      {usesPageScroll ? (
        <View style={listContainerStyle}>{listContent}</View>
      ) : (
        <GHScrollView
          ref={scrollRef}
          style={{ flex: 1 }}
          nestedScrollEnabled
          onLayout={(e) => {
            scrollViewportHeightRef.current = e.nativeEvent.layout.height;
          }}
          onContentSizeChange={(_w, h) => {
            scrollMaxYRef.current = Math.max(0, h - scrollViewportHeightRef.current);
          }}
          contentContainerStyle={listContainerStyle}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          onScroll={(e) => {
            scrollOffsetRef.current = e.nativeEvent.contentOffset.y;
            scrollYSV.value = e.nativeEvent.contentOffset.y;
          }}
          scrollEventThrottle={16}
        >
          {listContent}
        </GHScrollView>
      )}
    </View>
  );
}

// ── ActivitySection ─────────────────────────────────────────────────────────────

function ActivitySection({
  title,
  categories,
  groupId,
  onCreate,
  onUpdate,
  onRemove,
  defaultOpen = true,
  fillScreen = true,
  isTopSection = false,
  pageScroll,
  headerRef: externalHeaderRef,
  bottomClampRef,
  onEditOpen,
}: {
  title: string;
  categories: UserCategory[];
  groupId: string | null;
  onCreate: Props["onCreate"];
  onUpdate: Props["onUpdate"];
  onRemove: Props["onRemove"];
  defaultOpen?: boolean;
  fillScreen?: boolean;
  isTopSection?: boolean;
  pageScroll?: PageScrollBinding;
  headerRef?: RefObject<View | null>;
  bottomClampRef?: RefObject<View | null>;
  onEditOpen: (state: NonNullable<EditState>) => void;
}) {
  const { C } = useTheme();
  const insets = useSafeAreaInsets();
  const sectionRef = useRef<View>(null);
  const internalHeaderRef = useRef<View>(null);
  const headerRef = externalHeaderRef ?? internalHeaderRef;
  const [sectionOpen, setSectionOpen] = useState(defaultOpen);
  const [localItems, setLocalItems] = useState<UserCategory[]>(categories);
  const localItemsRef = useRef(localItems);
  localItemsRef.current = localItems;

  useEffect(() => {
    setLocalItems((prev) => {
      if (categories.length === 0) return categories;
      if (prev.length === 0) return categories;

      const byId = new Map(categories.map((c) => [c.id, c]));
      const next: UserCategory[] = [];

      for (const item of prev) {
        const updated = byId.get(item.id);
        if (updated) {
          next.push(updated);
          byId.delete(item.id);
        }
      }

      for (const cat of categories) {
        if (byId.has(cat.id)) next.push(byId.get(cat.id)!);
      }

      const unchanged =
        next.length === prev.length &&
        next.every(
          (c, i) =>
            c.id === prev[i].id &&
            c.hidden === prev[i].hidden &&
            c.name === prev[i].name &&
            c.color === prev[i].color &&
            c.sort_order === prev[i].sort_order,
        );

      return unchanged ? prev : next;
    });
  }, [categories]);

  const handleAdd = async () => {
    const created = await onCreate(NEW_ACTIVITY_NAME, SWATCHES[5], groupId);
    if (created) {
      setSectionOpen(true);
      setLocalItems((prev) => {
        if (prev.some((c) => c.id === created.id)) return prev;
        return [...prev, created].sort((a, b) => a.sort_order - b.sort_order);
      });
      onEditOpen({
        cat: created,
        name: "",
        color: created.color,
        colorPickerOpen: false,
        isNew: true,
      });
    } else {
      Alert.alert(
        "Could not add activity",
        "Your activity list could not be saved. Check your connection and try again.",
      );
    }
  };

  const handleToggleHidden = useCallback(
    (id: string) => {
      const cat = localItemsRef.current.find((c) => c.id === id);
      if (!cat) return;
      setLocalItems((prev) =>
        prev.map((c) => (c.id === id ? { ...c, hidden: !c.hidden } : c)),
      );
      void onUpdate(id, { hidden: !cat.hidden });
    },
    [onUpdate],
  );

  const commitDropReorder = useCallback((from: number, to: number) => {
    if (from === to) return;
    setLocalItems((prev) => {
      const newItems = [...prev];
      const [moved] = newItems.splice(from, 1);
      newItems.splice(to, 0, moved);
      const next = newItems.map((item, i) => ({ ...item, sort_order: i }));
      localItemsRef.current = next;
      return next;
    });
  }, []);

  const persistReorder = useCallback(async (from: number, to: number) => {
    if (from === to) return;
    const newItems = localItemsRef.current;
    await Promise.all(
      newItems.map((item, i) =>
        supabase
          .from("calendar_categories")
          .update({ sort_order: i })
          .eq("id", item.id),
      ),
    );
  }, []);

  const sectionHeader = (
    <PageHeader
      paddingHorizontal={20}
      fadeInsetRight={32}
      backgroundColor={C.inputBg}
      style={isTopSection ? { borderTopWidth: 0 } : undefined}
      trailing={(
        <Pressable onPress={() => void handleAdd()} hitSlop={12}>
          <Plus size={groupId ? 22 : 24} color={C.secondary} />
        </Pressable>
      )}
    >
      <Pressable
        onPress={() => setSectionOpen((o) => !o)}
        style={{ flex: 1, flexDirection: "row", alignItems: "center", gap: 8, minWidth: 0 }}
        hitSlop={8}
      >
        <View style={{ transform: [{ rotate: sectionOpen ? "90deg" : "0deg" }] }}>
          <ChevronRight size={17} color={C.secondary} />
        </View>
        <FadedTitle
          text={title}
          fontSize={groupId ? 17 : 20}
          fontWeight="700"
        />
      </Pressable>
    </PageHeader>
  );

  return (
    <View ref={sectionRef} collapsable={false} style={fillScreen ? { flex: 1 } : undefined}>
      <View ref={headerRef} collapsable={false}>
        {isTopSection ? (
          <View style={{ backgroundColor: C.inputBg }}>
            <View style={{ paddingTop: insets.top }}>{sectionHeader}</View>
          </View>
        ) : (
          sectionHeader
        )}
      </View>
      {sectionOpen ? (
        <SortableList
          items={localItems}
          fillScreen={fillScreen}
          pageScroll={pageScroll}
          headerRef={headerRef}
          sectionRef={sectionRef}
          bottomClampRef={bottomClampRef}
          onCommitDropReorder={commitDropReorder}
          onPersistReorder={persistReorder}
          onToggleHidden={handleToggleHidden}
          onPressEdit={(cat) =>
            onEditOpen({ cat, name: cat.name, color: cat.color, colorPickerOpen: false, isNew: false })
          }
        />
      ) : null}
    </View>
  );
}


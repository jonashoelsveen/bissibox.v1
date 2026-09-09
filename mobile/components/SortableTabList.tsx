import { Text, Vibration, View } from "react-native";
import { ScrollView as GHScrollView, Pressable as GHPressable } from "react-native-gesture-handler";
import { scheduleOnRN } from "react-native-worklets";
import ReAnimated, {
  cancelAnimation,
  runOnUI,
  useSharedValue,
  useAnimatedStyle,
  withSpring,
} from "react-native-reanimated";
import type { SharedValue } from "react-native-reanimated";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import { ChevronRight } from "lucide-react-native";
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ComponentRef } from "react";
import { useTheme } from "@/lib/theme";

export const SORTABLE_ITEM_H = 52;
const ITEM_GAP = 6;
const ITEM_STEP = SORTABLE_ITEM_H + ITEM_GAP;

const PICKUP_SCALE_SPRING = { damping: 14, stiffness: 220, mass: 0.85 };
const SNAP_SPRING = { damping: 28, stiffness: 190, mass: 1 };
const DRAG_SPRING = { damping: 40, stiffness: 300 };
const NEIGHBOR_SPRING = { damping: 16, stiffness: 200, mass: 0.9 };

export type SortableTabItem = {
  id: string;
  label: string;
};

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
  itemId: string,
) {
  "worklet";
  if (dropAnimStartedSV.value) return;
  dropAnimStartedSV.value = 1;
  activeIdSV.value = "";
  cancelAnimation(dragDYSV);
  dragDYSV.value = 0;
  activeIndexSV.value = -1;
  hoverIndexSV.value = -1;
  droppingIdSV.value = itemId;
  const from = dropFromSV.value;
  const to = dropToSV.value;
  const endOffset = from === to ? dropDragSV.value : (from - to) * ITEM_STEP + dropDragSV.value;
  cancelAnimation(dropOffsetSV);
  dropOffsetSV.value = endOffset;
  dropOffsetSV.value = withSpring(0, SNAP_SPRING, (finished) => {
    if (finished) {
      droppingIdSV.value = "";
      dropOffsetSV.value = 0;
      dropAnimStartedSV.value = 0;
    }
  });
}

function DraggableTabItem({
  item,
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
  onPressEdit,
  onDragActivated,
  onDropCommit,
  onAutoScroll,
}: {
  item: SortableTabItem;
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
  onPressEdit: (item: SortableTabItem) => void;
  onDragActivated: () => void;
  onDropCommit: (from: number, to: number, itemId: string) => void;
  onAutoScroll: (absoluteY: number) => void;
}) {
  const { C, mode } = useTheme();
  const itemId = item.id;
  const tabActiveBg = mode === "dark" ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.06)";
  const isHoldingSV = useSharedValue(false);

  const rowSurfaceStyle = useAnimatedStyle(() => {
    const active =
      isHoldingSV.value ||
      activeIdSV.value === itemId ||
      droppingIdSV.value === itemId;
    return {
      backgroundColor: active ? tabActiveBg : C.tabBg,
      borderColor: C.tabBorder,
    };
  });

  const animStyle = useAnimatedStyle(() => {
    const ai = activeIndexSV.value;
    const hi = hoverIndexSV.value;
    const droppingId = droppingIdSV.value;

    if (droppingId === itemId) {
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

    if (activeIdSV.value === itemId) {
      const scrollDelta = scrollYSV.value - initialScrollYSV.value;
      return {
        transform: [
          { translateY: dragDYSV.value + scrollDelta },
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
        transform: [{ translateY: 0 }, { scale: 1 }],
        shadowOpacity: 0,
        elevation: 0,
        zIndex: 1,
        opacity: 1,
      };
    }

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
    .onStart(() => {
      "worklet";
      commitGenSV.value += 1;
      unlockDrag();
      clearDropAnimation();
      activeIdSV.value = itemId;
      activeIndexSV.value = index;
      hoverIndexSV.value = index;
      initialScrollYSV.value = scrollYSV.value;
      scheduleOnRN(onDragActivated);
    })
    .onChange((e) => {
      "worklet";
      if (activeIdSV.value !== itemId) return;
      dragDYSV.value = e.translationY;
      const scrollDelta = scrollYSV.value - initialScrollYSV.value;
      const rawIndex = index + Math.round((e.translationY + scrollDelta) / ITEM_STEP);
      hoverIndexSV.value = Math.max(0, Math.min(total - 1, rawIndex));
      scheduleOnRN(onAutoScroll, e.absoluteY);
    })
    .onEnd(() => {
      "worklet";
      if (activeIdSV.value !== itemId) return;
      const from = index;
      const to = hoverIndexSV.value;
      const scrollDelta = scrollYSV.value - initialScrollYSV.value;
      const dragOffset = dragDYSV.value + scrollDelta;

      dropFromSV.value = from;
      dropToSV.value = to;
      dropDragSV.value = dragOffset;
      dropAnimStartedSV.value = 0;

      scheduleOnRN(onDropCommit, from, to, itemId);
    })
    .onFinalize((_e, success) => {
      "worklet";
      isHoldingSV.value = false;
      if (!success && activeIdSV.value === itemId) {
        unlockDrag();
        clearDropAnimation();
      }
    });

  return (
    <GestureDetector gesture={gesture}>
      <ReAnimated.View style={[{ borderRadius: 12 }, animStyle]}>
        <ReAnimated.View
          style={[
            {
              flexDirection: "row",
              alignItems: "stretch",
              borderRadius: 12,
              borderWidth: 1,
              overflow: "hidden",
              height: SORTABLE_ITEM_H,
            },
            rowSurfaceStyle,
          ]}
        >
          <GHPressable
            onPress={() => onPressEdit(item)}
            style={{
              flex: 1,
              flexDirection: "row",
              alignItems: "center",
              paddingLeft: 14,
              paddingRight: 14,
            }}
          >
            {({ pressed }) => (
              <>
                <Text
                  style={{ flex: 1, fontSize: 16, fontWeight: "500", color: C.text }}
                  numberOfLines={1}
                >
                  {item.label}
                </Text>
                <ChevronRight size={17} color={pressed ? C.text : C.secondary} />
              </>
            )}
          </GHPressable>
        </ReAnimated.View>
      </ReAnimated.View>
    </GestureDetector>
  );
}

export function SortableTabList({
  items: externalItems,
  onReorder,
  onPressEdit,
  emptyMessage = "No items yet.",
  bottomInset = 0,
}: {
  items: SortableTabItem[];
  onReorder: (from: number, to: number) => void | Promise<void>;
  onPressEdit: (item: SortableTabItem) => void;
  emptyMessage?: string;
  bottomInset?: number;
}) {
  const { C } = useTheme();
  const [localItems, setLocalItems] = useState<SortableTabItem[]>(externalItems);
  const localItemsRef = useRef(localItems);
  localItemsRef.current = localItems;

  useEffect(() => {
    setLocalItems((prev) => {
      if (externalItems.length === 0) return externalItems;
      if (prev.length === 0) return externalItems;

      const byId = new Map(externalItems.map((g) => [g.id, g]));
      const next: SortableTabItem[] = [];

      for (const item of prev) {
        const updated = byId.get(item.id);
        if (updated) {
          next.push(updated);
          byId.delete(item.id);
        }
      }

      for (const g of externalItems) {
        if (byId.has(g.id)) next.push(byId.get(g.id)!);
      }

      const unchanged =
        next.length === prev.length &&
        next.every((g, i) => g.id === prev[i].id && g.label === prev[i].label);

      return unchanged ? prev : next;
    });
  }, [externalItems]);

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

  const scrollRef = useRef<ComponentRef<typeof GHScrollView>>(null);
  const scrollOffsetRef = useRef(0);
  const listBoundsRef = useRef({ top: 0, bottom: 0 });
  const listViewRef = useRef<View>(null);
  const pendingFinishDropRef = useRef<string>("");

  const orderKey = localItems.map((g) => g.id).join("|");

  const onDragActivated = useCallback(() => {
    Vibration.vibrate(40);
    listViewRef.current?.measureInWindow((_, y, __, h) => {
      listBoundsRef.current = { top: y, bottom: y + h };
    });
  }, []);

  const onAutoScroll = useCallback((absoluteY: number) => {
    const { top, bottom } = listBoundsRef.current;
    const ZONE = 44;
    const SPEED = 8;
    if (absoluteY > bottom - ZONE) {
      const newY = scrollOffsetRef.current + SPEED;
      scrollOffsetRef.current = newY;
      scrollYSV.value = newY;
      scrollRef.current?.scrollTo({ y: newY, animated: false });
    } else if (absoluteY < top + ZONE && scrollOffsetRef.current > 0) {
      const newY = Math.max(0, scrollOffsetRef.current - SPEED);
      scrollOffsetRef.current = newY;
      scrollYSV.value = newY;
      scrollRef.current?.scrollTo({ y: newY, animated: false });
    }
  }, [scrollYSV]);

  const commitDropReorder = useCallback((from: number, to: number) => {
    if (from === to) return;
    setLocalItems((prev) => {
      const newItems = [...prev];
      const [moved] = newItems.splice(from, 1);
      newItems.splice(to, 0, moved);
      localItemsRef.current = newItems;
      return newItems;
    });
  }, []);

  const handleDropCommit = useCallback(
    (from: number, to: number, itemId: string) => {
      pendingFinishDropRef.current = itemId;
      if (from !== to) {
        commitDropReorder(from, to);
        void onReorder(from, to);
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
      })(itemId);
    },
    [
      commitDropReorder,
      onReorder,
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

  useLayoutEffect(() => {
    const itemId = pendingFinishDropRef.current;
    if (!itemId) return;
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
    })(itemId);
  }, [orderKey, dropFromSV, dropToSV, dropDragSV, dropOffsetSV, droppingIdSV, activeIdSV, activeIndexSV, hoverIndexSV, dragDYSV, dropAnimStartedSV]);

  return (
    <View ref={listViewRef} style={{ flex: 1 }}>
      <GHScrollView
        ref={scrollRef}
        style={{ flex: 1 }}
        nestedScrollEnabled
        contentContainerStyle={{
          paddingTop: 12,
          paddingHorizontal: 16,
          paddingBottom: bottomInset || 12,
          gap: ITEM_GAP,
        }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        onScroll={(e) => {
          scrollOffsetRef.current = e.nativeEvent.contentOffset.y;
          scrollYSV.value = e.nativeEvent.contentOffset.y;
        }}
        scrollEventThrottle={16}
      >
        {localItems.map((item, i) => (
          <DraggableTabItem
            key={item.id}
            item={item}
            index={i}
            total={localItems.length}
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
            scrollYSV={scrollYSV}
            initialScrollYSV={initialScrollYSV}
            onPressEdit={onPressEdit}
            onDragActivated={onDragActivated}
            onDropCommit={handleDropCommit}
            onAutoScroll={onAutoScroll}
          />
        ))}

        {localItems.length === 0 && (
          <Text style={{ color: C.secondary, fontSize: 15, textAlign: "center", marginTop: 40 }}>
            {emptyMessage}
          </Text>
        )}
      </GHScrollView>
    </View>
  );
}

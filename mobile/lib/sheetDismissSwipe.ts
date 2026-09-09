import { Animated, Easing, Keyboard, PanResponder, type PanResponderInstance } from "react-native";

export const SHEET_DISMISS_REVERSAL_MIN_RATIO = 0.008;
export const SHEET_DISMISS_OPPOSING_PEAK_RATIO = 0.01;
export const SHEET_DISMISS_SAME_DIR_RETRACE_RATIO = 0.02;
export const SHEET_DISMISS_RELEASE_OPPOSE_VELOCITY = 20;
export const SHEET_DISMISS_PEAK_RETRACT_RATIO = 0.97;
export const SHEET_DISMISS_COMMIT_RATIO = 0.14;
export const SHEET_DISMISS_MIN_DRAG_RATIO = 0.04;
export const SHEET_DISMISS_VELOCITY = 350;
export const SHEET_DISMISS_VELOCITY_MIN_RATIO = 0.05;
export const SHEET_DISMISS_SNAP_DURATION = 200;
export const SHEET_DISMISS_PAN_ACTIVATION_PX = 10;
export const SHEET_DISMISS_BACKDROP_FADE_DISTANCE = 200;

export function shouldCommitDismissSwipe(
  translationY: number,
  peakDown: number,
  peakUp: number,
  height: number,
  velocityY: number,
  crossedCenter: boolean,
): boolean {
  if (translationY <= 0) return false;

  const progress = translationY / height;
  const peakProgress = peakDown / height;
  const reversalMin = height * SHEET_DISMISS_REVERSAL_MIN_RATIO;
  const dominantPeak = Math.max(peakDown, peakUp);
  const weakerPeak = Math.min(peakDown, peakUp);

  const hasOpposingTravel =
    crossedCenter
    || weakerPeak >= reversalMin
    || (dominantPeak >= reversalMin && weakerPeak > 0)
    || (dominantPeak > 0 && weakerPeak / dominantPeak >= SHEET_DISMISS_OPPOSING_PEAK_RATIO);

  let sameDirRetrace = false;
  if (translationY > reversalMin && peakDown > reversalMin) {
    sameDirRetrace =
      (peakDown - translationY) / peakDown > SHEET_DISMISS_SAME_DIR_RETRACE_RATIO;
  }

  const gestureReversed = hasOpposingTravel || sameDirRetrace;

  if (progress < SHEET_DISMISS_MIN_DRAG_RATIO) return false;
  if (gestureReversed) return false;

  if (
    peakProgress >= SHEET_DISMISS_MIN_DRAG_RATIO
    && progress < SHEET_DISMISS_COMMIT_RATIO
    && progress < peakProgress * SHEET_DISMISS_PEAK_RETRACT_RATIO
  ) {
    return false;
  }

  if (velocityY < -SHEET_DISMISS_RELEASE_OPPOSE_VELOCITY) return false;

  if (progress >= SHEET_DISMISS_COMMIT_RATIO) return true;

  if (progress < peakProgress * SHEET_DISMISS_PEAK_RETRACT_RATIO) return false;

  const minTravel = height * SHEET_DISMISS_VELOCITY_MIN_RATIO;
  if (velocityY > SHEET_DISMISS_VELOCITY && translationY > minTravel) {
    return true;
  }

  return false;
}

export function animateSheetDismissCommit(
  slideAnim: Animated.Value,
  backdropAnim: Animated.Value,
  height: number,
  onComplete: () => void,
  dismissOffset = 0,
) {
  Animated.parallel([
    Animated.timing(slideAnim, {
      toValue: height + dismissOffset,
      duration: SHEET_DISMISS_SNAP_DURATION,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }),
    Animated.timing(backdropAnim, {
      toValue: 0,
      duration: SHEET_DISMISS_SNAP_DURATION,
      useNativeDriver: true,
    }),
  ]).start(({ finished }) => {
    if (finished) onComplete();
  });
}

export function animateSheetDismissSnapBack(
  slideAnim: Animated.Value,
  backdropAnim: Animated.Value,
) {
  Animated.parallel([
    Animated.timing(slideAnim, {
      toValue: 0,
      duration: SHEET_DISMISS_SNAP_DURATION,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }),
    Animated.timing(backdropAnim, {
      toValue: 1,
      duration: SHEET_DISMISS_SNAP_DURATION,
      useNativeDriver: true,
    }),
  ]).start();
}

export function createSheetDismissPanResponder({
  slideAnim,
  backdropAnim,
  getHeight,
  onDismiss,
  dismissOffset = 0,
}: {
  slideAnim: Animated.Value;
  backdropAnim: Animated.Value;
  getHeight: () => number;
  onDismiss: () => void;
  dismissOffset?: number;
}): PanResponderInstance {
  const gesture = {
    peakDown: 0,
    peakUp: 0,
    crossedCenter: false,
    lastSign: 0,
  };

  return PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: (_, gs) =>
      Math.abs(gs.dy) > Math.abs(gs.dx) && Math.abs(gs.dy) > SHEET_DISMISS_PAN_ACTIVATION_PX,
    onPanResponderGrant: () => {
      Keyboard.dismiss();
      gesture.peakDown = 0;
      gesture.peakUp = 0;
      gesture.crossedCenter = false;
      gesture.lastSign = 0;
    },
    onPanResponderMove: (_, gs) => {
      const dy = gs.dy;
      if (dy > 0) {
        gesture.peakDown = Math.max(gesture.peakDown, dy);
      } else if (dy < 0) {
        gesture.peakUp = Math.max(gesture.peakUp, -dy);
      }
      const sign = dy > 0 ? 1 : dy < 0 ? -1 : 0;
      if (sign !== 0) {
        if (gesture.lastSign !== 0 && sign !== gesture.lastSign) {
          gesture.crossedCenter = true;
        }
        gesture.lastSign = sign;
      }

      const dragY = Math.max(0, dy);
      slideAnim.setValue(dragY);
      backdropAnim.setValue(Math.max(0, 1 - dragY / SHEET_DISMISS_BACKDROP_FADE_DISTANCE));
    },
    onPanResponderRelease: (_, gs) => {
      const height = getHeight();
      if (
        shouldCommitDismissSwipe(
          gs.dy,
          gesture.peakDown,
          gesture.peakUp,
          height,
          gs.vy,
          gesture.crossedCenter,
        )
      ) {
        animateSheetDismissCommit(slideAnim, backdropAnim, height, onDismiss, dismissOffset);
        return;
      }
      animateSheetDismissSnapBack(slideAnim, backdropAnim);
    },
  });
}

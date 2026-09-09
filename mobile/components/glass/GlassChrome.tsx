import { BlurView, type BlurTint } from "expo-blur";
import { isGlassEffectAPIAvailable, GlassContainer, GlassView } from "expo-glass-effect";
import {
  NativeLiquidGlassContainer,
  NativeLiquidGlassView,
  isNativeLiquidGlassContainerAvailable,
  isNativeLiquidGlassModuleAvailable,
} from "expo-native-liquid-glass";
import { type ReactNode, useCallback, useEffect } from "react";
import {
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
  type LayoutChangeEvent,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from "react-native-reanimated";
import { useTheme, type ThemeMode } from "@/lib/theme";

/** iOS native specular edge for blur fallbacks. */
export const GLASS_SPECULAR_BORDER = "rgba(255, 255, 255, 0.35)";

/** High fluid spring — matches GlassButtonStyle press tension. */
export const GLASS_INTERACTIVE_SPRING = { damping: 14, stiffness: 520, mass: 0.42 };

/** Default merge distance for sibling glass lenses in one sampling region. */
export const GLASS_MERGE_SPACING = 12;

const androidBlurProps =
  Platform.OS === "android"
    ? ({
        blurMethod: "dimezisBlurViewSdk31Plus" as const,
        blurReductionFactor: 2,
      } as const)
    : null;

export function useNativeLiquidGlass(): boolean {
  if (isNativeLiquidGlassModuleAvailable()) return true;
  return (
    Platform.OS === "ios" &&
    typeof isGlassEffectAPIAvailable === "function" &&
    isGlassEffectAPIAvailable()
  );
}

function useSwiftUILiquidGlass(): boolean {
  return isNativeLiquidGlassModuleAvailable();
}

function useNativeGlassContainer(): boolean {
  if (isNativeLiquidGlassContainerAvailable()) return true;
  return useNativeLiquidGlass();
}

export function glassBorder(_mode?: ThemeMode): string {
  return GLASS_SPECULAR_BORDER;
}

export function liquidBlurTint(): BlurTint {
  return Platform.OS === "ios" ? "systemUltraThinMaterial" : "default";
}

export function touchHighlightColor(mode: ThemeMode): string {
  return mode === "dark" ? "rgba(255, 255, 255, 0.14)" : "rgba(0, 0, 0, 0.06)";
}

export function pressedGlassOverlay(mode: ThemeMode): string {
  return mode === "dark" ? "rgba(255, 255, 255, 0.08)" : "rgba(0, 0, 0, 0.05)";
}

export type GlassLensShape = "circle" | "capsule" | "roundedRect";

const DEFAULT_CIRCLE_SIZE = 44;
const CAPSULE_RADIUS = 999;

function resolveLensCornerRadius(
  shape: GlassLensShape,
  cornerRadius: number | undefined,
  size: number,
): number {
  switch (shape) {
    case "circle":
      return size / 2;
    case "capsule":
      return CAPSULE_RADIUS;
    case "roundedRect":
      return cornerRadius ?? 12;
  }
}

export type GlassChromeContainerProps = {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  spacing?: number;
  pointerEvents?: View["props"]["pointerEvents"];
};

export type GlassChromeLensProps = {
  shape: GlassLensShape;
  cornerRadius?: number;
  /** Used for `circle` shape when width/height are not set via `style`. */
  size?: number;
  /** When `fill`, circle lenses inherit size from the parent instead of `size`. */
  layout?: "fixed" | "fill";
  interactive?: boolean;
  glassStyle?: "clear" | "regular";
  style?: StyleProp<ViewStyle>;
  pointerEvents?: View["props"]["pointerEvents"];
  onPress?: () => void;
  onPressIn?: () => void;
  onPressOut?: () => void;
  disabled?: boolean;
  hitSlop?: number;
  accessibilityLabel?: string;
  accessibilityRole?: "button" | "menuitem";
  accessibilityState?: { expanded?: boolean; disabled?: boolean };
  animateScale?: boolean;
  children: ReactNode;
};

/** Native liquid-glass lens — semantic props only; `style` is layout (size/position). */
export function GlassChromeLens({
  shape,
  cornerRadius: cornerRadiusProp,
  size = DEFAULT_CIRCLE_SIZE,
  layout = "fixed",
  interactive = false,
  glassStyle = "regular",
  style,
  pointerEvents,
  onPress,
  onPressIn,
  onPressOut,
  disabled,
  hitSlop,
  accessibilityLabel,
  accessibilityRole = "button",
  accessibilityState,
  animateScale = false,
  children,
}: GlassChromeLensProps) {
  const { mode } = useTheme();
  const nativeGlass = useNativeLiquidGlass();
  const colorScheme = mode === "dark" ? "dark" : "light";
  const cornerRadius = resolveLensCornerRadius(shape, cornerRadiusProp, size);
  const shell = {
    overflow: "hidden" as const,
    borderRadius: shape === "capsule" ? CAPSULE_RADIUS : cornerRadius,
    ...(shape === "circle" && layout === "fixed"
      ? { width: size, height: size }
      : null),
  };

  const inner = onPress ? (
    <GlassInteractiveTarget
      onPress={onPress}
      onPressIn={onPressIn}
      onPressOut={onPressOut}
      disabled={disabled}
      hitSlop={hitSlop}
      animateScale={animateScale}
      delegateToNativeGlass={interactive}
      accessibilityRole={accessibilityRole}
      accessibilityLabel={accessibilityLabel ?? "Button"}
      accessibilityState={accessibilityState}
      style={styles.fillTarget}
    >
      {children}
    </GlassInteractiveTarget>
  ) : (
    children
  );

  if (useSwiftUILiquidGlass()) {
    return (
      <NativeLiquidGlassView
        pointerEvents={pointerEvents}
        interactive={interactive}
        glassStyle={glassStyle}
        cornerRadius={cornerRadius}
        colorScheme={colorScheme}
        style={[shell, style]}
      >
        {inner}
      </NativeLiquidGlassView>
    );
  }

  if (nativeGlass) {
    return (
      <GlassView
        pointerEvents={pointerEvents}
        isInteractive={interactive}
        colorScheme={colorScheme}
        glassEffectStyle={glassStyle}
        style={[shell, style]}
      >
        {inner}
      </GlassView>
    );
  }

  return (
    <View pointerEvents={pointerEvents} style={[shell, style]}>
      <GlassLens
        isInteractive={interactive}
        effect={glassStyle}
        borderRadius={cornerRadius}
        style={StyleSheet.absoluteFill}
      />
      {onPress ? (
        <GlassInteractiveTarget
          onPress={onPress}
          onPressIn={onPressIn}
          onPressOut={onPressOut}
          disabled={disabled}
          hitSlop={hitSlop}
          animateScale={animateScale}
          accessibilityRole={accessibilityRole}
          accessibilityLabel={accessibilityLabel ?? "Button"}
          accessibilityState={accessibilityState}
          style={styles.fillTarget}
        >
          {children}
        </GlassInteractiveTarget>
      ) : (
        inner
      )}
    </View>
  );
}

type GlassLensProps = {
  style?: StyleProp<ViewStyle>;
  borderRadius?: number;
  pointerEvents?: View["props"]["pointerEvents"];
  isInteractive?: boolean;
  effect?: "clear" | "regular";
};

/**
 * Single native glass lens — no tint fills. Used as a sibling inside GlassEffectGroup
 * so track + bubble share one sampling region and morph organically.
 */
export function GlassLens({
  style,
  borderRadius,
  pointerEvents = "none",
  isInteractive = false,
  effect = "regular",
}: GlassLensProps) {
  const { mode } = useTheme();
  const nativeGlass = useNativeLiquidGlass();
  const colorScheme = mode === "dark" ? "dark" : "light";
  const radiusStyle = borderRadius != null ? { borderRadius, overflow: "hidden" as const } : null;

  if (useSwiftUILiquidGlass()) {
    return (
      <NativeLiquidGlassView
        pointerEvents={pointerEvents}
        interactive={isInteractive}
        glassStyle={effect}
        cornerRadius={borderRadius ?? 0}
        colorScheme={colorScheme}
        style={[StyleSheet.absoluteFill, style]}
      />
    );
  }

  if (nativeGlass) {
    return (
      <GlassView
        pointerEvents={pointerEvents}
        isInteractive={isInteractive}
        colorScheme={colorScheme}
        glassEffectStyle={effect}
        style={[StyleSheet.absoluteFill, radiusStyle, style]}
      />
    );
  }

  return (
    <BlurView
      pointerEvents={pointerEvents}
      intensity={100}
      tint={liquidBlurTint()}
      style={[StyleSheet.absoluteFill, radiusStyle, style]}
      {...androidBlurProps}
    />
  );
}

export type GlassEffectGroupProps = {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  spacing?: number;
  borderRadius?: number;
  onLayout?: (event: LayoutChangeEvent) => void;
  accessibilityRole?: View["props"]["accessibilityRole"];
  pointerEvents?: View["props"]["pointerEvents"];
};

/**
 * GlassEffectContainer: groups nearby glass lenses so they share one native sampling
 * region and merge instead of double-blurring at seams.
 */
export function GlassEffectGroup({
  children,
  style,
  spacing = GLASS_MERGE_SPACING,
  borderRadius,
  onLayout,
  accessibilityRole,
  pointerEvents,
}: GlassEffectGroupProps) {
  const nativeGlass = useNativeLiquidGlass();
  const shellStyle = [
    borderRadius != null ? { borderRadius, overflow: "hidden" as const } : null,
    styles.glassShell,
    style,
  ];

  if (useNativeGlassContainer()) {
    const Container = useSwiftUILiquidGlass() ? NativeLiquidGlassContainer : GlassContainer;
    return (
      <Container
        spacing={spacing}
        onLayout={onLayout}
        accessibilityRole={accessibilityRole}
        pointerEvents={pointerEvents}
        style={shellStyle}
      >
        {!useSwiftUILiquidGlass() ? <GlassLens style={StyleSheet.absoluteFill} borderRadius={borderRadius} /> : null}
        {children}
      </Container>
    );
  }

  return (
    <View
      onLayout={onLayout}
      accessibilityRole={accessibilityRole}
      pointerEvents={pointerEvents}
      style={shellStyle}
    >
      <GlassLens style={StyleSheet.absoluteFill} borderRadius={borderRadius} />
      {children}
    </View>
  );
}

function TouchHighlight({ active, mode }: { active: boolean; mode: ThemeMode }) {
  const progress = useSharedValue(active ? 1 : 0);

  useEffect(() => {
    progress.value = withSpring(active ? 1 : 0, GLASS_INTERACTIVE_SPRING);
  }, [active, progress]);

  const highlightStyle = useAnimatedStyle(() => ({
    opacity: progress.value * 0.72,
    transform: [{ scale: 0.35 + progress.value * 0.65 }],
  }));

  return (
    <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.highlightWrap, highlightStyle]}>
      <View style={[styles.highlightDisc, { backgroundColor: touchHighlightColor(mode) }]} />
    </Animated.View>
  );
}

export type GlassInteractiveTargetProps = {
  onPress: () => void;
  onPressIn?: () => void;
  onPressOut?: () => void;
  disabled?: boolean;
  hitSlop?: number;
  accessibilityRole?: "button" | "menuitem";
  accessibilityLabel: string;
  accessibilityState?: { expanded?: boolean; disabled?: boolean };
  style?: StyleProp<ViewStyle>;
  /** Scale + highlight feedback — fallback only; native GlassView handles press morph. */
  animateScale?: boolean;
  /** Native GlassView.isInteractive owns the press lens — no inner scale or highlight. */
  delegateToNativeGlass?: boolean;
  children: ReactNode;
};

/**
 * Touch layer for glass controls. When `delegateToNativeGlass` is set, this is a plain
 * Pressable so the outer GlassView morphs as one surface (no nested mini-button).
 */
export function GlassInteractiveTarget({
  onPress,
  onPressIn,
  onPressOut,
  disabled,
  hitSlop = 6,
  accessibilityRole = "button",
  accessibilityLabel,
  accessibilityState,
  style,
  animateScale = true,
  delegateToNativeGlass = false,
  children,
}: GlassInteractiveTargetProps) {
  const nativeGlass = useNativeLiquidGlass();
  const useNativeHandoff = delegateToNativeGlass && nativeGlass;
  const { mode } = useTheme();
  const scale = useSharedValue(1);

  const handlePressIn = useCallback(() => {
    if (!useNativeHandoff && animateScale) {
      scale.value = withSpring(0.94, GLASS_INTERACTIVE_SPRING);
    }
    onPressIn?.();
  }, [animateScale, onPressIn, scale, useNativeHandoff]);

  const handlePressOut = useCallback(() => {
    if (!useNativeHandoff && animateScale) {
      scale.value = withSpring(1, GLASS_INTERACTIVE_SPRING);
    }
    onPressOut?.();
  }, [animateScale, onPressOut, scale, useNativeHandoff]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: !useNativeHandoff && animateScale ? [{ scale: scale.value }] : [],
    opacity: disabled ? 0.38 : 1,
  }));

  if (useNativeHandoff) {
    return (
      <Pressable
        onPress={onPress}
        onPressIn={onPressIn}
        onPressOut={onPressOut}
        disabled={disabled}
        hitSlop={hitSlop}
        accessibilityRole={accessibilityRole}
        accessibilityLabel={accessibilityLabel}
        accessibilityState={accessibilityState}
        style={[styles.fillTarget, style]}
      >
        {children}
      </Pressable>
    );
  }

  return (
    <Pressable
      onPress={onPress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      disabled={disabled}
      hitSlop={hitSlop}
      accessibilityRole={accessibilityRole}
      accessibilityLabel={accessibilityLabel}
      accessibilityState={accessibilityState}
      style={style}
    >
      {({ pressed }) => (
        <Animated.View style={[styles.fillTarget, animatedStyle]}>
          {!nativeGlass ? <TouchHighlight active={pressed && !disabled} mode={mode} /> : null}
          {children}
        </Animated.View>
      )}
    </Pressable>
  );
}

/** Floating island shell (tab bar, segment track) — track + bubble lenses merge inside. */
export type GlassIslandProps = {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  borderRadius: number;
  mergeSpacing?: number;
  onLayout?: (event: LayoutChangeEvent) => void;
  accessibilityRole?: View["props"]["accessibilityRole"];
};

export function GlassIsland({
  children,
  style,
  borderRadius,
  mergeSpacing,
  onLayout,
  accessibilityRole,
}: GlassIslandProps) {
  return (
    <GlassEffectGroup
      spacing={mergeSpacing ?? GLASS_MERGE_SPACING}
      borderRadius={borderRadius}
      onLayout={onLayout}
      accessibilityRole={accessibilityRole}
      style={[styles.islandShadow, style]}
    >
      <GlassLens style={StyleSheet.absoluteFill} borderRadius={borderRadius} />
      {children}
    </GlassEffectGroup>
  );
}

export type GlassBubbleProps = {
  style?: StyleProp<ViewStyle>;
  borderRadius: number;
};

/** Selection bubble lens — sibling of track inside the same GlassEffectGroup. */
export function GlassBubble({ style, borderRadius }: GlassBubbleProps) {
  return (
    <GlassLens
      effect="clear"
      borderRadius={borderRadius}
      style={[StyleSheet.absoluteFill, style]}
    />
  );
}

export type GlassCircleButtonProps = {
  onPress: () => void;
  onPressIn?: () => void;
  onPressOut?: () => void;
  disabled?: boolean;
  size?: number;
  accessibilityLabel: string;
  accessibilityState?: { expanded?: boolean; disabled?: boolean };
  hitSlop?: number;
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
};

export function GlassCircleButton({
  onPress,
  onPressIn,
  onPressOut,
  disabled,
  size = 44,
  accessibilityLabel,
  accessibilityState,
  hitSlop,
  animateScale = true,
  children,
  style,
}: GlassCircleButtonProps & { animateScale?: boolean }) {
  const nativeGlass = useNativeLiquidGlass();
  const { mode } = useTheme();
  const radius = size / 2;
  const colorScheme = mode === "dark" ? "dark" : "light";
  const shell = { width: size, height: size, borderRadius: radius, overflow: "hidden" as const };

  if (useSwiftUILiquidGlass()) {
    return (
      <NativeLiquidGlassView
        interactive
        glassStyle="regular"
        cornerRadius={radius}
        colorScheme={colorScheme}
        style={[shell, style]}
      >
        <GlassInteractiveTarget
          onPress={onPress}
          onPressIn={onPressIn}
          onPressOut={onPressOut}
          disabled={disabled}
          hitSlop={hitSlop}
          animateScale={false}
          delegateToNativeGlass
          accessibilityLabel={accessibilityLabel}
          accessibilityState={accessibilityState}
        >
          <View style={[styles.buttonTarget, { width: size, height: size }]}>{children}</View>
        </GlassInteractiveTarget>
      </NativeLiquidGlassView>
    );
  }

  if (nativeGlass) {
    return (
      <GlassView
        isInteractive
        colorScheme={colorScheme}
        glassEffectStyle="regular"
        style={[shell, styles.glassShell, style]}
      >
        <GlassInteractiveTarget
          onPress={onPress}
          onPressIn={onPressIn}
          onPressOut={onPressOut}
          disabled={disabled}
          hitSlop={hitSlop}
          animateScale={false}
          delegateToNativeGlass
          accessibilityLabel={accessibilityLabel}
          accessibilityState={accessibilityState}
        >
          <View style={[styles.buttonTarget, { width: size, height: size }]}>{children}</View>
        </GlassInteractiveTarget>
      </GlassView>
    );
  }

  return (
    <GlassInteractiveTarget
      onPress={onPress}
      onPressIn={onPressIn}
      onPressOut={onPressOut}
      disabled={disabled}
      hitSlop={hitSlop}
      animateScale={animateScale}
      accessibilityLabel={accessibilityLabel}
      accessibilityState={accessibilityState}
      style={[shell, style]}
    >
      <View style={shell}>
        <GlassLens borderRadius={radius} style={StyleSheet.absoluteFill} />
        <View style={[styles.buttonTarget, { width: size, height: size }]}>{children}</View>
      </View>
    </GlassInteractiveTarget>
  );
}

export type GlassGroupedCircleButtonProps = GlassCircleButtonProps & { animateScale?: boolean };

/** Circle button meant as a direct child of GlassButtonGroup — merges with siblings. */
export function GlassGroupedCircleButton({
  onPress,
  onPressIn,
  onPressOut,
  disabled,
  size = 44,
  accessibilityLabel,
  accessibilityState,
  hitSlop,
  animateScale = true,
  children,
}: GlassGroupedCircleButtonProps) {
  const nativeGlass = useNativeLiquidGlass();
  const { mode } = useTheme();
  const radius = size / 2;
  const colorScheme = mode === "dark" ? "dark" : "light";
  const shell = {
    width: size,
    height: size,
    borderRadius: radius,
    overflow: "hidden" as const,
  };

  if (useSwiftUILiquidGlass()) {
    return (
      <NativeLiquidGlassView
        interactive
        glassStyle="regular"
        cornerRadius={radius}
        colorScheme={colorScheme}
        style={shell}
      >
        <GlassInteractiveTarget
          onPress={onPress}
          onPressIn={onPressIn}
          onPressOut={onPressOut}
          disabled={disabled}
          hitSlop={hitSlop}
          animateScale={false}
          delegateToNativeGlass
          accessibilityLabel={accessibilityLabel}
          accessibilityState={accessibilityState}
        >
          <View style={[styles.buttonTarget, { width: size, height: size }]}>{children}</View>
        </GlassInteractiveTarget>
      </NativeLiquidGlassView>
    );
  }

  if (nativeGlass) {
    return (
      <GlassView isInteractive colorScheme={colorScheme} glassEffectStyle="regular" style={shell}>
        <GlassInteractiveTarget
          onPress={onPress}
          onPressIn={onPressIn}
          onPressOut={onPressOut}
          disabled={disabled}
          hitSlop={hitSlop}
          animateScale={false}
          delegateToNativeGlass
          accessibilityLabel={accessibilityLabel}
          accessibilityState={accessibilityState}
        >
          <View style={[styles.buttonTarget, { width: size, height: size }]}>{children}</View>
        </GlassInteractiveTarget>
      </GlassView>
    );
  }

  return (
    <GlassInteractiveTarget
      onPress={onPress}
      onPressIn={onPressIn}
      onPressOut={onPressOut}
      disabled={disabled}
      hitSlop={hitSlop}
      animateScale={animateScale}
      accessibilityLabel={accessibilityLabel}
      accessibilityState={accessibilityState}
      style={shell}
    >
      <View style={{ width: size, height: size }}>
        <GlassLens borderRadius={radius} style={StyleSheet.absoluteFill} />
        <View style={[styles.buttonTarget, { width: size, height: size }]}>{children}</View>
      </View>
    </GlassInteractiveTarget>
  );
}

export type GlassPillButtonProps = {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  icon?: ReactNode;
  labelColor?: string;
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
};

const PILL_RADIUS = 999;

export function GlassPillButton({
  label,
  onPress,
  disabled,
  icon,
  labelColor,
  accessibilityLabel,
  style,
}: GlassPillButtonProps) {
  const { C, mode } = useTheme();
  const nativeGlass = useNativeLiquidGlass();
  const colorScheme = mode === "dark" ? "dark" : "light";
  const pillBody = (
    <View style={styles.pillTarget}>
      {icon}
      <Text
        style={{
          color: labelColor ?? C.text,
          fontSize: 16,
          fontWeight: "600",
          letterSpacing: -0.2,
        }}
      >
        {label}
      </Text>
    </View>
  );

  if (useSwiftUILiquidGlass()) {
    return (
      <NativeLiquidGlassView
        interactive
        glassStyle="regular"
        cornerRadius={PILL_RADIUS}
        colorScheme={colorScheme}
        style={[{ borderRadius: PILL_RADIUS, overflow: "hidden" }, style]}
      >
        <GlassInteractiveTarget
          onPress={onPress}
          disabled={disabled}
          delegateToNativeGlass
          accessibilityLabel={accessibilityLabel ?? label}
        >
          {pillBody}
        </GlassInteractiveTarget>
      </NativeLiquidGlassView>
    );
  }

  if (nativeGlass) {
    return (
      <GlassView
        isInteractive
        colorScheme={colorScheme}
        glassEffectStyle="regular"
        style={[{ borderRadius: PILL_RADIUS, overflow: "hidden" }, styles.glassShell, style]}
      >
        <GlassInteractiveTarget
          onPress={onPress}
          disabled={disabled}
          delegateToNativeGlass
          accessibilityLabel={accessibilityLabel ?? label}
        >
          {pillBody}
        </GlassInteractiveTarget>
      </GlassView>
    );
  }

  return (
    <GlassInteractiveTarget
      onPress={onPress}
      disabled={disabled}
      accessibilityLabel={accessibilityLabel ?? label}
      style={[{ borderRadius: PILL_RADIUS, overflow: "hidden" }, styles.glassShell, style]}
    >
      <View style={{ borderRadius: PILL_RADIUS, overflow: "hidden" }}>
        <GlassLens borderRadius={PILL_RADIUS} style={StyleSheet.absoluteFill} />
        {pillBody}
      </View>
    </GlassInteractiveTarget>
  );
}

export type GlassControlShellProps = {
  children?: ReactNode;
  style?: StyleProp<ViewStyle>;
  borderRadius: number;
  interactive?: boolean;
};

/** Functional control chrome (search pill, expandable field) — not for content lists. */
export function GlassControlShell({
  children,
  style,
  borderRadius,
  interactive = false,
}: GlassControlShellProps) {
  return (
    <GlassEffectGroup borderRadius={borderRadius} style={style}>
      <GlassLens
        isInteractive={interactive}
        borderRadius={borderRadius}
        style={StyleSheet.absoluteFill}
      />
      {children}
    </GlassEffectGroup>
  );
}

export type GlassPanelProps = {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  borderRadius?: number;
};

/** Floating menu / popover shell — functional overlay, not scroll content. */
export function GlassPanel({ children, style, borderRadius = 16 }: GlassPanelProps) {
  return (
    <GlassEffectGroup borderRadius={borderRadius} style={style}>
      <GlassLens borderRadius={borderRadius} style={StyleSheet.absoluteFill} />
      {children}
    </GlassEffectGroup>
  );
}

/** Group row of circle buttons so adjacent lenses merge (sheet footer, toolbars). */
export type GlassButtonGroupProps = {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  spacing?: number;
  pointerEvents?: View["props"]["pointerEvents"];
};

export function GlassButtonGroup({
  children,
  style,
  spacing = GLASS_MERGE_SPACING,
  pointerEvents,
}: GlassButtonGroupProps) {
  if (useNativeGlassContainer()) {
    const Container = useSwiftUILiquidGlass() ? NativeLiquidGlassContainer : GlassContainer;
    return (
      <Container spacing={spacing} pointerEvents={pointerEvents} style={[styles.buttonGroup, style]}>
        {children}
      </Container>
    );
  }

  return (
    <View style={[styles.buttonGroup, style]} pointerEvents={pointerEvents ?? "box-none"}>
      {children}
    </View>
  );
}

/** Groups sibling lenses in one UIGlassContainerEffect sampling region. Layout `style` only. */
export function GlassChromeContainer({
  children,
  style,
  spacing = GLASS_MERGE_SPACING,
  pointerEvents,
}: GlassChromeContainerProps) {
  return (
    <GlassButtonGroup spacing={spacing} style={style} pointerEvents={pointerEvents}>
      {children}
    </GlassButtonGroup>
  );
}

export const GlassChrome = {
  Container: GlassChromeContainer,
  Lens: GlassChromeLens,
};

export default GlassChrome;

const styles = StyleSheet.create({
  glassShell: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: GLASS_SPECULAR_BORDER,
  },
  islandShadow: {
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.22,
    shadowRadius: 20,
    elevation: 14,
  },
  buttonTarget: {
    alignItems: "center",
    justifyContent: "center",
  },
  pillTarget: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 15,
    paddingHorizontal: 20,
  },
  interactiveInner: {
    flex: 1,
    overflow: "hidden",
  },
  fillTarget: {
    flex: 1,
    alignSelf: "stretch",
  },
  highlightWrap: {
    alignItems: "center",
    justifyContent: "center",
  },
  highlightDisc: {
    width: "130%",
    height: "130%",
    borderRadius: 999,
  },
  buttonGroup: {
    flexDirection: "row",
    alignItems: "center",
  },
});

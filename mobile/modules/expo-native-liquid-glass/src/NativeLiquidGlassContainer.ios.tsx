import { requireNativeViewManager } from 'expo-modules-core';
import type { ViewProps } from 'react-native';

export type NativeLiquidGlassContainerProps = ViewProps & {
  /** Merge distance — maps to GlassEffectContainer spacing / UIGlassContainerEffect.spacing. */
  spacing?: number;
};

const NativeLiquidGlassContainer = requireNativeViewManager<NativeLiquidGlassContainerProps>(
  'ExpoNativeLiquidGlass',
  'LiquidGlassContainerView',
);

export default NativeLiquidGlassContainer;

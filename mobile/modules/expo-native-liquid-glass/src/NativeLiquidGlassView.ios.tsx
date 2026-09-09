import { requireNativeViewManager } from 'expo-modules-core';
import type { ViewProps } from 'react-native';

export type NativeLiquidGlassViewProps = ViewProps & {
  /** Native glass material — no JS styling. */
  glassStyle?: 'clear' | 'regular';
  /** Maps to SwiftUI Glass.interactive() / UIGlassEffect.isInteractive. */
  interactive?: boolean;
  /** Capsule/rect corner radius in points. */
  cornerRadius?: number;
  colorScheme?: 'auto' | 'light' | 'dark';
};

const NativeLiquidGlassView = requireNativeViewManager<NativeLiquidGlassViewProps>(
  'ExpoNativeLiquidGlass',
  'LiquidGlassView',
);

export default NativeLiquidGlassView;

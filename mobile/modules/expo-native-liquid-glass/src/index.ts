import { requireOptionalNativeModule } from 'expo-modules-core';
import { Platform } from 'react-native';

import NativeLiquidGlassContainer from './NativeLiquidGlassContainer';
import NativeLiquidGlassView from './NativeLiquidGlassView';

export { NativeLiquidGlassView, NativeLiquidGlassContainer };
export type { NativeLiquidGlassViewProps } from './NativeLiquidGlassView.ios';
export type { NativeLiquidGlassContainerProps } from './NativeLiquidGlassContainer.ios';

type ExpoNativeLiquidGlassModule = {
  isLiquidGlassAvailable: boolean;
  isGlassEffectAPIAvailable: boolean;
  isGlassContainerAPIAvailable: boolean;
};

const NativeModule = requireOptionalNativeModule<ExpoNativeLiquidGlassModule>(
  'ExpoNativeLiquidGlass',
);

export function isNativeLiquidGlassModuleAvailable(): boolean {
  return Platform.OS === 'ios' && NativeModule?.isGlassEffectAPIAvailable === true;
}

export function isNativeLiquidGlassContainerAvailable(): boolean {
  return Platform.OS === 'ios' && NativeModule?.isGlassContainerAPIAvailable === true;
}

export function isLiquidGlassEnabledOnDevice(): boolean {
  return Platform.OS === 'ios' && NativeModule?.isLiquidGlassAvailable === true;
}

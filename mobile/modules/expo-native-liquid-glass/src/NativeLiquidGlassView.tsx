import { View, type ViewProps } from 'react-native';

import type { NativeLiquidGlassViewProps } from './NativeLiquidGlassView.ios';

/** Non-iOS passthrough — liquid glass is iOS 26+ only. */
export default function NativeLiquidGlassView(props: NativeLiquidGlassViewProps) {
  const { glassStyle: _s, interactive: _i, cornerRadius: _r, colorScheme: _c, ...rest } = props;
  return <View {...(rest as ViewProps)} />;
}

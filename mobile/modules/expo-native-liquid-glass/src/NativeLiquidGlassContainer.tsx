import { View, type ViewProps } from 'react-native';

import type { NativeLiquidGlassContainerProps } from './NativeLiquidGlassContainer.ios';

export default function NativeLiquidGlassContainer(props: NativeLiquidGlassContainerProps) {
  const { spacing: _s, ...rest } = props;
  return <View {...(rest as ViewProps)} />;
}

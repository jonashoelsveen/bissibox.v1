# expo-native-liquid-glass

Native iOS 26 Liquid Glass for Expo / React Native.

## Architecture

| Swift / UIKit | React Native export | Role |
|---------------|---------------------|------|
| SwiftUI `.glassEffect()` via `UIHostingController` | `NativeLiquidGlassView` | Single glass lens |
| `UIGlassContainerEffect` (GlassEffectContainer UIKit bridge) | `NativeLiquidGlassContainer` | Shared sampling region for sibling lenses |

**No JavaScript glass styling** — only semantic props (`glassStyle`, `interactive`, `cornerRadius`, `colorScheme`, `spacing`). Layout uses normal RN flexbox (`style` width/height only).

## Usage

```tsx
import {
  NativeLiquidGlassView,
  NativeLiquidGlassContainer,
  isNativeLiquidGlassModuleAvailable,
} from 'expo-native-liquid-glass';

// Grouped tab island — lenses merge organically
<NativeLiquidGlassContainer spacing={12} style={{ width: 200, height: 56 }}>
  <NativeLiquidGlassView
    glassStyle="regular"
    cornerRadius={28}
    style={StyleSheet.absoluteFill}
  />
  <NativeLiquidGlassView
    glassStyle="clear"
    interactive
    cornerRadius={24}
    style={{ position: 'absolute', width: 58, height: 48, left: 8, top: 4 }}
  />
  {/* icons as RN children inside lenses or as siblings */}
</NativeLiquidGlassContainer>

// Interactive circle button
<NativeLiquidGlassView
  interactive
  glassStyle="regular"
  cornerRadius={22}
  style={{ width: 44, height: 44 }}
>
  <Pressable onPress={...}>{icon}</Pressable>
</NativeLiquidGlassView>
```

## Rebuild

```bash
cd mobile && npm install && npx pod-install
npm run ios
```

Requires **Xcode 26** and **iOS 26** simulator/device for liquid glass APIs.

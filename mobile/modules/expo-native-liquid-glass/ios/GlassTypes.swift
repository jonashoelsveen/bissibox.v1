import ExpoModulesCore
import UIKit

enum NativeGlassStyle: String, Enumerable {
  case clear
  case regular
}

enum NativeGlassColorScheme: String, Enumerable {
  case auto
  case light
  case dark

  func toUIUserInterfaceStyle() -> UIUserInterfaceStyle {
    switch self {
    case .auto:
      return .unspecified
    case .light:
      return .light
    case .dark:
      return .dark
    }
  }
}

enum NativeGlassRuntime {
  static func isSwiftGlassEffectAvailable() -> Bool {
    #if compiler(>=6.2)
    if #available(iOS 26.0, tvOS 26.0, macOS 26.0, *) {
      return NSClassFromString("UIGlassEffect") != nil
    }
    #endif
    return false
  }

  static func isGlassContainerEffectAvailable() -> Bool {
    #if compiler(>=6.2)
    if #available(iOS 26.0, tvOS 26.0, macOS 26.0, *) {
      return NSClassFromString("UIGlassContainerEffect") != nil
    }
    #endif
    return false
  }
}

#if compiler(>=6.2)
@available(iOS 26.0, tvOS 26.0, macOS 26.0, *)
extension NativeGlassStyle {
  func toUIGlassEffectStyle() -> UIGlassEffect.Style? {
    switch self {
    case .clear:
      return .clear
    case .regular:
      return .regular
    }
  }
}
#endif

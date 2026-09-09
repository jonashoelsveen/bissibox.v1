import ExpoModulesCore

public final class ExpoNativeLiquidGlassModule: Module {
  public func definition() -> ModuleDefinition {
    Name("ExpoNativeLiquidGlass")

    Constant("isLiquidGlassAvailable") {
      if let infoPlist = Bundle.main.infoDictionary,
        let requiresCompatibility = infoPlist["UIDesignRequiresCompatibility"] as? Bool {
        return !requiresCompatibility
      }
      return NativeGlassRuntime.isSwiftGlassEffectAvailable()
    }

    Constant("isGlassEffectAPIAvailable") {
      NativeGlassRuntime.isSwiftGlassEffectAvailable()
    }

    Constant("isGlassContainerAPIAvailable") {
      NativeGlassRuntime.isGlassContainerEffectAvailable()
    }

    View(LiquidGlassView.self) {
      Prop("glassStyle") { (view: LiquidGlassView, style: NativeGlassStyle) in
        view.setGlassStyle(style)
      }

      Prop("interactive") { (view: LiquidGlassView, interactive: Bool) in
        view.setInteractive(interactive)
      }

      Prop("cornerRadius") { (view: LiquidGlassView, radius: CGFloat) in
        view.setCornerRadius(radius)
      }

      Prop("colorScheme", .auto) { (view: LiquidGlassView, scheme: NativeGlassColorScheme) in
        view.setColorScheme(scheme)
      }
    }

    View(LiquidGlassContainerView.self) {
      Prop("spacing") { (view: LiquidGlassContainerView, spacing: CGFloat?) in
        view.setSpacing(spacing)
      }
    }
  }
}

import ExpoModulesCore
import UIKit

/// UIKit `UIGlassContainerEffect` bridge — the UIKit counterpart to SwiftUI `GlassEffectContainer`.
/// React Native children (e.g. sibling LiquidGlassView lenses) mount into the shared content view
/// so their glass shapes merge instead of double-blurring.
public final class LiquidGlassContainerView: ExpoView {
  private var containerEffectView = UIVisualEffectView()
  private var containerSpacing: CGFloat?

  public required init(appContext: AppContext? = nil) {
    super.init(appContext: appContext)

    containerEffectView.autoresizingMask = [.flexibleWidth, .flexibleHeight]
    addSubview(containerEffectView)
  }

  public override func layoutSubviews() {
    super.layoutSubviews()
    containerEffectView.frame = bounds
  }

  public override func mountChildComponentView(_ childComponentView: UIView, index: Int) {
    containerEffectView.contentView.insertSubview(childComponentView, at: index)
  }

  public override func unmountChildComponentView(_ childComponentView: UIView, index: Int) {
    childComponentView.removeFromSuperview()
  }

  func setSpacing(_ spacing: CGFloat?) {
    if containerSpacing != spacing {
      containerSpacing = spacing
      refreshContainerEffect()
    }
  }

  private func refreshContainerEffect() {
    guard NativeGlassRuntime.isGlassContainerEffectAvailable() else {
      return
    }

    if #available(iOS 26.0, tvOS 26.0, macOS 26.0, *) {
      #if compiler(>=6.2)
      let effect = UIGlassContainerEffect()
      if let spacing = containerSpacing {
        effect.spacing = spacing
      }
      containerEffectView.effect = effect
      #endif
    }
  }
}

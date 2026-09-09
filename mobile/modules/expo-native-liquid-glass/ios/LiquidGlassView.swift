import ExpoModulesCore
import SwiftUI
import UIKit

/// Native liquid-glass lens backed by SwiftUI `.glassEffect()` on iOS 26+.
/// React Native children mount above the glass (content layer); the lens is native-only.
public final class LiquidGlassView: ExpoView {
  private var hostingController: UIHostingController<AnyView>?
  private var uiKitGlassView = UIVisualEffectView()
  private var uiKitGlassEffect: Any?

  private let contentContainer = UIView()

  private var glassStyle: NativeGlassStyle = .regular
  private var glassInteractive = false
  private var glassCornerRadius: CGFloat = 0
  private var glassColorScheme: NativeGlassColorScheme = .auto
  private var isMounted = false

  public required init(appContext: AppContext? = nil) {
    super.init(appContext: appContext)

    contentContainer.backgroundColor = .clear
    uiKitGlassView.autoresizingMask = [.flexibleWidth, .flexibleHeight]
    uiKitGlassView.isUserInteractionEnabled = false

    addSubview(uiKitGlassView)
    addSubview(contentContainer)
  }

  public override func layoutSubviews() {
    super.layoutSubviews()

    if !isMounted {
      isMounted = true
      uiKitGlassView.effect = UIVisualEffect()
      refreshGlassSurface()
    }

    hostingController?.view.frame = bounds
    uiKitGlassView.frame = bounds
    contentContainer.frame = bounds
  }

  public override func didMoveToWindow() {
    super.didMoveToWindow()
    if window == nil {
      isMounted = false
    } else {
      setNeedsLayout()
    }
  }

  public override func mountChildComponentView(_ childComponentView: UIView, index: Int) {
    contentContainer.insertSubview(childComponentView, at: index)
  }

  public override func unmountChildComponentView(_ childComponentView: UIView, index: Int) {
    childComponentView.removeFromSuperview()
  }

  func setGlassStyle(_ style: NativeGlassStyle) {
    if glassStyle != style {
      glassStyle = style
      refreshGlassSurface()
    }
  }

  func setInteractive(_ interactive: Bool) {
    if glassInteractive != interactive {
      glassInteractive = interactive
      uiKitGlassView.effect = UIVisualEffect()
      refreshGlassSurface()
    }
  }

  func setCornerRadius(_ radius: CGFloat) {
    if glassCornerRadius != radius {
      glassCornerRadius = radius
      refreshGlassSurface()
    }
  }

  func setColorScheme(_ scheme: NativeGlassColorScheme) {
    if glassColorScheme != scheme {
      glassColorScheme = scheme
      refreshGlassSurface()
    }
  }

  private func refreshGlassSurface() {
    guard isMounted else {
      return
    }

    guard NativeGlassRuntime.isSwiftGlassEffectAvailable() else {
      hideSwiftUIHost()
      uiKitGlassView.isHidden = true
      return
    }

    if #available(iOS 26.0, tvOS 26.0, macOS 26.0, *) {
      #if compiler(>=6.2)
      applySwiftUIGlassHost()
      #endif
    }
  }

  #if compiler(>=6.2)
  @available(iOS 26.0, tvOS 26.0, macOS 26.0, *)
  private func applySwiftUIGlassHost() {
    let surface = LiquidGlassSwiftUISurface(
      style: glassStyle,
      interactive: glassInteractive,
      cornerRadius: glassCornerRadius
    )

    if hostingController == nil {
      let host = UIHostingController(rootView: AnyView(surface))
      host.view.backgroundColor = .clear
      host.view.isUserInteractionEnabled = false
      hostingController = host
      insertSubview(host.view, at: 0)
    } else {
      hostingController?.rootView = AnyView(surface)
    }

    hostingController?.overrideUserInterfaceStyle = glassColorScheme.toUIUserInterfaceStyle()
    hostingController?.view.isHidden = false
    uiKitGlassView.isHidden = true

    // UIKit fallback stays in sync for Fabric re-mount edge cases.
    if let uiStyle = glassStyle.toUIGlassEffectStyle() {
      let effect = UIGlassEffect(style: uiStyle)
      effect.isInteractive = glassInteractive
      uiKitGlassView.overrideUserInterfaceStyle = glassColorScheme.toUIUserInterfaceStyle()
      uiKitGlassView.effect = effect
      uiKitGlassEffect = effect
      applyUIKitCornerConfiguration()
    }
  }

  @available(iOS 26.0, tvOS 26.0, macOS 26.0, *)
  private func applyUIKitCornerConfiguration() {
    let radius = UICornerRadius(floatLiteral: glassCornerRadius)
    uiKitGlassView.cornerConfiguration = .corners(
      topLeftRadius: radius,
      topRightRadius: radius,
      bottomLeftRadius: radius,
      bottomRightRadius: radius
    )
  }
  #endif

  private func hideSwiftUIHost() {
    hostingController?.view.isHidden = true
  }
}

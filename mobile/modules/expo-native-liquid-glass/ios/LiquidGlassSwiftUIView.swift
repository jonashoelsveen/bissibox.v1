import SwiftUI

#if compiler(>=6.2)
@available(iOS 26.0, tvOS 26.0, macOS 26.0, *)
struct LiquidGlassSwiftUISurface: View {
  let style: NativeGlassStyle
  let interactive: Bool
  let cornerRadius: CGFloat

  private var glass: Glass {
    switch style {
    case .clear:
      return .clear
    case .regular:
      return .regular
    }
  }

  var body: some View {
    Rectangle()
      .fill(.clear)
      .glassEffect(
        interactive ? glass.interactive() : glass,
        in: .rect(cornerRadius: cornerRadius)
      )
  }
}
#endif

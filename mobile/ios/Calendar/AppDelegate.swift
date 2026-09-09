internal import Expo
import React
import ReactAppDependencyProvider

@main
class AppDelegate: ExpoAppDelegate {
  var window: UIWindow?

  var reactNativeDelegate: ExpoReactNativeFactoryDelegate?
  var reactNativeFactory: RCTReactNativeFactory?

  public override func application(
    _ application: UIApplication,
    didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil
  ) -> Bool {
    let delegate = ReactNativeDelegate()
    let factory = ExpoReactNativeFactory(delegate: delegate)
    delegate.dependencyProvider = RCTAppDependencyProvider()

    reactNativeDelegate = delegate
    reactNativeFactory = factory

#if os(iOS) || os(tvOS)
    window = UIWindow(frame: UIScreen.main.bounds)
    factory.startReactNative(
      withModuleName: "main",
      in: window,
      launchOptions: launchOptions)
#endif

    return super.application(application, didFinishLaunchingWithOptions: launchOptions)
  }

  // Linking API
  public override func application(
    _ app: UIApplication,
    open url: URL,
    options: [UIApplication.OpenURLOptionsKey: Any] = [:]
  ) -> Bool {
    return super.application(app, open: url, options: options) || RCTLinkingManager.application(app, open: url, options: options)
  }

  // Universal Links
  public override func application(
    _ application: UIApplication,
    continue userActivity: NSUserActivity,
    restorationHandler: @escaping ([UIUserActivityRestoring]?) -> Void
  ) -> Bool {
    let result = RCTLinkingManager.application(application, continue: userActivity, restorationHandler: restorationHandler)
    return super.application(application, continue: userActivity, restorationHandler: restorationHandler) || result
  }
}

class ReactNativeDelegate: ExpoReactNativeFactoryDelegate {
  /// Must match `mobile/metro-port.js` / `RCT_METRO_PORT` in `.xcode.env`.
  /// Prebuilt React Native still probes port 8081 by default; the web app uses that port.
  private static let metroPort = 8088
  private static let bundleRoot = ".expo/.virtual-metro-entry"

  // Extension point for config-plugins

  override func sourceURL(for bridge: RCTBridge) -> URL? {
    // needed to return the correct URL for expo-dev-client.
    return bridge.bundleURL ?? bundleURL()
  }

  override func bundleURL() -> URL? {
#if EXPO_CONFIGURATION_DEBUG
    return devBundleURL()
#else
    return Bundle.main.url(forResource: "main", withExtension: "jsbundle")
#endif
  }

  private func devBundleURL() -> URL? {
    let settings = RCTBundleURLProvider.sharedSettings()

    // Standard path when the packager probe succeeds (e.g. default 8081 or dev-menu override).
    if let url = settings.jsBundleURL(forBundleRoot: Self.bundleRoot),
       !url.isFileURL {
      return url
    }

    // Fallback: build the Metro URL with our explicit port. Without this, prebuilt RN Core
    // probes 8081 (Vite) and returns nil because no embedded main.jsbundle exists in Debug.
    guard let hostPort = Self.devPackagerHostPort(settings: settings) else {
      return nil
    }

    return RCTBundleURLProvider.jsBundleURL(
      forBundleRoot: Self.bundleRoot,
      packagerHost: hostPort,
      packagerScheme: settings.packagerScheme,
      enableDev: settings.enableDev,
      enableMinification: settings.enableMinification,
      inlineSourceMap: settings.inlineSourceMap,
      modulesOnly: false,
      runModule: true
    )
  }

  private static func devPackagerHostPort(settings: RCTBundleURLProvider) -> String? {
    if let location = settings.jsLocation?.trimmingCharacters(in: .whitespacesAndNewlines),
       !location.isEmpty {
      if location.contains(":") {
        return location
      }
      return "\(location):\(metroPort)"
    }

    #if targetEnvironment(simulator)
    return "localhost:\(metroPort)"
    #else
    guard let ipPath = Bundle.main.path(forResource: "ip", ofType: "txt"),
          let contents = try? String(contentsOfFile: ipPath, encoding: .utf8) else {
      return nil
    }
    let ip = contents.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !ip.isEmpty else {
      return nil
    }
    return "\(ip):\(metroPort)"
    #endif
  }
}

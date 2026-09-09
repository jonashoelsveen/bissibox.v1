/**
 * Metro dev-server port for the mobile app.
 * Port 8081 is used by the web app (Vite); keep these in sync:
 * - mobile/package.json scripts (--port)
 * - mobile/ios/.xcode.env (RCT_METRO_PORT)
 * - mobile/ios/Calendar/AppDelegate.swift (metroPort)
 */
module.exports = Number(process.env.RCT_METRO_PORT) || 8088;

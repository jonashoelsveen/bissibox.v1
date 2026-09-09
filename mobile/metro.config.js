const path = require("path");
const { getDefaultConfig } = require("expo/metro-config");
const { withNativeWind } = require("nativewind/metro");
const metroPort = require("./metro-port");

const projectRoot = __dirname;
const monorepoRoot = path.resolve(projectRoot, "..");

const config = getDefaultConfig(projectRoot);

config.server = {
  ...config.server,
  port: metroPort,
};

// Allow Metro to watch repo-root fallbacks (e.g. App.tsx) when preview starts above mobile/.
config.watchFolders = [...(config.watchFolders ?? []), monorepoRoot];

// The mobile folder sits inside a web app that has its own node_modules.
// Block Metro from resolving into the parent's node_modules to avoid picking
// up duplicate React (root uses React for the web app; mobile has its own).
const parentNodeModules = path.resolve(projectRoot, "..", "node_modules");
const escapedPath = parentNodeModules.replace(/[.+*?^${}()|[\]\\]/g, "\\$&");
config.resolver = {
  ...config.resolver,
  blockList: [new RegExp(`^${escapedPath}($|[\\/])`)],
};

module.exports = withNativeWind(config, {
  input: path.join(projectRoot, "global.css"),
  configPath: path.join(projectRoot, "tailwind.config.js"),
});

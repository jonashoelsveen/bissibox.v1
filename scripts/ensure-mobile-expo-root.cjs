#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

const repoRoot = path.resolve(__dirname, "..");

function removeIfExists(targetPath, label) {
  if (!fs.existsSync(targetPath)) return;

  fs.rmSync(targetPath, { recursive: true, force: true });
  console.warn(`Removed ${label}. The Expo app lives in mobile/.`);
}

const blockedPackages = ["expo", "react-native", "expo-router"];
for (const packageName of blockedPackages) {
  removeIfExists(path.join(repoRoot, "node_modules", packageName), `${packageName} from repo root node_modules`);
}

for (const dirName of ["ios", "android", ".expo"]) {
  removeIfExists(path.join(repoRoot, dirName), `repo root ${dirName}/`);
}

for (const fileName of ["app.json", "app.config.js", "eas.json"]) {
  const filePath = path.join(repoRoot, fileName);
  if (!fs.existsSync(filePath)) continue;

  fs.rmSync(filePath, { force: true });
  console.warn(`Removed repo root ${fileName}. Use mobile/${fileName} instead.`);
}

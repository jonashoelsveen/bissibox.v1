#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

const mobileRoot = path.resolve(__dirname, "..");

function removeIfExists(targetPath) {
  if (!fs.existsSync(targetPath)) return;
  fs.rmSync(targetPath, { recursive: true, force: true });
  console.log(`Removed ${path.relative(mobileRoot, targetPath)}`);
}

function findDerivedDataDirs(dir, results = []) {
  if (!fs.existsSync(dir)) return results;

  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;

    const fullPath = path.join(dir, entry.name);
    if (entry.name === ".DerivedData") {
      results.push(fullPath);
      continue;
    }

    if (entry.name === "node_modules" || entry.name.startsWith(".")) {
      continue;
    }

    findDerivedDataDirs(fullPath, results);
  }

  return results;
}

removeIfExists(path.join(mobileRoot, "ios", "build"));
removeIfExists(path.join(mobileRoot, "android", "app", "build"));
removeIfExists(path.join(mobileRoot, "android", ".gradle"));
removeIfExists(path.join(mobileRoot, ".expo", "xcodebuild.log"));

const nodeModulesRoot = path.join(mobileRoot, "node_modules");
if (fs.existsSync(nodeModulesRoot)) {
  for (const derivedDataPath of findDerivedDataDirs(nodeModulesRoot)) {
    removeIfExists(derivedDataPath);
  }
}

console.log("Native build caches cleared.");

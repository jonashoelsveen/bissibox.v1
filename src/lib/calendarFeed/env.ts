import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { FeedKeyMaterial } from "./crypto.ts";

function envValue(name: string): string {
  const fromProcess = process.env[name]?.trim();
  if (fromProcess) return fromProcess;
  try {
    const raw = readFileSync(resolve(process.cwd(), ".env"), "utf8");
    for (const line of raw.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq < 0 || trimmed.slice(0, eq).trim() !== name) continue;
      let value = trimmed.slice(eq + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      return value.trim();
    }
  } catch {
    /* .env is optional in production */
  }
  return "";
}

export function loadFeedKeys(): FeedKeyMaterial | null {
  const enc = envValue("CALENDAR_FEED_ENC_KEY");
  const hmac = envValue("CALENDAR_FEED_HMAC_KEY");
  if (!enc || !hmac) return null;
  const encKey = Buffer.from(enc, "base64");
  const hmacKey = Buffer.from(hmac, "base64");
  if (encKey.length !== 32 || hmacKey.length < 16) return null;
  const version = Number(envValue("CALENDAR_FEED_KEY_VERSION") || "1");
  return {
    encKey,
    hmacKey,
    keyVersion: Number.isInteger(version) && version > 0 ? version : 1,
  };
}

export function strictFeedHosts(): boolean {
  const value = envValue("CALENDAR_FEED_STRICT_HOSTS").toLowerCase();
  return value === "1" || value === "true";
}

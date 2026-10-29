import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { FeedKeyMaterial } from "./crypto.ts";

function unquote(value: string): string {
  const trimmed = value.trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"') && trimmed.length >= 2) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'") && trimmed.length >= 2)
  ) {
    return trimmed.slice(1, -1).trim();
  }
  return trimmed;
}

function envValue(name: string): string {
  const fromProcess = process.env[name];
  if (fromProcess?.trim()) return unquote(fromProcess);
  try {
    const raw = readFileSync(resolve(process.cwd(), ".env"), "utf8");
    for (const line of raw.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq < 0 || trimmed.slice(0, eq).trim() !== name) continue;
      return unquote(trimmed.slice(eq + 1));
    }
  } catch {
    /* .env is optional in production */
  }
  return "";
}

const FEED_KEY_ENV = [
  ["CALENDAR_FEED_ENC_KEY", "calendar_feed_enc_key"],
  ["CALENDAR_FEED_HMAC_KEY", "calendar_feed_hmac_key"],
  ["CALENDAR_FEED_KEY_VERSION", "calendar_feed_key_version"],
] as const;

/** Fills empty feed key env from the vault when the host has no CALENDAR_FEED_* vars. */
export async function hydrateFeedKeys(
  readSecret: (name: string) => Promise<string | null>,
): Promise<void> {
  if (loadFeedKeys()) return;
  for (const [envName, vaultName] of FEED_KEY_ENV) {
    if (process.env[envName]?.trim()) continue;
    let value: string | null = null;
    try {
      value = await readSecret(vaultName);
    } catch {
      value = null;
    }
    const trimmed = value?.trim();
    if (trimmed) process.env[envName] = unquote(trimmed);
  }
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

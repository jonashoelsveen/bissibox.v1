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

function materialFrom(encRaw: string, hmacRaw: string, versionRaw: string): FeedKeyMaterial | null {
  const enc = unquote(encRaw);
  const hmac = unquote(hmacRaw);
  if (!enc || !hmac) return null;
  const encKey = Buffer.from(enc, "base64");
  const hmacKey = Buffer.from(hmac, "base64");
  if (encKey.length !== 32 || hmacKey.length < 16) return null;
  const version = Number(unquote(versionRaw) || "1");
  return {
    encKey,
    hmacKey,
    keyVersion: Number.isInteger(version) && version > 0 ? version : 1,
  };
}

export function loadFeedKeys(): FeedKeyMaterial | null {
  return materialFrom(
    envValue("CALENDAR_FEED_ENC_KEY"),
    envValue("CALENDAR_FEED_HMAC_KEY"),
    envValue("CALENDAR_FEED_KEY_VERSION"),
  );
}

/** Env keys when the host has them, otherwise the vault values just read. */
export async function resolveFeedKeys(
  readSecret: (name: string) => Promise<string | null>,
): Promise<FeedKeyMaterial | null> {
  const fromEnv = loadFeedKeys();
  if (fromEnv) return fromEnv;
  const read = async (envName: string, vaultName: string) => {
    const current = envValue(envName);
    if (current) return current;
    try {
      const value = await readSecret(vaultName);
      return value?.trim() ? unquote(value.trim()) : "";
    } catch {
      return "";
    }
  };
  const enc = await read("CALENDAR_FEED_ENC_KEY", "calendar_feed_enc_key");
  const hmac = await read("CALENDAR_FEED_HMAC_KEY", "calendar_feed_hmac_key");
  const version = await read("CALENDAR_FEED_KEY_VERSION", "calendar_feed_key_version");
  return materialFrom(enc, hmac, version);
}

export function strictFeedHosts(): boolean {
  const value = envValue("CALENDAR_FEED_STRICT_HOSTS").toLowerCase();
  return value === "1" || value === "true";
}

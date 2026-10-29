import { createCipheriv, createDecipheriv, createHmac, randomBytes } from "node:crypto";
import { FeedError } from "./types.ts";

export type FeedKeyMaterial = {
  encKey: Buffer;
  hmacKey: Buffer;
  keyVersion: number;
};

/** Stable form used for the HMAC and for the stored secret. */
export function normalizeFeedUrl(raw: string): string {
  let value = raw.trim();
  if (!value) throw new FeedError("invalid_url");
  value = value.replace(/^webcal:/i, "https:");
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new FeedError("invalid_url");
  }
  if (!url.hostname) throw new FeedError("invalid_url");
  url.hash = "";
  url.hostname = url.hostname.toLowerCase().replace(/\.$/, "");
  if (url.protocol === "https:" && (url.port === "443" || url.port === "")) url.port = "";
  return url.toString();
}

export function feedUrlHmac(normalizedUrl: string, hmacKey: Buffer): Buffer {
  return createHmac("sha256", hmacKey).update(normalizedUrl, "utf8").digest();
}

function aad(calendarId: string, ownerId: string): Buffer {
  return Buffer.from(`${calendarId}:${ownerId}`, "utf8");
}

/** Ciphertext is the AES-GCM payload with the 16-byte auth tag appended. */
export function encryptFeedUrl(
  url: string,
  calendarId: string,
  ownerId: string,
  keys: FeedKeyMaterial,
): { ciphertext: Buffer; iv: Buffer; keyVersion: number } {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", keys.encKey, iv);
  cipher.setAAD(aad(calendarId, ownerId));
  const body = Buffer.concat([cipher.update(url, "utf8"), cipher.final()]);
  const ciphertext = Buffer.concat([body, cipher.getAuthTag()]);
  return { ciphertext, iv, keyVersion: keys.keyVersion };
}

export function decryptFeedUrl(
  ciphertext: Buffer,
  iv: Buffer,
  calendarId: string,
  ownerId: string,
  encKey: Buffer,
): string {
  if (ciphertext.length < 17 || iv.length !== 12) throw new FeedError("unreachable", "The calendar could not be reached.");
  const tag = ciphertext.subarray(ciphertext.length - 16);
  const body = ciphertext.subarray(0, ciphertext.length - 16);
  const decipher = createDecipheriv("aes-256-gcm", encKey, iv);
  decipher.setAAD(aad(calendarId, ownerId));
  decipher.setAuthTag(tag);
  const plain = Buffer.concat([decipher.update(body), decipher.final()]);
  return plain.toString("utf8");
}

export function bufferToBytea(value: Buffer): string {
  return `\\x${value.toString("hex")}`;
}

export function byteaToBuffer(value: string): Buffer {
  if (value.startsWith("\\x") || value.startsWith("\\X")) return Buffer.from(value.slice(2), "hex");
  return Buffer.from(value, "base64");
}

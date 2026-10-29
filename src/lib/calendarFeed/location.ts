import { googleMapsSearchUrl } from "../googleMapsUrl.ts";
import { refineMazemapHref } from "../mazemapLink.ts";
import { isMazemapHost } from "./mapHosts.ts";
import type { FeedLocation } from "./types.ts";

const HTTP_URL = /\bhttps?:\/\/[^\s<>"']+/gi;

export function extractHttpUrls(text: string): string[] {
  const found: string[] = [];
  for (const match of text.matchAll(HTTP_URL)) {
    let token = match[0] ?? "";
    while (/[.,;:!?)]$/.test(token)) token = token.slice(0, -1);
    try {
      const url = new URL(token);
      if (url.protocol !== "http:" && url.protocol !== "https:") continue;
      found.push(url.toString());
    } catch {
      /* skip malformed */
    }
  }
  return found;
}

function propertyParameter(property: { getParameter?: (name: string) => unknown } | null, name: string): string {
  const value = property?.getParameter?.(name);
  return typeof value === "string" ? value.trim() : "";
}

function propertyText(component: IcalComponent, name: string): string {
  const value = component.getFirstPropertyValue?.(name);
  return typeof value === "string" ? value.trim() : value == null ? "" : String(value).trim();
}

type IcalComponent = {
  getFirstProperty?: (name: string) => { getParameter?: (name: string) => unknown } | null;
  getFirstPropertyValue?: (name: string) => unknown;
};

function roomFromMazemap(url: string): string | null {
  try {
    const parsed = new URL(url);
    const raw = parsed.searchParams.get("sharepoi") ?? parsed.searchParams.get("dest") ?? "";
    const text = decodeURIComponent(raw).trim();
    if (!text || /^\d+$/.test(text)) return null;
    return text;
  } catch {
    return null;
  }
}

function stripUrls(text: string): string {
  return text
    .replace(HTTP_URL, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function geoPair(component: IcalComponent): { lat: number; lng: number } | null {
  const value = component.getFirstPropertyValue?.("geo");
  if (!value) return null;
  if (typeof value === "string") {
    const [lat, lng] = value.split(/[;,]/).map((part) => Number(part.trim()));
    if (Number.isFinite(lat) && Number.isFinite(lng)) return { lat: lat as number, lng: lng as number };
  }
  if (typeof value === "object" && value) {
    const record = value as { lat?: number; lon?: number; lng?: number };
    const lat = Number(record.lat);
    const lng = Number(record.lon ?? record.lng);
    if (Number.isFinite(lat) && Number.isFinite(lng)) return { lat, lng };
  }
  return null;
}

export function buildFeedLocation(component: IcalComponent): FeedLocation | null {
  const locationProp = component.getFirstProperty?.("location") ?? null;
  const locationText = propertyText(component, "location");
  const altrep = propertyParameter(locationProp, "altrep");
  const urlProp = propertyText(component, "url");
  const description = propertyText(component, "description");
  const candidates = [
    ...extractHttpUrls(altrep),
    ...extractHttpUrls(locationText),
    ...extractHttpUrls(urlProp),
    ...extractHttpUrls(description),
  ];
  const mazemap = candidates.find((candidate) => {
    try {
      return isMazemapHost(new URL(candidate).hostname);
    } catch {
      return false;
    }
  });
  if (mazemap) {
    const structured = component.getFirstProperty?.("x-apple-structured-location") ?? null;
    const appleTitle = propertyParameter(structured, "x-title");
    const label =
      stripUrls(locationText) ||
      appleTitle ||
      roomFromMazemap(mazemap) ||
      "MazeMap";
    return { label, url: refineMazemapHref(mazemap, label), provider: "mazemap" };
  }
  const plain = stripUrls(locationText);
  if (plain) {
    const geo = geoPair(component);
    const url = geo
      ? googleMapsSearchUrl({ lat: geo.lat, lng: geo.lng })
      : googleMapsSearchUrl({ query: plain });
    return { label: plain, url, provider: "google" };
  }
  return null;
}

function safeLinkText(text: string): string {
  return text.replace(/\b[a-z][a-z0-9+.-]*:[^\s<>"']+/gi, (token) => {
    const scheme = token.slice(0, token.indexOf(":")).toLowerCase();
    if (scheme === "http" || scheme === "https" || scheme === "mailto") return token;
    return "";
  });
}

function collapseBlank(text: string): string {
  return text
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function buildFeedDescription(component: IcalComponent, locationUrl: string | null): string | null {
  const description = propertyText(component, "description");
  const comment = propertyText(component, "comment");
  const url = propertyText(component, "url");
  const conferences = [
    propertyText(component, "x-google-conference"),
    propertyText(component, "x-microsoft-skypeteamsmeetingurl"),
    propertyText(component, "conference"),
  ].filter(Boolean);
  const parts = [description, comment].filter(Boolean);
  let text = parts.join("\n\n");
  const locationOnlyUrls = extractHttpUrls(propertyText(component, "location")).filter((candidate) => {
    try {
      return !isMazemapHost(new URL(candidate).hostname);
    } catch {
      return false;
    }
  });
  const extras = [url, ...conferences, ...locationOnlyUrls].filter((value) => value && !text.includes(value));
  if (extras.length) text = [text, ...extras].filter(Boolean).join("\n\n");
  if (locationUrl) {
    text = text.split(locationUrl).join("");
  }
  text = collapseBlank(safeLinkText(text));
  return text || null;
}

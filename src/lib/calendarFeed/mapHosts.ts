/** Hosts that open in a map app instead of a web search. */
export function isMazemapHost(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/\.$/, "");
  return host === "mazemap.com" || host.endsWith(".mazemap.com");
}

export function isMazemapHttpUrl(value: string | null | undefined): boolean {
  const raw = (value ?? "").trim();
  if (!raw) return false;
  try {
    const url = new URL(raw);
    if (url.protocol !== "http:" && url.protocol !== "https:") return false;
    return isMazemapHost(url.hostname);
  } catch {
    return false;
  }
}

/**
 * Shared Mapbox GL helpers used by every map component in the app.
 *
 * Responsibilities:
 *   1. Load the Mapbox GL JS module + stylesheet on demand (client-only).
 *   2. Fetch and cache the public access token from the server function.
 *   3. Persist the user's selected map style per map instance in
 *      localStorage so it survives navigation.
 *   4. Provide the canonical list of map styles offered to the user
 *      (Outdoors, Satellite Streets, Light) and their human labels.
 */

import { useEffect, useState } from "react";
import { getMapboxToken } from "@/lib/mapbox-token.functions";

export type MapStyleId = "outdoors" | "satellite-streets" | "light";

export const MAP_STYLES: Record<
  MapStyleId,
  { label: string; url: string; description: string }
> = {
  outdoors: {
    label: "Outdoors",
    url: "mapbox://styles/mapbox/outdoors-v12",
    description: "Terrain, contour lines, trails — best for course planning.",
  },
  "satellite-streets": {
    label: "Satellite Streets",
    url: "mapbox://styles/mapbox/satellite-streets-v12",
    description: "Aerial imagery with street labels.",
  },
  light: {
    label: "Light",
    url: "mapbox://styles/mapbox/light-v11",
    description: "Minimal, neutral basemap that lets your data stand out.",
  },
};

export const DEFAULT_MAP_STYLE: MapStyleId = "outdoors";
const GLOBAL_STYLE_KEY = "mapbox:global-style";

/* ─────────────── style persistence ─────────────── */

export function readMapStyle(scope?: string | null): MapStyleId {
  if (typeof window === "undefined") return DEFAULT_MAP_STYLE;
  try {
    const key = scope ? `mapbox:style:${scope}` : GLOBAL_STYLE_KEY;
    const v = localStorage.getItem(key);
    if (v && v in MAP_STYLES) return v as MapStyleId;
    // Fall back to global default if instance has no preference yet.
    if (scope) {
      const g = localStorage.getItem(GLOBAL_STYLE_KEY);
      if (g && g in MAP_STYLES) return g as MapStyleId;
    }
  } catch {
    /* ignore */
  }
  return DEFAULT_MAP_STYLE;
}

export function writeMapStyle(scope: string | null, style: MapStyleId): void {
  if (typeof window === "undefined") return;
  try {
    const key = scope ? `mapbox:style:${scope}` : GLOBAL_STYLE_KEY;
    localStorage.setItem(key, style);
    window.dispatchEvent(
      new CustomEvent("mapbox-style:change", { detail: { scope, style } }),
    );
  } catch {
    /* ignore */
  }
}

/* ─────────────── token fetch ─────────────── */

let tokenPromise: Promise<string> | null = null;
let cachedToken = "";

export function loadMapboxToken(): Promise<string> {
  if (tokenPromise) return tokenPromise;
  tokenPromise = getMapboxToken()
    .then((res) => {
      if (!res.token) {
        cachedToken = "";
        // eslint-disable-next-line no-console
        console.error("Mapbox token unavailable:", res.error);
        return "";
      }
      cachedToken = res.token;
      return res.token;
    })
    .catch((err) => {
      // eslint-disable-next-line no-console
      console.error("Mapbox token fetch failed:", err);
      cachedToken = "";
      tokenPromise = null;
      return "";
    });
  return tokenPromise;
}

export function getCachedMapboxToken(): string {
  return cachedToken;
}

/* ─────────────── module loader ─────────────── */

let mapboxPromise: Promise<typeof import("mapbox-gl")> | null = null;

let cssPromise: Promise<void> | null = null;
function ensureCss(): Promise<void> {
  if (typeof document === "undefined") return Promise.resolve();
  if (cssPromise) return cssPromise;
  const existing = document.getElementById("mapbox-gl-css") as HTMLLinkElement | null;
  if (existing) {
    // If the link already exists (e.g. inserted by a previous mount) treat as ready.
    cssPromise = Promise.resolve();
    return cssPromise;
  }
  cssPromise = new Promise<void>((resolve) => {
    const link = document.createElement("link");
    link.id = "mapbox-gl-css";
    link.rel = "stylesheet";
    link.href = "https://api.mapbox.com/mapbox-gl-js/v3.7.0/mapbox-gl.css";
    link.onload = () => resolve();
    link.onerror = () => {
      // eslint-disable-next-line no-console
      console.error("[mapbox] failed to load mapbox-gl.css");
      resolve(); // resolve anyway so map can still try to render
    };
    document.head.appendChild(link);
  });
  return cssPromise;
}

export async function loadMapbox(): Promise<typeof import("mapbox-gl")> {
  // Kick off CSS + module load + token fetch in parallel; await all before returning.
  const cssReady = ensureCss();
  if (!mapboxPromise) {
    mapboxPromise = import("mapbox-gl");
  }
  const [mod, token] = await Promise.all([mapboxPromise, loadMapboxToken()]);
  await cssReady;
  if (!token) {
    // eslint-disable-next-line no-console
    console.error("[mapbox] no access token returned from server function — map will be blank");
  }
  if (token && (mod as any).default.accessToken !== token) {
    (mod as any).default.accessToken = token;
  }
  return mod;
}

function isMapContainerVisible(element: HTMLElement): boolean {
  if (typeof window === "undefined") return false;
  if (!element.isConnected) return false;

  const rect = element.getBoundingClientRect();
  if (rect.width < 8 || rect.height < 8) return false;

  let current: HTMLElement | null = element;
  while (current) {
    const style = window.getComputedStyle(current);
    if (
      current.hasAttribute("hidden") ||
      style.display === "none" ||
      style.visibility === "hidden"
    ) {
      return false;
    }
    current = current.parentElement;
  }

  return true;
}

export function auditMapContainer(element: HTMLElement, label: string): void {
  if (typeof window === "undefined") return;

  const issues: string[] = [];
  let current: HTMLElement | null = element;
  let depth = 0;

  while (current && depth < 6) {
    const rect = current.getBoundingClientRect();
    const style = window.getComputedStyle(current);
    const name = current.id ? `#${current.id}` : current.tagName.toLowerCase();

    if (rect.width === 0 || rect.height === 0) {
      issues.push(`${name} has ${Math.round(rect.width)}×${Math.round(rect.height)} size`);
    }
    if (current.hasAttribute("hidden") || style.display === "none" || style.visibility === "hidden") {
      issues.push(`${name} is hidden by CSS/attribute`);
    }
    if (
      (style.overflow === "hidden" || style.overflowX === "hidden" || style.overflowY === "hidden") &&
      (rect.width === 0 || rect.height === 0)
    ) {
      issues.push(`${name} clips overflow while the map area is collapsed`);
    }

    current = current.parentElement;
    depth += 1;
  }

  if (issues.length > 0) {
    // eslint-disable-next-line no-console
    console.warn(`[mapbox] ${label} container audit:`, issues);
  }
}

export function observeVisibleMapContainer(
  element: HTMLElement,
  label: string,
  onVisible: () => void,
): () => void {
  if (typeof window === "undefined") return () => {};

  let done = false;
  let cancelled = false;

  const attempt = () => {
    if (cancelled || done) return;
    if (isMapContainerVisible(element)) {
      done = true;
      onVisible();
    }
  };

  const targets: HTMLElement[] = [];
  let current: HTMLElement | null = element;
  let depth = 0;
  while (current && depth < 6) {
    targets.push(current);
    current = current.parentElement;
    depth += 1;
  }

  const resizeObserver =
    typeof ResizeObserver !== "undefined"
      ? new ResizeObserver(() => {
          attempt();
        })
      : null;
  targets.forEach((target) => resizeObserver?.observe(target));

  const mutationObservers =
    typeof MutationObserver !== "undefined"
      ? targets.map((target) => {
          const observer = new MutationObserver(() => {
            attempt();
          });
          observer.observe(target, {
            attributes: true,
            attributeFilter: ["class", "style", "hidden", "open"],
          });
          return observer;
        })
      : [];

  const rafId = requestAnimationFrame(attempt);
  const timeoutIds = [
    window.setTimeout(attempt, 0),
    window.setTimeout(attempt, 100),
    window.setTimeout(() => {
      attempt();
      if (!done) auditMapContainer(element, label);
    }, 250),
    window.setTimeout(attempt, 500),
  ];

  return () => {
    cancelled = true;
    resizeObserver?.disconnect();
    mutationObservers.forEach((observer) => observer.disconnect());
    cancelAnimationFrame(rafId);
    timeoutIds.forEach((id) => window.clearTimeout(id));
  };
}

/**
 * React hook: load Mapbox GL once on mount and return it.
 * Returns `null` until the module + token are ready.
 */
export function useMapbox(): typeof import("mapbox-gl") | null {
  const [m, setM] = useState<typeof import("mapbox-gl") | null>(null);
  useEffect(() => {
    let cancelled = false;
    void loadMapbox().then((mod) => {
      if (!cancelled) setM(mod);
    });
    return () => {
      cancelled = true;
    };
  }, []);
  return m;
}

/**
 * React hook: subscribes to localStorage style changes for a given map scope.
 * Components can call this to react to the in-map style switcher *and* to
 * the global Map Settings selector at the same time.
 */
export function useMapStyle(scope: string | null): [MapStyleId, (s: MapStyleId) => void] {
  const [style, setStyle] = useState<MapStyleId>(() => readMapStyle(scope));
  useEffect(() => {
    const onChange = (e: Event) => {
      const ce = e as CustomEvent<{ scope: string | null; style: MapStyleId }>;
      // Update if this scope changed, or the global default changed and we
      // have no per-instance override.
      if (!ce.detail) return;
      if (ce.detail.scope === scope) {
        setStyle(ce.detail.style);
      } else if (ce.detail.scope === null && scope) {
        const hasOverride =
          typeof window !== "undefined" &&
          localStorage.getItem(`mapbox:style:${scope}`) != null;
        if (!hasOverride) setStyle(ce.detail.style);
      }
    };
    window.addEventListener("mapbox-style:change", onChange);
    return () => window.removeEventListener("mapbox-style:change", onChange);
  }, [scope]);
  const set = (s: MapStyleId) => {
    writeMapStyle(scope, s);
    setStyle(s);
  };
  return [style, set];
}

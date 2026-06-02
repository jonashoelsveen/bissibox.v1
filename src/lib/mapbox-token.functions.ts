import { createServerFn } from "@tanstack/react-start";

/**
 * Returns the public Mapbox access token (pk.*) so the browser can
 * initialize Mapbox GL JS. The token is stored as a runtime secret
 * (`MAPBOX_PUBLIC_TOKEN`) and surfaced through this server function so
 * it's never bundled into client code at build time.
 *
 * Mapbox public tokens are designed to be exposed in the browser, but
 * fetching them at runtime keeps token rotation a one-step operation
 * and avoids the VITE_ build-time pipeline.
 */
export const getMapboxToken = createServerFn({ method: "GET" }).handler(
  async () => {
    const token = process.env.MAPBOX_PUBLIC_TOKEN;
    if (!token) {
      return { token: "" as string, error: "MAPBOX_PUBLIC_TOKEN is not set" };
    }
    return { token, error: null as string | null };
  },
);

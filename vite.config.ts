// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - tanstackStart, viteReact, tailwindcss, tsConfigPaths, cloudflare (build-only),
//     componentTagger (dev-only), VITE_* env injection, @ path alias, React/TanStack dedupe,
//     error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... } }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";

export default defineConfig({
  nitro: {
    preset: "vercel",
  },
  vite: {
    server: {
      // Bind on all interfaces so phones / other devices on Wi‑Fi can reach the app.
      // Port 80 needs root on macOS, so the dev server uses 3000.
      host: "0.0.0.0",
      port: 3000,
      strictPort: false,
      allowedHosts: true,
    },
  },
});

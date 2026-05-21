// Canonical /photos URL — re-renders the same Library/Media page as /media so
// existing links keep working unchanged. The implementation lives in
// `src/routes/media.tsx`; this file just re-exports its component under a new
// route path. Apps-menu navigates here.
import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/photos")({
  // For now, /photos forwards to /media so we don't fork the 4500-line library
  // implementation. Functionally identical from the user's perspective.
  beforeLoad: ({ search }) => {
    throw redirect({ to: "/media", search: search as never, replace: true });
  },
});

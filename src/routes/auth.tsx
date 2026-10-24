import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";

type SearchParams = { redirect?: string };

export const Route = createFileRoute("/auth")({
  validateSearch: (search: Record<string, unknown>): SearchParams => ({
    redirect: typeof search.redirect === "string" ? search.redirect : undefined,
  }),
  component: AuthRedirect,
  head: () => ({ meta: [{ title: "Bissibox" }] }),
});

/**
 * The old /auth UI has been replaced by the in-page SignInModal on the
 * Bissibox Cloud home. Any legacy link to /auth simply forwards to "/" so
 * the user lands on the landing page and can sign in there.
 */
function AuthRedirect() {
  const navigate = useNavigate();
  useEffect(() => {
    navigate({ to: "/", replace: true });
  }, [navigate]);
  return null;
}

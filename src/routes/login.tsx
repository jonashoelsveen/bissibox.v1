import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";

type SearchParams = { redirect?: string };

export const Route = createFileRoute("/login")({
  validateSearch: (s: Record<string, unknown>): SearchParams => ({
    redirect: typeof s.redirect === "string" ? s.redirect : undefined,
  }),
  component: LoginRedirect,
  head: () => ({ meta: [{ title: "Bissibox" }] }),
});

/** Legacy /login route forwards to the new landing page sign-in modal. */
function LoginRedirect() {
  const navigate = useNavigate();
  useEffect(() => {
    navigate({ to: "/", replace: true });
  }, [navigate]);
  return null;
}

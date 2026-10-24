import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { useAuth } from "@/lib/auth";
import { CLOUD_PAGE_BG } from "@/lib/cloud-landing-design";
import { ENTITY_INVITE_STORAGE_KEY } from "@/components/entity/EntityInviteGate";
import { isEntityFeatureEnabled } from "@/lib/features";

import { entityFeatureRouteGuard } from "@/lib/entity-route";

type SearchParams = { token?: string };

export const Route = createFileRoute("/accept-entity-invite")({
  validateSearch: (search: Record<string, unknown>): SearchParams => ({
    token: typeof search.token === "string" ? search.token : undefined,
  }),
  beforeLoad: () => {
    /** Invite landing — Bucket A: currently live, hidden this round. */
    entityFeatureRouteGuard("entityInviteFlow", "/calendar");
  },
  component: AcceptEntityInviteLanding,
  head: () => ({ meta: [{ title: "Accept invitation · Bissibox Cloud" }] }),
});

/** Stores invite token and routes unauthenticated users to cloud sign-in. */
function AcceptEntityInviteLanding() {
  const { user, authReady } = useAuth();
  const navigate = useNavigate();
  const { token } = Route.useSearch();

  useEffect(() => {
    /** Invite landing — Bucket A: currently live, hidden this round. */
    if (!isEntityFeatureEnabled("entityInviteFlow")) {
      void navigate({ to: "/calendar", replace: true });
      return;
    }
    if (!token) {
      void navigate({ to: "/", replace: true });
      return;
    }

    sessionStorage.setItem(ENTITY_INVITE_STORAGE_KEY, token);
    if (!authReady) return;

    if (!user) {
      void navigate({
        to: "/",
        search: { signin: "cloud", invite: token },
        replace: true,
      });
      return;
    }

    void navigate({ to: "/", search: { invite: token }, replace: true });
  }, [token, user, authReady, navigate]);

  return (
    <div className="min-h-full w-full" style={{ backgroundColor: CLOUD_PAGE_BG }} />
  );
}

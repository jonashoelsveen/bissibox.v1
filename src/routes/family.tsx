import { createFileRoute } from "@tanstack/react-router";
import { AccountSectionView } from "@/components/account/AccountSectionView";
import { accountRouteGuard } from "@/lib/account-route";
import { entityFeatureRouteGuard } from "@/lib/entity-route";

export const Route = createFileRoute("/family")({
  beforeLoad: ({ context }) => {
    accountRouteGuard({ context });
    /** Entity memberships tab page — Bucket A: currently live, hidden this round. */
    entityFeatureRouteGuard("entityMembershipManagement", "/me");
  },
  component: () => <AccountSectionView id="family" />,
  head: () => ({ meta: [{ title: "Entity memberships — Aponna Account" }] }),
});

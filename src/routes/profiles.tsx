import { createFileRoute } from "@tanstack/react-router";
import { AccountSectionView } from "@/components/account/AccountSectionView";
import { accountRouteGuard } from "@/lib/account-route";

export const Route = createFileRoute("/profiles")({
  beforeLoad: ({ context }) => accountRouteGuard({ context }),
  component: () => <AccountSectionView id="profiles" />,
  head: () => ({ meta: [{ title: "Profiles — Aponna Account" }] }),
});

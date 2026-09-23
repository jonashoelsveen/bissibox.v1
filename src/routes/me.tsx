import { createFileRoute } from "@tanstack/react-router";
import { AccountSectionView } from "@/components/account/AccountSectionView";
import { accountRouteGuard } from "@/lib/account-route";

export const Route = createFileRoute("/me")({
  beforeLoad: ({ context }) => accountRouteGuard({ context }),
  component: () => <AccountSectionView id="me" />,
  head: () => ({ meta: [{ title: "Account" }] }),
});

import { createFileRoute, redirect } from "@tanstack/react-router";
import { accountRouteGuard } from "@/lib/account-route";

export const Route = createFileRoute("/storage")({
  beforeLoad: ({ context }) => {
    accountRouteGuard({ context });
    throw redirect({ to: "/me" });
  },
});

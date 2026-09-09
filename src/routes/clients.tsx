import { createFileRoute, redirect } from "@tanstack/react-router";
import { ClientsPage } from "@/components/team/ClientsPage";
import { isFeatureEnabled } from "@/lib/features";

export const Route = createFileRoute("/clients")({
  beforeLoad: () => {
    if (!isFeatureEnabled("clientsApp")) throw redirect({ to: "/calendar" });
  },
  component: ClientsPage,
  head: () => ({ meta: [{ title: "Clients · Aponna" }] }),
});

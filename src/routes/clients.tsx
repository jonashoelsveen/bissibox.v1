import { createFileRoute } from "@tanstack/react-router";
import { ClientsPage } from "@/components/team/ClientsPage";

export const Route = createFileRoute("/clients")({
  component: ClientsPage,
  head: () => ({ meta: [{ title: "Clients · Aponna" }] }),
});

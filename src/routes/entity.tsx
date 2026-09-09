import { createFileRoute } from "@tanstack/react-router";
import { EntityPage } from "@/components/entity/EntityPage";
import { entityFeatureRouteGuard } from "@/lib/entity-route";

export const Route = createFileRoute("/entity")({
  beforeLoad: () => {
    /** Entity workspace — Bucket A: reachable by URL, hidden this round. */
    entityFeatureRouteGuard("entityWorkspace", "/calendar");
  },
  component: EntityPage,
  head: () => ({
    meta: [
      { title: "Entity · Aponna" },
      { name: "description", content: "Entity workspace." },
    ],
  }),
});

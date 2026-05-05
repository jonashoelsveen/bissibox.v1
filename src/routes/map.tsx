import { createFileRoute } from "@tanstack/react-router";
import { MapPage } from "@/components/map/MapPage";

export const Route = createFileRoute("/map")({
  component: MapPage,
  validateSearch: (
    s: Record<string, unknown>,
  ): { folder?: string; open?: string; edit?: string; view?: "previous" } => ({
    folder: typeof s.folder === "string" ? (s.folder as string) : undefined,
    open: typeof s.open === "string" ? (s.open as string) : undefined,
    edit: typeof s.edit === "string" ? (s.edit as string) : undefined,
    view: s.view === "previous" ? "previous" : undefined,
  }),
  head: () => ({ meta: [{ title: "Map · Raceline" }] }),
});

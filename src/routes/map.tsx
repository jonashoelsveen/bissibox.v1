import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/map")({
  validateSearch: (
    s: Record<string, unknown>,
  ): { folder?: string; open?: string; edit?: string; view?: "previous" } => ({
    folder: typeof s.folder === "string" ? (s.folder as string) : undefined,
    open: typeof s.open === "string" ? (s.open as string) : undefined,
    edit: typeof s.edit === "string" ? (s.edit as string) : undefined,
    view: s.view === "previous" ? "previous" : undefined,
  }),
  beforeLoad: ({ search }) => {
    throw redirect({
      to: "/media",
      search: { tab: "map" as const, ...search },
    });
  },
});

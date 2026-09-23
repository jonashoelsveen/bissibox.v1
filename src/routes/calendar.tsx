import { createFileRoute } from "@tanstack/react-router";
import { CalendarPage } from "@/components/calendar/CalendarPage";

export const Route = createFileRoute("/calendar")({
  component: CalendarPage,
  validateSearch: (
    s: Record<string, unknown>,
  ): { folder?: string; open?: string; view?: "previous" } => ({
    folder: typeof s.folder === "string" ? (s.folder as string) : undefined,
    open: typeof s.open === "string" ? (s.open as string) : undefined,
    view: s.view === "previous" ? "previous" : undefined,
  }),
  head: () => ({ meta: [{ title: "Bissibox" }] }),
});

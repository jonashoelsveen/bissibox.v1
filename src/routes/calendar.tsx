import { createFileRoute } from "@tanstack/react-router";
import { CalendarPage } from "@/components/calendar/CalendarPage";

export const Route = createFileRoute("/calendar")({
  component: CalendarPage,
  validateSearch: (
    s: Record<string, unknown>,
  ): { calendar?: string; view?: "previous" } => ({
    calendar: typeof s.calendar === "string" ? (s.calendar as string) : undefined,
    view: s.view === "previous" ? "previous" : undefined,
  }),
  head: () => ({ meta: [{ title: "Calendar · Raceline" }] }),
});

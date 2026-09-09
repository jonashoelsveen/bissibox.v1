import { createFileRoute, redirect } from "@tanstack/react-router";
import { ProjectsPage } from "@/components/calendar/CalendarPage";
import { isFeatureEnabled } from "@/lib/features";

export const Route = createFileRoute("/projects")({
  beforeLoad: () => {
    if (!isFeatureEnabled("projectsApp")) throw redirect({ to: "/calendar" });
  },
  component: ProjectsPage,
  head: () => ({ meta: [{ title: "Projects · Aponna" }] }),
});

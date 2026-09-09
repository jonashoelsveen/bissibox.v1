import { Outlet, createFileRoute, redirect } from "@tanstack/react-router";
import { EventDraftsProvider } from "@/components/events/useEventDrafts";
import { isFeatureEnabled } from "@/lib/features";

export const Route = createFileRoute("/events")({
  beforeLoad: () => {
    if (!isFeatureEnabled("eventsApp")) throw redirect({ to: "/calendar" });
  },
  component: EventsLayout,
});

function EventsLayout() {
  return (
    <EventDraftsProvider>
      <Outlet />
    </EventDraftsProvider>
  );
}

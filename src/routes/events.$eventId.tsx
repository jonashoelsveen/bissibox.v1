import { createFileRoute } from "@tanstack/react-router";
import { EventViewer } from "@/components/EventViewer";

export const Route = createFileRoute("/events/$eventId")({
  component: EventDetail,
});

function EventDetail() {
  const { eventId } = Route.useParams();
  return <EventViewer eventId={eventId} />;
}

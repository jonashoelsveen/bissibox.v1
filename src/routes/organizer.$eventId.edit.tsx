import { createFileRoute } from "@tanstack/react-router";
import { OrganizerEventEditor } from "@/components/OrganizerEventEditor";

export const Route = createFileRoute("/organizer/$eventId/edit")({
  component: EditEvent,
  head: () => ({ meta: [{ title: "Edit event · Raceline Organizer" }] }),
});

function EditEvent() {
  const { eventId } = Route.useParams();
  return <OrganizerEventEditor mode="edit" eventId={eventId} />;
}

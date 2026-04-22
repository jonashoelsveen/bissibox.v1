import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { OrganizerEventEditor } from "@/components/OrganizerEventEditor";

export const Route = createFileRoute("/organizer/new")({
  component: NewEvent,
  head: () => ({ meta: [{ title: "New event · Raceline Organizer" }] }),
});

function NewEvent() {
  const nav = useNavigate();
  return (
    <OrganizerEventEditor
      mode="create"
      onSaved={(id: string) => nav({ to: "/organizer/$eventId/edit", params: { eventId: id } })}
    />
  );
}

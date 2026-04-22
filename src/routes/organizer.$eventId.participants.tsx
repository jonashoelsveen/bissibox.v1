import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/organizer/$eventId/participants")({
  beforeLoad: ({ params }) => {
    throw redirect({
      to: "/organizer/$eventId/edit",
      params: { eventId: params.eventId },
    });
  },
  component: () => null,
});

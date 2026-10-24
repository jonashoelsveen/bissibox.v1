import { createFileRoute } from "@tanstack/react-router";
import { EventEditPage } from "@/components/events/EventEditPage";

export const Route = createFileRoute("/events/$eventId")({
  component: EventEditPage,
  head: () => ({
    meta: [{ title: "Event · Bissibox" }],
  }),
});

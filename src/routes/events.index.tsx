import { createFileRoute } from "@tanstack/react-router";
import { EventsPage } from "@/components/events/EventsPage";

export const Route = createFileRoute("/events/")({
  component: EventsPage,
  head: () => ({
    meta: [
      { title: "Events · Aponna" },
      { name: "description", content: "Events workspace." },
    ],
  }),
});

import { createFileRoute } from "@tanstack/react-router";
import { DiaryPage } from "@/components/calendar/DiaryPage";

export const Route = createFileRoute("/diary")({
  component: DiaryPage,
  head: () => ({ meta: [{ title: "Diary · Raceline" }] }),
});

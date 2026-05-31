import { createFileRoute } from "@tanstack/react-router";
import { DiaryPage } from "@/components/calendar/DiaryPage";

type DiarySearch = { view?: "stats" };

export const Route = createFileRoute("/diary")({
  component: DiaryPage,
  head: () => ({ meta: [{ title: "Diary · Raceline" }] }),
  validateSearch: (search: Record<string, unknown>): DiarySearch => {
    return search.view === "stats" ? { view: "stats" } : {};
  },
});

import type { SearchResult } from "./CalendarSearchContext";

const WEEKDAYS_NB = ["søn", "man", "tir", "ons", "tor", "fre", "lør"];
const MONTHS_NB_SHORT = [
  "jan", "feb", "mar", "apr", "mai", "jun",
  "jul", "aug", "sep", "okt", "nov", "des",
];

export function eventDayKey(startISO: string): string {
  const d = new Date(startISO);
  if (Number.isNaN(d.getTime())) {
    return startISO.match(/^(\d{4}-\d{2}-\d{2})/)?.[1] ?? "";
  }
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function formatUpcomingDay(startISO: string): string {
  const d = new Date(startISO);
  if (Number.isNaN(d.getTime())) return "";
  const weekday = WEEKDAYS_NB[d.getDay()] ?? "";
  const month = MONTHS_NB_SHORT[d.getMonth()] ?? "";
  return `${weekday} ${d.getDate()}. ${month}.`;
}

export type DayGroup = { key: string; label: string; sessions: SearchResult[] };

export function groupByDay(list: SearchResult[]): DayGroup[] {
  const groups: DayGroup[] = [];
  for (const r of list) {
    const key = eventDayKey(r.startISO);
    const last = groups[groups.length - 1];
    if (last && last.key === key) last.sessions.push(r);
    else groups.push({ key, label: formatUpcomingDay(r.startISO), sessions: [r] });
  }
  return groups;
}

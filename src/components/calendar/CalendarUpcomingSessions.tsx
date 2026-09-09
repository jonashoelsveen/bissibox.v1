/**
 * Notion-style upcoming sessions list for the calendar left rail.
 *
 * Replaces the mini calendar. Groups by local day, left color bar only,
 * title in ink and time in muted grey. Drops sessions as they end (15s tick
 * + published event updates).
 */

import { useEffect, useMemo, useState } from "react";
import { DEFAULT_SESSION_COLOR, sessionTileChrome } from "@/components/library/CategoryActionsMenu";
import { useSidenavScrollFade } from "./useSidenavScrollFade";
import {
  useCalendarSearchSafe,
  type SearchResult,
} from "./CalendarSearchContext";
import type { CalendarEvent } from "./yearStore";
import { fromISOLocal, startEndMinsOnStartDay } from "./dateUtils";
import { groupByDay } from "./sessionDayGroups";

const SCROLL_MASK = {
  maskImage:
    "linear-gradient(to bottom, black 0, black calc(100% - 28px), transparent 100%)",
  WebkitMaskImage:
    "linear-gradient(to bottom, black 0, black calc(100% - 28px), transparent 100%)",
} as const;

function parseSessionMs(iso: string): number {
  const t = new Date(iso).getTime();
  return Number.isNaN(t) ? NaN : t;
}

function toSearchResult(e: CalendarEvent): SearchResult {
  return {
    id: e.id,
    title: e.title || e.diarySub || e.diaryGroup || "Session",
    startISO: e.startISO,
    endISO: e.endISO,
    color: e.color,
    allDay: e.allDay,
  };
}

/** Keep until end is still in the future; all-day lasts through that local day. */
function isUpcoming(e: CalendarEvent, now: number): boolean {
  const start = parseSessionMs(e.startISO);
  const end = parseSessionMs(e.endISO);
  if (e.allDay) {
    const ref = !Number.isNaN(end) ? end : start;
    if (Number.isNaN(ref)) return false;
    const d = new Date(ref);
    const midnightExclusive =
      d.getHours() === 0 &&
      d.getMinutes() === 0 &&
      d.getSeconds() === 0 &&
      !Number.isNaN(end) &&
      !Number.isNaN(start) &&
      end > start;
    const lastInclusive = midnightExclusive ? new Date(ref - 1) : d;
    return (
      new Date(
        lastInclusive.getFullYear(),
        lastInclusive.getMonth(),
        lastInclusive.getDate() + 1,
      ).getTime() > now
    );
  }
  if (!Number.isNaN(end)) return end >= now;
  return !Number.isNaN(start) && start >= now;
}

function formatTimeRange(startISO: string, endISO: string, allDay: boolean): string {
  if (allDay) return "All day";
  const start = fromISOLocal(startISO);
  const end = fromISOLocal(endISO);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return "";
  const { startMin, endMin } = startEndMinsOnStartDay(start, end);
  const fmt = (min: number) => {
    const h = Math.floor(min / 60);
    const m = min % 60;
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
  };
  return `${fmt(startMin)} – ${fmt(endMin)}`;
}

export function CalendarUpcomingSessions() {
  const search = useCalendarSearchSafe();
  const events = search?.events ?? [];
  const selectedId = search?.selectedId ?? null;
  const setScrollRef = useSidenavScrollFade();
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 15_000);
    return () => window.clearInterval(id);
  }, []);

  const groups = useMemo(() => {
    const list: SearchResult[] = [];
    for (const e of events) {
      if (!isUpcoming(e, now)) continue;
      list.push(toSearchResult(e));
    }
    list.sort((a, b) => (a.startISO < b.startISO ? -1 : a.startISO > b.startISO ? 1 : 0));
    return groupByDay(list);
  }, [events, now]);

  return (
    <div
      ref={setScrollRef}
      className="sidenav-scroll group/scroll flex min-h-0 flex-1 flex-col overflow-y-auto pb-6 pr-1.5 pt-1"
      style={SCROLL_MASK}
    >
      {groups.length === 0 ? (
        <div className="px-1.5 pt-0.5 text-[11px] text-muted-foreground">
          No upcoming sessions.
        </div>
      ) : (
        <div className="flex flex-col gap-5">
          {groups.map((g) => (
            <section key={g.key}>
              <div className="px-1.5 pb-1.5 text-[13px] text-muted-foreground">
                {g.label}
              </div>
              <div className="flex flex-col gap-1">
                {g.sessions.map((r) => {
                  const accent = r.color || DEFAULT_SESSION_COLOR;
                  const chrome = sessionTileChrome(accent, false);
                  const selected = selectedId === r.id;
                  return (
                    <button
                      key={r.id}
                      type="button"
                      data-side-session-id={r.id}
                      onClick={() => {
                        search?.setSelectedId(r.id);
                        search?.onPickResult(r);
                      }}
                      className={[
                        "flex w-full items-stretch gap-2 rounded-md py-0 pl-1.5 pr-2 text-left text-[12px] outline-none",
                        selected ? "bg-black/[0.05]" : "hover:bg-black/[0.04]",
                      ].join(" ")}
                      title={r.title}
                    >
                      <span
                        aria-hidden
                        className="my-0.5 w-1 shrink-0 self-stretch rounded-full"
                        style={{ backgroundColor: chrome.bar }}
                      />
                      <span className="min-w-0 flex-1 py-1.5">
                        <span className="block truncate font-medium leading-snug text-ink">
                          {r.title}
                        </span>
                        <span className="block truncate leading-snug text-muted-foreground">
                          {formatTimeRange(r.startISO, r.endISO, r.allDay)}
                        </span>
                      </span>
                    </button>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

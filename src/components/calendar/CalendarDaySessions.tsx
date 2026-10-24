/**
 * Sessions for the mini-calendar selection — same tiles as search results.
 * Click focuses that session in the main calendar (via search pick handler).
 *
 * Day/date heading is outside the scroll region so it never moves.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { SessionResultTab } from "./CalendarSearch";
import {
  useCalendarSearchSafe,
  type SearchResult,
} from "./CalendarSearchContext";
import type { DateRange } from "./MiniCalendar";
import type { CalendarEvent } from "./yearStore";

function dayKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function eventDayKey(startISO: string): string {
  // Prefer local calendar date from ISO (handles both Z and local-naive).
  const d = new Date(startISO);
  if (Number.isNaN(d.getTime())) {
    const m = startISO.match(/^(\d{4}-\d{2}-\d{2})/);
    return m?.[1] ?? "";
  }
  return dayKey(d);
}

function toSearchResult(e: CalendarEvent): SearchResult {
  return {
    id: e.id,
    title: e.title || e.diarySub || e.diaryGroup || "Session",
    startISO: e.startISO,
    endISO: e.endISO,
    color: e.color,
    allDay: e.allDay,
    entityId: e.entityId,
    signUpEnabled: e.signUpEnabled,
  };
}

function formatDayHeading(d: Date): string {
  return d.toLocaleDateString(undefined, {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
}

const PANEL_BG = "rgb(245, 245, 247)";

export function CalendarDaySessions({
  currentDate,
  currentRange,
}: {
  currentDate: Date;
  currentRange: DateRange;
}) {
  const search = useCalendarSearchSafe();
  const events = search?.events ?? [];
  const selectedId = search?.selectedId ?? null;
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const hideTimerRef = useRef<number | null>(null);
  const [scrolledFromTop, setScrolledFromTop] = useState(false);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const syncFade = () => {
      setScrolledFromTop(el.scrollTop > 0);
    };
    const onScroll = () => {
      syncFade();
      el.setAttribute("data-scrolling", "1");
      if (hideTimerRef.current) window.clearTimeout(hideTimerRef.current);
      hideTimerRef.current = window.setTimeout(() => {
        el.removeAttribute("data-scrolling");
      }, 800);
    };
    syncFade();
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      el.removeEventListener("scroll", onScroll);
      if (hideTimerRef.current) window.clearTimeout(hideTimerRef.current);
    };
  }, []);

  const daySessions = useMemo(() => {
    const start = currentRange?.start ?? currentDate;
    const end = currentRange?.end ?? currentDate;
    const startK = dayKey(start);
    const endK = dayKey(end);
    const list: SearchResult[] = [];
    for (const e of events) {
      const k = eventDayKey(e.startISO);
      if (!k) continue;
      if (k < startK || k > endK) continue;
      list.push(toSearchResult(e));
    }
    // Chronological within the day / range (like mobile day list).
    list.sort((a, b) => (a.startISO < b.startISO ? -1 : 1));
    return list;
  }, [events, currentDate, currentRange]);

  // Changing the day list can reset scroll; keep fade state in sync.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    setScrolledFromTop(el.scrollTop > 0);
  }, [daySessions]);

  const headingDate = currentRange?.start ?? currentDate;

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden px-1.5">
      {/* Outside scroll — never moves */}
      <div className="shrink-0 px-1.5 pb-1 pt-1 text-[11px] font-medium text-muted-foreground">
        {formatDayHeading(headingDate)}
      </div>

      <div className="relative min-h-0 flex-1">
        {/* Fade under the frozen heading only once sessions scroll up under it */}
        {scrolledFromTop ? (
          <div
            aria-hidden
            className="pointer-events-none absolute inset-x-0 top-0 z-[1] h-3"
            style={{
              background: `linear-gradient(to bottom, ${PANEL_BG}, rgba(245, 245, 247, 0))`,
            }}
          />
        ) : null}
        <div
          ref={scrollRef}
          className="sidenav-scroll group/scroll h-full overflow-y-auto pb-6"
          style={{
            maskImage:
              "linear-gradient(to bottom, black 0, black calc(100% - 28px), transparent 100%)",
            WebkitMaskImage:
              "linear-gradient(to bottom, black 0, black calc(100% - 28px), transparent 100%)",
          }}
        >
          {daySessions.length === 0 ? (
            <div className="px-1.5 pt-0.5 text-[11px] text-muted-foreground">
              No sessions this day.
            </div>
          ) : (
            <div className="flex flex-col gap-1 pt-0.5">
              {daySessions.map((r) => (
                <SessionResultTab
                  key={r.id}
                  result={r}
                  selected={selectedId === r.id}
                  onClick={() => {
                    search?.setSelectedId(r.id);
                    search?.onPickResult(r);
                  }}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

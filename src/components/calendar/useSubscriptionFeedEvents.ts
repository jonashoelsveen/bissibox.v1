import { useEffect, useMemo, useSyncExternalStore } from "react";
import { authHeaders } from "@/lib/calendarSessionPersist";
import { subscriptionToCalendarEvent } from "@/lib/calendarFeed/toCalendarEvent";
import type { SubscriptionEvent } from "@/lib/calendarFeed/types";
import { useLiveMonthFocus } from "@/lib/liveMonthFocus";
import { useLiveWeekSpan } from "@/lib/liveWeekSpan";
import {
  cachedSubscriptionEvents,
  ensureSubscriptionFeed,
  feedWindow,
  getSubscriptionFeedCacheVersion,
  retainSubscriptionFeeds,
  subscribeSubscriptionFeedCache,
} from "@/lib/subscriptionFeedCache";
import type { CalendarEvent } from "./yearStore";
import type { UserCalendar } from "./UserCalendarsContext";

export function useSubscriptionFeedEvents(
  calendars: UserCalendar[],
  anchor: Date,
  viewMode: string,
): CalendarEvent[] {
  const liveMonth = useLiveMonthFocus();
  const liveWeek = useLiveWeekSpan();
  const anchorMs = anchor.getTime();
  // Follow the month or week actually on screen. The committed date lags a scroll.
  const effectiveAnchor = useMemo(() => {
    if (viewMode === "month" && liveMonth) return new Date(liveMonth.year, liveMonth.month, 1);
    if (viewMode === "week" && liveWeek) return liveWeek.start;
    return new Date(anchorMs);
  }, [anchorMs, liveMonth, liveWeek, viewMode]);
  const subscriptions = useMemo(
    () => calendars.filter((calendar) => calendar.source === "subscription"),
    [calendars],
  );
  // Hidden is applied below from this cache. Putting it in the fetch key
  // made the eye wait on a network round trip before sessions moved.
  const idsKey = useMemo(
    () => subscriptions.map((calendar) => calendar.id).sort().join("|"),
    [subscriptions],
  );
  const window = useMemo(
    () => feedWindow(effectiveAnchor, viewMode),
    [effectiveAnchor, viewMode],
  );
  const fromMs = window.from.getTime();
  const toMs = window.to.getTime();
  const cacheVersion = useSyncExternalStore(
    subscribeSubscriptionFeedCache,
    getSubscriptionFeedCacheVersion,
    getSubscriptionFeedCacheVersion,
  );

  useEffect(() => {
    const ids = idsKey ? idsKey.split("|") : [];
    retainSubscriptionFeeds(ids);
    if (ids.length === 0) return;
    let cancelled = false;
    void (async () => {
      const headers = await authHeaders();
      if (cancelled) return;
      const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
      ensureSubscriptionFeed(ids, fromMs, toMs, async (id, gapFrom, gapTo) => {
        const params = new URLSearchParams({
          from: new Date(gapFrom).toISOString(),
          to: new Date(gapTo).toISOString(),
          timeZone,
        });
        try {
          const response = await fetch(`/api/calendar/subscriptions/${id}/events?${params}`, {
            headers,
          });
          if (!response.ok) return null;
          const body = (await response.json()) as { events?: SubscriptionEvent[] };
          return body.events ?? [];
        } catch {
          return null;
        }
      });
    })();
    return () => {
      cancelled = true;
    };
  }, [idsKey, fromMs, toMs]);

  return useMemo(() => {
    void cacheVersion;
    const events: CalendarEvent[] = [];
    for (const calendar of subscriptions) {
      if (calendar.hidden) continue;
      for (const event of cachedSubscriptionEvents(calendar.id)) {
        events.push(subscriptionToCalendarEvent(event, calendar.color));
      }
    }
    return events;
  }, [cacheVersion, subscriptions]);
}

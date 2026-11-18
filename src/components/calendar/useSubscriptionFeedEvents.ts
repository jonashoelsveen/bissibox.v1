import { useEffect, useMemo, useSyncExternalStore } from "react";
import { authHeaders } from "@/lib/calendarSessionPersist";
import { calendarOwnerEmail, isInvitedByOther } from "@/lib/calendarFeed/organizer";
import { subscriptionToCalendarEvent } from "@/lib/calendarFeed/toCalendarEvent";
import type { SubscriptionEvent } from "@/lib/calendarFeed/types";
import { useAuth } from "@/lib/auth";
import { useLiveMonthFocus } from "@/lib/liveMonthFocus";
import { useLiveWeekSpan } from "@/lib/liveWeekSpan";
import {
  bindFeedSnapshotUser,
  cachedFeedCalendars,
  cachedSubscriptionEvents,
  ensureSubscriptionFeed,
  feedWindow,
  getClientSubscriptionFeedCacheVersion,
  getServerSubscriptionFeedCacheVersion,
  rememberSubscriptionCalendars,
  retainSubscriptionFeeds,
  subscribeSubscriptionFeedCache,
  type FeedCalendarSnap,
} from "@/lib/subscriptionFeedCache";
import type { CalendarEvent } from "./yearStore";
import type { UserCalendar } from "./UserCalendarsContext";

function subscriptionSnaps(calendars: UserCalendar[]): FeedCalendarSnap[] {
  return calendars
    .filter((calendar) => calendar.source === "subscription")
    .map((calendar) => ({
      id: calendar.id,
      name: calendar.name,
      color: calendar.color,
      hidden: calendar.hidden,
    }));
}

export function useSubscriptionFeedEvents(
  calendars: UserCalendar[],
  anchor: Date,
  viewMode: string,
  listReady = false,
): CalendarEvent[] {
  const { user } = useAuth();
  const accountEmail = user?.email ?? null;
  const liveMonth = useLiveMonthFocus();
  const liveWeek = useLiveWeekSpan();
  const anchorMs = anchor.getTime();
  // Follow the month or week actually on screen. The committed date lags a scroll.
  const effectiveAnchor = useMemo(() => {
    if (viewMode === "month" && liveMonth) return new Date(liveMonth.year, liveMonth.month, 1);
    if (viewMode === "week" && liveWeek) return liveWeek.start;
    return new Date(anchorMs);
  }, [anchorMs, liveMonth, liveWeek, viewMode]);
  const subscriptions = useMemo(() => subscriptionSnaps(calendars), [calendars]);
  const cacheVersion = useSyncExternalStore(
    subscribeSubscriptionFeedCache,
    getClientSubscriptionFeedCacheVersion,
    getServerSubscriptionFeedCacheVersion,
  );
  // Version 0 is the server render. Saved sessions paint on the client snapshot.
  const savedReady = cacheVersion > 0;
  // Until the signed-in list arrives, paint the last snapshot. An empty
  // list during that wait must not drop the sessions already on screen.
  const sources = listReady ? subscriptions : savedReady ? cachedFeedCalendars() : [];
  // Hidden is applied below from this cache. Putting it in the fetch key
  // made the eye wait on a network round trip before sessions moved.
  const idsKey = useMemo(
    () => sources.map((calendar) => calendar.id).sort().join("|"),
    [sources],
  );
  // Read hidden as a primitive so a memo of subscription rows cannot keep the
  // previous calendar objects after the eye toggles.
  const visibilityKey = useMemo(
    () =>
      sources
        .map((calendar) => `${calendar.id}:${calendar.hidden ? "1" : "0"}:${calendar.color}:${calendar.name}`)
        .sort()
        .join("|"),
    [sources],
  );
  const window = useMemo(
    () => feedWindow(effectiveAnchor, viewMode),
    [effectiveAnchor, viewMode],
  );
  const fromMs = window.from.getTime();
  const toMs = window.to.getTime();

  useEffect(() => {
    if (user?.id) bindFeedSnapshotUser(user.id);
    const ids = idsKey ? idsKey.split("|") : [];
    if (listReady) {
      if (user?.id) rememberSubscriptionCalendars(user.id, subscriptions);
      retainSubscriptionFeeds(ids);
    }
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
  }, [idsKey, fromMs, toMs, listReady, subscriptions, user?.id, visibilityKey]);

  return useMemo(() => {
    void cacheVersion;
    void visibilityKey;
    const events: CalendarEvent[] = [];
    const paintFrom = listReady ? subscriptionSnaps(calendars) : savedReady ? cachedFeedCalendars() : [];
    for (const calendar of paintFrom) {
      if (calendar.hidden) continue;
      const cached = cachedSubscriptionEvents(calendar.id);
      const owner = calendarOwnerEmail(cached, accountEmail, [calendar.name]);
      for (const event of cached) {
        events.push({
          ...subscriptionToCalendarEvent(event, calendar.color),
          organizedByOther: event.invitedMeeting === true || isInvitedByOther(event, owner),
        });
      }
    }
    return events;
  }, [accountEmail, cacheVersion, calendars, listReady, savedReady, visibilityKey]);
}

import type { CalendarEvent } from "@/components/calendar/yearStore";
import { addMinutes, fromISOLocal, makeEventId, setHM, startOfDay, toISOLocal } from "@/components/calendar/dateUtils";

export const SESSION_REPEAT_RULES = [
  "daily",
  "weekly",
  "weekdays",
  "weekends",
  "monthly",
  "yearly",
] as const;

export type SessionRepeatRule = (typeof SESSION_REPEAT_RULES)[number];

export const SESSION_REPEAT_DEFAULT: SessionRepeatRule = "daily";

export const SESSION_REPEAT_LABELS: Record<SessionRepeatRule, string> = {
  daily: "Every day",
  weekly: "Every week",
  weekdays: "Every weekday",
  weekends: "Every day on weekends",
  monthly: "Every month",
  yearly: "Every year",
};

export function isSessionRepeatRule(value: unknown): value is SessionRepeatRule {
  return (
    typeof value === "string" &&
    (SESSION_REPEAT_RULES as readonly string[]).includes(value)
  );
}

export const SESSION_REPEAT_OFF_LABEL = "Don't repeat";

/** Stored on `calendar_sessions.repeat_rule` when this row was split out of a series. */
export const SESSION_REPEAT_DETACHED_VALUE = "off";

/** Periwinkle — matches platform training accent for selected repeat option. */
export const SESSION_REPEAT_CHECK_COLOR = "#B8B8FF";

export function isWeekendSessionDate(date: Date): boolean {
  const day = date.getDay();
  return day === 0 || day === 6;
}

/** Menu options for a session anchored on `sessionDate`. */
export function repeatOptionsForSessionDate(sessionDate: Date): SessionRepeatRule[] {
  const contextual: SessionRepeatRule = isWeekendSessionDate(sessionDate) ? "weekends" : "weekdays";
  return ["daily", "weekly", contextual, "monthly", "yearly"];
}

export function repeatLabel(rule: SessionRepeatRule): string {
  return SESSION_REPEAT_LABELS[rule];
}

export function isRepeatDetachedEvent(
  ev: Pick<CalendarEvent, "repeatDetached"> | null | undefined,
): boolean {
  return !!ev?.repeatDetached;
}

function matchesRepeatRule(date: Date, rule: SessionRepeatRule, anchor: Date): boolean {
  const day = date.getDay();
  switch (rule) {
    case "daily":
      return true;
    case "weekly":
      return day === anchor.getDay();
    case "weekdays":
      return day >= 1 && day <= 5;
    case "weekends":
      return day === 0 || day === 6;
    case "monthly":
      return date.getDate() === anchor.getDate();
    case "yearly":
      return date.getDate() === anchor.getDate() && date.getMonth() === anchor.getMonth();
    default:
      return false;
  }
}

function advanceCursor(cursor: Date, rule: SessionRepeatRule): Date {
  const next = new Date(cursor);
  switch (rule) {
    case "daily":
    case "weekdays":
    case "weekends":
      next.setDate(next.getDate() + 1);
      return next;
    case "weekly":
      next.setDate(next.getDate() + 7);
      return next;
    case "monthly": {
      const day = next.getDate();
      next.setMonth(next.getMonth() + 1, 1);
      const lastDay = new Date(next.getFullYear(), next.getMonth() + 1, 0).getDate();
      next.setDate(Math.min(day, lastDay));
      return next;
    }
    case "yearly":
      next.setFullYear(next.getFullYear() + 1);
      return next;
    default:
      next.setDate(next.getDate() + 1);
      return next;
  }
}

export type RepeatEventTemplate = Pick<
  CalendarEvent,
  | "title"
  | "color"
  | "categoryId"
  | "category"
  | "allDay"
  | "description"
  | "location"
  | "locationUrl"
  | "appGroupId"
  | "signUpEnabled"
  | "repeatRule"
  | "repeatSeriesId"
> & {
  startISO: string;
  endISO: string;
};

export type SessionDeleteScope = "this" | "thisAndFuture" | "allInSeries";

export const SESSION_DELETE_LABELS: Record<SessionDeleteScope, string> = {
  this: "This session",
  thisAndFuture: "This and all future sessions",
  allInSeries: "All sessions in the series",
};

function sessionSeriesFingerprint(
  ev: CalendarEvent,
  opts?: { omitRule?: boolean },
): string {
  const start = fromISOLocal(ev.startISO);
  const end = fromISOLocal(ev.endISO);
  const startMin = ev.allDay ? 0 : start.getHours() * 60 + start.getMinutes();
  const endMin = ev.allDay ? 0 : end.getHours() * 60 + end.getMinutes();
  return [
    (ev.title ?? "").trim().toLowerCase(),
    opts?.omitRule ? "" : ev.repeatRule ?? "",
    ev.categoryId ?? "",
    (ev.color ?? "").toLowerCase(),
    ev.allDay ? "1" : "0",
    String(startMin),
    String(endMin),
    ev.appGroupId ?? "",
  ].join("|");
}

/** All instances belonging to the same repeat series as `target`. */
export function eventsInRepeatSeries(
  allEvents: CalendarEvent[],
  target: CalendarEvent,
): CalendarEvent[] {
  if (isRepeatDetachedEvent(target)) return [target];

  const realEvents = allEvents.filter(
    (e) => !isRepeatPreviewEventId(e.id) && !isRepeatDetachedEvent(e),
  );
  const seen = new Set<string>();
  const out: CalendarEvent[] = [];
  const add = (e: CalendarEvent) => {
    if (seen.has(e.id)) return;
    seen.add(e.id);
    out.push(e);
  };
  add(target);

  if (target.repeatSeriesId) {
    for (const e of realEvents) {
      if (e.repeatSeriesId === target.repeatSeriesId) add(e);
    }
  }

  const fp = sessionSeriesFingerprint(target);
  for (const e of realEvents) {
    if ((e.repeatRule || e.repeatSeriesId) && sessionSeriesFingerprint(e) === fp) {
      add(e);
    }
  }

  if (out.length === 1) {
    const loose = sessionSeriesFingerprint(target, { omitRule: true });
    const matching = realEvents.filter(
      (e) => sessionSeriesFingerprint(e, { omitRule: true }) === loose,
    );
    const hasSeriesMeta = matching.some((e) => !!(e.repeatRule || e.repeatSeriesId));
    // One tagged sibling is enough: later instances often store no
    // repeat_rule / repeat_series_id of their own. Include untagged
    // matches so this/all-series ops cover the whole run.
    if (hasSeriesMeta && matching.length > 1) matching.forEach(add);
  }

  const seriesIds = new Set(
    out.map((e) => e.repeatSeriesId).filter((id): id is string => !!id),
  );
  if (seriesIds.size > 0) {
    for (const e of realEvents) {
      if (e.repeatSeriesId && seriesIds.has(e.repeatSeriesId)) add(e);
    }
  }

  return out;
}

/** Stable series id for an instance — prefer stored ids, then this row's id. */
export function sharedRepeatSeriesId(
  target: CalendarEvent,
  allEvents: CalendarEvent[],
): string {
  if (target.repeatSeriesId) return target.repeatSeriesId;
  const series = eventsInRepeatSeries(allEvents, target);
  for (const e of series) {
    if (e.repeatSeriesId) return e.repeatSeriesId;
  }
  return target.id;
}

export function resolveSessionRepeatState(
  target: CalendarEvent | null | undefined,
  allEvents: CalendarEvent[],
): { enabled: boolean; rule: SessionRepeatRule } {
  if (!target || isRepeatDetachedEvent(target)) {
    return { enabled: false, rule: SESSION_REPEAT_DEFAULT };
  }

  if (target.repeatRule) {
    return { enabled: true, rule: target.repeatRule };
  }

  const series = eventsInRepeatSeries(allEvents, target);
  const siblingRule = series.find((e) => e.repeatRule)?.repeatRule;
  if (siblingRule) {
    return { enabled: true, rule: siblingRule };
  }

  if (target.repeatSeriesId || series.length > 1) {
    return {
      enabled: true,
      rule: inferRepeatRuleFromSeries(series) ?? SESSION_REPEAT_DEFAULT,
    };
  }

  return { enabled: false, rule: SESSION_REPEAT_DEFAULT };
}

function inferRepeatRuleFromSeries(series: CalendarEvent[]): SessionRepeatRule | null {
  if (series.length < 2) return null;

  const dates = [...series]
    .map((e) => startOfDay(fromISOLocal(e.startISO)))
    .sort((a, b) => a.getTime() - b.getTime());
  const anchor = dates[0]!;

  const sameDayOfMonth = dates.every((d) => d.getDate() === anchor.getDate());
  const monthCount = new Set(dates.map((d) => `${d.getFullYear()}-${d.getMonth()}`)).size;
  if (sameDayOfMonth && monthCount > 1) {
    return "monthly";
  }

  const sameMonthDay = dates.every(
    (d) => d.getDate() === anchor.getDate() && d.getMonth() === anchor.getMonth(),
  );
  const yearCount = new Set(dates.map((d) => d.getFullYear())).size;
  if (sameMonthDay && yearCount > 1) {
    return "yearly";
  }

  const allSameWeekday = dates.every((d) => d.getDay() === anchor.getDay());
  if (allSameWeekday) {
    return "weekly";
  }

  const allWeekend = dates.every((d) => {
    const day = d.getDay();
    return day === 0 || day === 6;
  });
  if (allWeekend && dates.every((d) => matchesRepeatRule(d, "weekends", anchor))) {
    return "weekends";
  }

  const allWeekday = dates.every((d) => {
    const day = d.getDay();
    return day >= 1 && day <= 5;
  });
  if (allWeekday && dates.every((d) => matchesRepeatRule(d, "weekdays", anchor))) {
    return "weekdays";
  }

  if (dates.every((d) => matchesRepeatRule(d, "daily", anchor))) {
    return "daily";
  }

  return null;
}

export function shouldMaterializeRepeatOnSave(
  existingEv: CalendarEvent,
  allEvents: CalendarEvent[],
  nextRule: SessionRepeatRule | null,
): boolean {
  if (!nextRule) return false;
  const prior = resolveSessionRepeatState(existingEv, allEvents);
  if (!prior.enabled) return true;
  return nextRule !== prior.rule;
}

export function seriesHasInstanceAt(
  series: CalendarEvent[],
  startISO: string,
): boolean {
  return series.some((e) => e.startISO === startISO);
}

export type RepeatSeriesSavePlan = {
  upserts: CalendarEvent[];
  deleteIds: string[];
};

/**
 * When repeat is enabled or the rule changes on an existing session, plan
 * upserts/deletes so the series is updated in place — never a parallel series.
 */
export function planRepeatSeriesSave(
  existingEv: CalendarEvent,
  allEvents: CalendarEvent[],
  template: RepeatEventTemplate,
  nextRule: SessionRepeatRule,
  _anchorDate: Date,
  repeatSeriesId: string,
  options?: { preserveEventId?: string; skipStartISO?: string | null },
): RepeatSeriesSavePlan | null {
  if (!nextRule) return null;
  const prior = resolveSessionRepeatState(existingEv, allEvents);
  if (prior.enabled && nextRule === prior.rule) return null;

  const series = eventsInRepeatSeries(allEvents, existingEv);
  const seriesAnchorDate = startOfDay(
    fromISOLocal(
      series.reduce((earliest, e) =>
        Date.parse(e.startISO) < Date.parse(earliest.startISO) ? e : earliest,
      ).startISO,
    ),
  );

  const expanded = expandRepeatingEvents(template, nextRule, seriesAnchorDate, {
    repeatSeriesId,
  });
  const expandedStarts = new Set(expanded.map((e) => e.startISO));

  const upserts: CalendarEvent[] = [];
  for (const inst of expanded) {
    if (options?.skipStartISO && inst.startISO === options.skipStartISO) continue;
    const existing = series.find((e) => e.startISO === inst.startISO);
    if (existing) {
      upserts.push({
        ...existing,
        title: template.title,
        color: template.color,
        categoryId: template.categoryId ?? existing.categoryId ?? null,
        category: template.category ?? existing.category,
        allDay: template.allDay,
        description: template.description ?? existing.description,
        location:
          template.location !== undefined ? template.location : existing.location,
        locationUrl:
          template.locationUrl !== undefined
            ? template.locationUrl
            : existing.locationUrl,
        appGroupId: template.appGroupId ?? existing.appGroupId ?? null,
        signUpEnabled:
          template.signUpEnabled !== undefined
            ? !!template.signUpEnabled
            : !!existing.signUpEnabled,
        startISO: inst.startISO,
        endISO: inst.endISO,
        repeatRule: nextRule,
        repeatSeriesId,
      });
    } else {
      upserts.push(inst);
    }
  }

  const deleteIds = series
    .filter(
      (e) =>
        !expandedStarts.has(e.startISO) &&
        e.id !== options?.preserveEventId,
    )
    .map((e) => e.id);

  // First-time repeat on a one-off session: only add future instances.
  if (!prior.enabled) {
    return { upserts, deleteIds: [] };
  }

  return { upserts, deleteIds };
}

export type RepeatLivePreview = {
  events: CalendarEvent[];
  hideEventIds: string[];
};

export function mergeEventsWithRepeatPreview(
  events: CalendarEvent[],
  preview: RepeatLivePreview | null | undefined,
): CalendarEvent[] {
  if (!preview?.events.length) return events;
  const hidden = new Set(preview.hideEventIds);
  return [...events.filter((e) => !hidden.has(e.id)), ...preview.events];
}

/**
 * Live calendar preview while the user edits repeat settings on an existing
 * session — mirrors `planRepeatSeriesSave` so tiles update before Save.
 */
export function buildRepeatSeriesLivePreview(
  existingEv: CalendarEvent,
  allEvents: CalendarEvent[],
  template: RepeatEventTemplate,
  nextRule: SessionRepeatRule,
  repeatSeriesId: string,
  preserveEventId?: string,
): RepeatLivePreview {
  const series = eventsInRepeatSeries(allEvents, existingEv);
  const prior = resolveSessionRepeatState(existingEv, allEvents);

  if (!prior.enabled || series.length <= 1) {
    const anchorDate = startOfDay(fromISOLocal(template.startISO));
    return {
      events: buildRepeatPreviewEvents(template, nextRule, anchorDate, {
        excludeStartISO: template.startISO,
      }),
      hideEventIds: [],
    };
  }

  const seriesAnchorDate = startOfDay(
    fromISOLocal(
      series.reduce((earliest, e) =>
        Date.parse(e.startISO) < Date.parse(earliest.startISO) ? e : earliest,
      ).startISO,
    ),
  );

  const expanded = expandRepeatingEvents(template, nextRule, seriesAnchorDate, {
    repeatSeriesId,
  });

  const previewEvents: CalendarEvent[] = expanded.map((inst) => {
    const existing = series.find((e) => e.startISO === inst.startISO);
    const base = existing ?? inst;
    return {
      ...base,
      title: template.title,
      color: template.color,
      categoryId: template.categoryId ?? base.categoryId ?? null,
      category: template.category ?? base.category,
      allDay: template.allDay,
      description: template.description ?? base.description,
      location:
        template.location !== undefined ? template.location : base.location,
      locationUrl:
        template.locationUrl !== undefined
          ? template.locationUrl
          : base.locationUrl,
      appGroupId: template.appGroupId ?? base.appGroupId ?? null,
      signUpEnabled:
        template.signUpEnabled !== undefined
          ? !!template.signUpEnabled
          : !!base.signUpEnabled,
      startISO: inst.startISO,
      endISO: inst.endISO,
      repeatRule: nextRule,
      repeatSeriesId,
      id: existing?.id ?? `${REPEAT_PREVIEW_ID_PREFIX}${inst.startISO}`,
    };
  });

  if (preserveEventId && !previewEvents.some((e) => e.id === preserveEventId)) {
    const preserved = series.find((e) => e.id === preserveEventId);
    if (preserved) {
      previewEvents.push({
        ...preserved,
        title: template.title,
        color: template.color,
        categoryId: template.categoryId ?? preserved.categoryId ?? null,
        category: template.category ?? preserved.category,
        allDay: template.allDay,
        description: template.description ?? preserved.description,
        location:
          template.location !== undefined
            ? template.location
            : preserved.location,
        locationUrl:
          template.locationUrl !== undefined
            ? template.locationUrl
            : preserved.locationUrl,
        appGroupId: template.appGroupId ?? preserved.appGroupId ?? null,
        signUpEnabled:
          template.signUpEnabled !== undefined
            ? !!template.signUpEnabled
            : !!preserved.signUpEnabled,
        startISO: template.startISO,
        endISO: template.endISO,
        repeatRule: nextRule,
        repeatSeriesId,
      });
    }
  }

  return {
    events: previewEvents,
    hideEventIds: series.map((e) => e.id),
  };
}

export function shouldShowRepeatDeleteMenu(
  target: CalendarEvent | null | undefined,
  allEvents: CalendarEvent[],
  /** Repeat toggle is on in the open session panel. */
  panelRepeatEnabled = false,
): boolean {
  if (!target) return false;
  if (panelRepeatEnabled) return true;
  if (target.repeatRule || target.repeatSeriesId) return true;
  return eventsInRepeatSeries(allEvents, target).length > 1;
}

/**
 * True when this row is already a stored repeat-series member
 * (`repeat_series_id` / `repeat_rule` on calendar_sessions, or fingerprint
 * siblings from older data). Does not treat “Repeat just turned on” as a series.
 */
export function isPersistedRepeatSeries(
  target: CalendarEvent | null | undefined,
  allEvents: CalendarEvent[],
): boolean {
  if (!target || isRepeatPreviewEventId(target.id) || isRepeatDetachedEvent(target)) {
    return false;
  }
  if (target.repeatSeriesId || target.repeatRule) return true;
  return eventsInRepeatSeries(allEvents, target).length > 1;
}

export function eventIdsForDeleteScope(
  scope: SessionDeleteScope,
  allEvents: CalendarEvent[],
  target: CalendarEvent,
): string[] {
  const series = eventsInRepeatSeries(allEvents, target);
  const targetStart = Date.parse(target.startISO);
  switch (scope) {
    case "this":
      return [target.id];
    case "thisAndFuture":
      return series
        .filter((e) => Date.parse(e.startISO) >= targetStart)
        .map((e) => e.id);
    case "allInSeries":
      return series.map((e) => e.id);
    default:
      return [target.id];
  }
}

export function isRepeatingSessionEvent(
  ev: CalendarEvent | null | undefined,
  allEvents: CalendarEvent[] = [],
  panelRepeatEnabled = false,
): boolean {
  return shouldShowRepeatDeleteMenu(ev, allEvents, panelRepeatEnabled);
}

const DEFAULT_HORIZON_DAYS = 365;
const MAX_REPEAT_OCCURRENCES = 60;

/**
 * Materialise recurring instances from an anchor session (create flow).
 * Skips dates that do not match the rule and caps at one year / 60 events.
 */
export function expandRepeatingEvents(
  template: RepeatEventTemplate,
  rule: SessionRepeatRule,
  anchorDate: Date,
  options?: { repeatSeriesId?: string },
): CalendarEvent[] {
  const seriesId = options?.repeatSeriesId ?? template.repeatSeriesId ?? makeEventId();
  const anchorStart = fromISOLocal(template.startISO);
  const anchorEnd = fromISOLocal(template.endISO);
  const durationMin = Math.max(
    15,
    Math.round((anchorEnd.getTime() - anchorStart.getTime()) / 60_000),
  );
  const startMin = anchorStart.getHours() * 60 + anchorStart.getMinutes();
  const endMin = anchorEnd.getHours() * 60 + anchorEnd.getMinutes();
  const useAllDaySpan = template.allDay;

  const horizon = new Date(anchorDate);
  horizon.setDate(horizon.getDate() + DEFAULT_HORIZON_DAYS);

  const out: CalendarEvent[] = [];
  let cursor = startOfDay(anchorDate);
  let guard = 0;

  while (cursor <= horizon && out.length < MAX_REPEAT_OCCURRENCES && guard < 500) {
    guard += 1;
    if (matchesRepeatRule(cursor, rule, anchorDate)) {
      const start = useAllDaySpan
        ? setHM(cursor, 0, 0)
        : setHM(cursor, Math.floor(startMin / 60), startMin % 60);
      const end = useAllDaySpan
        ? setHM(cursor, 23, 59)
        : template.allDay
          ? setHM(cursor, 23, 59)
          : addMinutes(start, endMin > startMin ? endMin - startMin : durationMin);

      out.push({
        id: makeEventId(),
        title: template.title,
        color: template.color,
        categoryId: template.categoryId ?? null,
        category: template.category,
        allDay: template.allDay,
        description: template.description,
        location: template.location,
        locationUrl: template.locationUrl,
        appGroupId: template.appGroupId ?? null,
        signUpEnabled: !!template.signUpEnabled,
        repeatRule: rule,
        repeatSeriesId: seriesId,
        startISO: toISOLocal(start),
        endISO: toISOLocal(end),
      });
    }
    cursor = advanceCursor(cursor, rule);
  }

  return out.length > 0 ? out : [];
}

export const REPEAT_PREVIEW_ID_PREFIX = "__repeat_preview__";

export function isRepeatPreviewEventId(id: string): boolean {
  return id.startsWith(REPEAT_PREVIEW_ID_PREFIX);
}

/** Ephemeral calendar chips shown while repeat is configured (before Save). */
export function buildRepeatPreviewEvents(
  template: RepeatEventTemplate,
  rule: SessionRepeatRule,
  anchorDate: Date,
  options?: { excludeStartISO?: string | null },
): CalendarEvent[] {
  return expandRepeatingEvents(template, rule, anchorDate)
    .filter((inst) => !options?.excludeStartISO || inst.startISO !== options.excludeStartISO)
    .map((inst) => ({
      ...inst,
      id: `${REPEAT_PREVIEW_ID_PREFIX}${inst.startISO}`,
    }));
}

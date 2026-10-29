export type FeedErrorCode =
  | "invalid_url"
  | "forbidden_host"
  | "unreachable"
  | "timeout"
  | "too_large"
  | "not_calendar"
  | "parse_failed"
  | "rate_limited"
  | "forbidden";

const MESSAGES: Record<FeedErrorCode, string> = {
  invalid_url: "The URL address is not valid.",
  forbidden_host: "That address can't be used.",
  unreachable: "The calendar could not be reached.",
  timeout: "The calendar took too long to respond.",
  too_large: "The calendar is too large.",
  not_calendar: "That address is not a calendar.",
  parse_failed: "The calendar could not be read.",
  rate_limited: "Too many attempts. Try again later.",
  forbidden: "Calendar import is not available.",
};

export class FeedError extends Error {
  code: FeedErrorCode;

  constructor(code: FeedErrorCode, message = MESSAGES[code]) {
    super(message);
    this.name = "FeedError";
    this.code = code;
  }
}

export type FeedLocation = {
  label: string;
  url: string;
  provider: "mazemap" | "google";
};

export type FeedRecurrence = {
  isRecurring: true;
  seriesUid: string;
  recurrenceId: string | null;
};

/** One expanded instance. The feed URL is never part of this object. */
export type SubscriptionEvent = {
  id: string;
  calendarId: string;
  source: "subscription";
  readOnly: true;
  title: string;
  allDay: boolean;
  start: string;
  end: string;
  location: FeedLocation | null;
  description: string | null;
  recurrence: FeedRecurrence | null;
};

/** Unexpanded feed. `blocks` are jCal VCALENDAR components. */
export type ParsedFeed = {
  name: string | null;
  color: string | null;
  timeZone: string | null;
  intervalSeconds: number;
  blocks: unknown[];
};

export const DEFAULT_INTERVAL_SECONDS = 60 * 60;
export const MIN_INTERVAL_SECONDS = 15 * 60;
export const MAX_INTERVAL_SECONDS = 12 * 60 * 60;
export const MAX_RANGE_DAYS = 400;
export const MAX_INSTANCES = 2000;
export const MAX_ITERATIONS = 20000;
export const MAX_BODY_BYTES = 10 * 1024 * 1024;
export const FETCH_TIMEOUT_MS = 10_000;

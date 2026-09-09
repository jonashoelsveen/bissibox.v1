/**
 * Calendar search UI — left-panel session search.
 *
 *  - <CalendarSearchToggle/> renders a search icon portal'd to <body>,
 *    pinned just right of the LeftPanel toggle. Always visible.
 *  - <CalendarSearchInput/> renders the expanding input field portal'd to
 *    <body>. Width is fixed (172px) so the input lands the same place
 *    regardless of whether the panel is open. When the panel IS open, it
 *    sits perfectly inside the panel.
 *  - <CalendarSearchResults/> renders the result tabs inside the side nav.
 */

import { useEffect, useLayoutEffect, useMemo, useRef, forwardRef } from "react";
import { createPortal } from "react-dom";
import { Search, X } from "lucide-react";
import { DEFAULT_SESSION_COLOR, sessionTileChrome } from "@/components/library/CategoryActionsMenu";
import { useCalendarSearch, type SearchResult } from "./CalendarSearchContext";
import { fromISOLocal, startEndMinsOnStartDay } from "./dateUtils";
import { groupByDay } from "./sessionDayGroups";

/** Month calendar chips are 22px tall with a 3px corner — 13.6% of height. */
const SESSION_TILE_RADIUS_FROM_HEIGHT = 3 / 22;
/** Month cells use `space-y-0.5` (2px) between 22px chips. */
const SESSION_TILE_GAP_FROM_HEIGHT = 2 / 22;
const SEARCH_BTN_LEFT = 44; // px — sits right next to the PanelLeft (left:12, w:28).
const SEARCH_INPUT_WIDTH = 206; // px — fits inside 256px panel with right margin.

export type CalendarScale = "micro" | "macro";

export function CalendarSearchToggle() {
  const { active, setActive } = useCalendarSearch();
  if (typeof document === "undefined") return null;
  if (active) return null; // The expanded input shows its own search icon in the same spot.
  return createPortal(
    <button
      type="button"
      onClick={() => setActive(true)}
      aria-label="Search sessions"
      title="Search sessions"
      className="fixed top-[6px] z-[200] grid h-7 w-7 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-secondary/60 hover:text-ink"
      style={{ left: SEARCH_BTN_LEFT }}
    >
      <Search className="h-4 w-4" />
    </button>,
    document.body,
  );
}

export function CalendarSearchInput() {
  const { active, query, setQuery, setActive } = useCalendarSearch();
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (active) {
      const id = window.requestAnimationFrame(() => inputRef.current?.focus());
      return () => window.cancelAnimationFrame(id);
    }
    return;
  }, [active]);

  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setActive(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [active, setActive]);

  if (typeof document === "undefined") return null;
  if (!active) return null;

  return createPortal(
    <div
      className="fixed top-[6px] z-[200] flex h-7 items-center rounded-md bg-secondary pr-1 text-ink"
      style={{ left: SEARCH_BTN_LEFT, width: SEARCH_INPUT_WIDTH }}
    >
      <button
        type="button"
        onClick={() => {
          setQuery("");
          setActive(false);
        }}
        aria-label="Close search"
        title="Close search"
        className="grid h-7 w-7 shrink-0 place-items-center rounded-md text-ink"
      >
        <Search className="h-4 w-4" />
      </button>
      <input
        ref={inputRef}
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search sessions"
        className="min-w-0 flex-1 bg-transparent text-[12px] text-ink placeholder:text-muted-foreground/70 focus:outline-none"
      />
      <button
        type="button"
        onClick={() => {
          setQuery("");
          setActive(false);
        }}
        aria-label="Close search"
        className="ml-1 grid h-5 w-5 shrink-0 place-items-center rounded text-muted-foreground hover:bg-white/60 hover:text-ink"
      >
        <X className="h-3 w-3" />
      </button>
    </div>,
    document.body,
  );
}

/* ---------- Results list (rendered inside the side nav) ---------- */

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

function formatDate(startISO: string): string {
  const d = new Date(startISO);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString(undefined, {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
}

const ResultTab = forwardRef<
  HTMLButtonElement,
  {
    result: SearchResult;
    selected: boolean;
    onClick: () => void;
  }
>(function ResultTab({ result, selected, onClick }, ref) {
  const accent = result.color || DEFAULT_SESSION_COLOR;
  const chrome = sessionTileChrome(accent, selected);
  const bg = chrome.fill;
  const fg = chrome.fg;
  return (
    <button
      ref={ref}
      type="button"
      data-side-session-id={result.id}
      onClick={onClick}
      className={[
        "relative flex h-14 w-full overflow-hidden text-left text-[12px]",
        "ring-1 ring-black/5 transition-all hover:-translate-y-px",
        selected
          ? "shadow-[0_2px_6px_rgba(15,23,42,0.10)]"
          : "shadow-[0_1px_2px_0_rgba(0,0,0,0.08),0_-1px_2px_0_rgba(0,0,0,0.08)] hover:shadow-[0_2px_6px_rgba(15,23,42,0.10)]",
      ].join(" ")}
      style={{
        background: bg,
        color: fg,
        borderRadius: `calc(3.5rem * ${SESSION_TILE_RADIUS_FROM_HEIGHT})`,
      }}
      title={result.title}
    >
      <span
        aria-hidden
        className="pointer-events-none absolute left-0 top-0 bottom-0 w-[3px]"
        style={{ background: chrome.bar }}
      />
      <div className="flex min-w-0 flex-1 flex-col justify-center py-0.5 pl-3 pr-2">
        <span className="truncate leading-snug">{result.title}</span>
        <span className="truncate leading-snug opacity-80">
          {formatDate(result.startISO)} · {formatTimeRange(result.startISO, result.endISO, result.allDay)}
        </span>
      </div>
    </button>
  );
});

/** Shared session tile used by search results and the mini-cal day list. */
export { ResultTab as SessionResultTab };

export function CalendarSearchResults() {
  const { query, results, selectedId, setSelectedId, onPickResult, anchorResult } =
    useCalendarSearch();
  const trimmed = query.trim();
  const anchorRef = useRef<HTMLButtonElement | null>(null);
  const spacerRef = useRef<HTMLDivElement | null>(null);

  const resultIdsKey = results.map((r) => r.id).join("\0");
  const groups = useMemo(() => groupByDay(results), [results]);

  useLayoutEffect(() => {
    if (!trimmed || !anchorResult) return;
    const tile = anchorRef.current;
    if (!tile) return;
    const scroller = tile.closest(".sidenav-scroll") as HTMLElement | null;
    if (!scroller) return;
    const header = tile
      .closest("section")
      ?.querySelector<HTMLElement>("[data-search-day-header]");
    const pin = header ?? tile;
    const spacer = spacerRef.current;
    if (spacer) {
      // Keep enough room below the upcoming day so past matches can sit
      // above it, off-screen, even when few future results remain.
      const needsRoomAbove = results[0]?.id !== anchorResult.id;
      spacer.style.height = needsRoomAbove
        ? `${Math.max(0, scroller.clientHeight - pin.offsetHeight)}px`
        : "0px";
    }
    const delta =
      pin.getBoundingClientRect().top - scroller.getBoundingClientRect().top;
    scroller.scrollTop += delta;
    // results[0] is covered by resultIdsKey; omit the array to avoid
    // re-anchoring on every event-object republish.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trimmed, anchorResult?.id, resultIdsKey]);

  if (!trimmed) {
    return (
      <div className="px-3 pt-2 text-[11px] text-muted-foreground">
        Start typing to search your sessions…
      </div>
    );
  }

  if (results.length === 0) {
    return (
      <div className="px-3 pt-2 text-[11px] text-muted-foreground">
        No sessions match "{trimmed}".
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      {groups.map((g) => (
        <section key={g.key}>
          <div
            data-search-day-header=""
            className="mac-panel sticky top-0 z-[1] px-1.5 pb-1.5 pt-1 text-[12px] text-muted-foreground"
          >
            {g.label}
          </div>
          <div
            className="flex flex-col px-1.5"
            style={{ gap: `calc(3.5rem * ${SESSION_TILE_GAP_FROM_HEIGHT})` }}
          >
            {g.sessions.map((r) => (
              <ResultTab
                key={r.id}
                ref={r.id === anchorResult?.id ? anchorRef : undefined}
                result={r}
                selected={selectedId === r.id}
                onClick={() => {
                  setSelectedId(r.id);
                  onPickResult(r);
                }}
              />
            ))}
          </div>
        </section>
      ))}
      <div ref={spacerRef} aria-hidden className="shrink-0" />
    </div>
  );
}



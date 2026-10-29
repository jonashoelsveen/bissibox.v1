import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { Search, X } from "lucide-react";
import { useEventSearch } from "./EventSearchContext";

const SEARCH_BTN_LEFT = 44;
const SEARCH_INPUT_WIDTH = 206;

export function EventSearchToggle() {
  const { active, setActive } = useEventSearch();
  if (typeof document === "undefined") return null;
  if (active) return null;
  return createPortal(
    <button
      type="button"
      onClick={() => setActive(true)}
      aria-label="Search events"
      title="Search events"
      className="fixed top-[6px] z-[200] grid h-7 w-7 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-secondary/60 hover:text-ink"
      style={{ left: SEARCH_BTN_LEFT }}
    >
      <Search className="h-4 w-4" />
    </button>,
    document.body,
  );
}

export function EventSearchInput() {
  const { active, query, setQuery, setActive } = useEventSearch();
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
      data-left-panel-search=""
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
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search events"
        className="min-w-0 flex-1 bg-transparent text-sm text-ink outline-none placeholder:text-muted-foreground"
      />
      {query ? (
        <button
          type="button"
          onClick={() => setQuery("")}
          aria-label="Clear search"
          className="grid h-7 w-7 shrink-0 place-items-center rounded-md text-muted-foreground hover:text-ink"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      ) : null}
    </div>,
    document.body,
  );
}

export function EventSearchResults() {
  const { query } = useEventSearch();
  if (!query.trim()) {
    return (
      <p className="px-2 py-3 text-xs text-muted-foreground">Type to search events.</p>
    );
  }
  return (
    <p className="px-2 py-3 text-xs text-muted-foreground">Search coming soon.</p>
  );
}

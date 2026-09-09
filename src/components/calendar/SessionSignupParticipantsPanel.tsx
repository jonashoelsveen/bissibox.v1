import { useEffect, useMemo, useRef, useState } from "react";
import { Search, Users, X } from "lucide-react";
import type { EntityMember } from "@/hooks/useEntityRoster";
import { filterAcceptedMembers, rosterDisplayLabel } from "@/lib/memberSearch";
import {
  SESSION_PANEL_SHELL_CLASS,
  SESSION_PANEL_SHELL_STYLE,
} from "./sessionPanelDockUtils";

const SIGNUP_PURPLE = "#AF52DE";

/** Purple participants count chip — shown beside the session panel dock icon. */
export function SessionSignupCountBadge({
  count,
  active,
  onClick,
}: {
  count: number;
  active?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-label={`${count} participants`}
      aria-pressed={!!active}
      title="Participants"
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      onMouseDown={(e) => e.stopPropagation()}
      className="inline-flex h-7 shrink-0 items-center gap-1 rounded-md px-1.5 text-white transition-opacity hover:opacity-90"
      style={{
        backgroundColor: SIGNUP_PURPLE,
        boxShadow: active ? "inset 0 0 0 1.5px rgba(255,255,255,0.35)" : undefined,
      }}
    >
      <Users className="h-3.5 w-3.5" strokeWidth={2.25} aria-hidden />
      <span className="min-w-[0.75rem] text-[11px] font-semibold tabular-nums leading-none">
        {count}
      </span>
    </button>
  );
}

/**
 * Side panel matching the session menu shell — search signed-up participants.
 * Search chrome mirrors CalendarSearchInput (secondary bar + Search/X).
 */
export function SessionSignupParticipantsPanel({
  members,
  onClose,
}: {
  members: EntityMember[];
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    const id = window.requestAnimationFrame(() => inputRef.current?.focus());
    return () => window.cancelAnimationFrame(id);
  }, []);

  const filtered = useMemo(
    () => filterAcceptedMembers(members, query),
    [members, query],
  );

  const visible = query.trim() ? filtered : members;

  return (
    <div
      className={`flex h-full min-h-0 flex-col ${SESSION_PANEL_SHELL_CLASS}`}
      style={SESSION_PANEL_SHELL_STYLE}
    >
      <div className="flex items-center justify-end px-3 pt-2">
        <button
          type="button"
          aria-label="Close participants"
          onClick={(e) => {
            e.stopPropagation();
            onClose();
          }}
          onMouseDown={(e) => e.stopPropagation()}
          className="grid h-7 w-7 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-secondary hover:text-ink"
        >
          <X className="h-4 w-4" strokeWidth={2.25} />
        </button>
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-3 px-3 pb-3 pt-1">
        <div className="flex h-7 shrink-0 items-center rounded-md bg-secondary pr-1 text-ink">
          <span className="grid h-7 w-7 shrink-0 place-items-center text-ink" aria-hidden>
            <Search className="h-4 w-4" />
          </span>
          <input
            ref={inputRef}
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search participants"
            className="min-w-0 flex-1 bg-transparent text-[12px] text-ink placeholder:text-muted-foreground/70 focus:outline-none"
          />
          {query ? (
            <button
              type="button"
              onClick={() => setQuery("")}
              aria-label="Clear search"
              className="ml-1 grid h-5 w-5 shrink-0 place-items-center rounded text-muted-foreground hover:bg-white/60 hover:text-ink"
            >
              <X className="h-3 w-3" />
            </button>
          ) : null}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto [scrollbar-width:thin]">
          {visible.length === 0 ? (
            <p className="px-1 py-4 text-center text-[12px] text-muted-foreground">
              {members.length === 0
                ? "No participants signed up yet."
                : "No participants match your search."}
            </p>
          ) : (
            <ul className="flex flex-col">
              {visible.map((row, index) => (
                <li
                  key={row.id}
                  className={[
                    "rounded-md px-2.5 py-2 text-[12px] font-medium text-ink",
                    index % 2 === 1 ? "bg-muted/40" : "",
                  ].join(" ")}
                >
                  <span className="block truncate">{rosterDisplayLabel(row)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

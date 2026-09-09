import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import type { EntityMember } from "@/hooks/useEntityRoster";
import { filterAcceptedMembers, rosterDisplayLabel } from "@/lib/memberSearch";

const POPOVER_PANEL_FIELD = "rounded-[10px] bg-muted/70";

/**
 * Read-only participant roster for entity sessions — mirrors mobile Participants tab.
 * Session-specific signup will attach here later; list source is shared entity roster.
 */
export function SessionParticipantsPanel({
  members,
  loading = false,
}: {
  members: EntityMember[];
  loading?: boolean;
}) {
  const [query, setQuery] = useState("");
  const [searchActive, setSearchActive] = useState(false);

  const acceptedMembers = useMemo(
    () => members.filter((m) => m.status === "active"),
    [members],
  );

  const filtered = useMemo(
    () => filterAcceptedMembers(members, query),
    [members, query],
  );

  const showRows = !searchActive || query.trim().length > 0;
  const visible = searchActive && query.trim() ? filtered : acceptedMembers;

  return (
    <div className="flex h-full min-h-0 flex-col gap-2">
      <div
        className={[
          "flex h-8 shrink-0 items-center gap-2 px-3",
          POPOVER_PANEL_FIELD,
        ].join(" ")}
      >
        <Search className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => setSearchActive(true)}
          onBlur={() => {
            if (!query.trim()) setSearchActive(false);
          }}
          placeholder="Search participants"
          className="min-w-0 flex-1 bg-transparent text-[12px] text-ink outline-none placeholder:text-muted-foreground/60"
        />
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto rounded-[10px] border border-hairline/80">
        {loading ? (
          <p className="px-3 py-4 text-center text-[12px] text-muted-foreground">
            Loading participants…
          </p>
        ) : !showRows ? null : visible.length === 0 ? (
          <p className="px-3 py-4 text-center text-[12px] text-muted-foreground">
            {acceptedMembers.length === 0
              ? "No participants yet."
              : "No participants match your search."}
          </p>
        ) : (
          <ul>
            {visible.map((row, index) => (
              <li
                key={row.id}
                className={[
                  "border-b border-hairline/80 px-4 py-3 text-[13px] font-medium text-ink last:border-b-0",
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
  );
}

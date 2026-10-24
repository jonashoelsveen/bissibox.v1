import { useMemo, useState } from "react";
import { Search, Users, X } from "lucide-react";
import type { EntityMember } from "@/hooks/useEntityRoster";
import { rosterDisplayLabel } from "@/lib/memberSearch";
import {
  compareSignupRosterLabels,
  sessionAudienceMembers,
  signupTabForRosterMember,
  type SignupResponse,
  type SignupRosterTab,
} from "@/lib/sessionSignupAudience";
import {
  SESSION_PANEL_SHELL_CLASS,
  SESSION_PANEL_SHELL_STYLE,
} from "./sessionPanelDockUtils";

const SIGNUP_PURPLE = "#AF52DE";

const TABS: { id: SignupRosterTab; label: string }[] = [
  { id: "accepted", label: "Accepted" },
  { id: "declined", label: "Cancelled" },
  { id: "pending", label: "Pending" },
];

const STATUS_STYLE: Record<SignupRosterTab, { label: string; className: string }> = {
  accepted: { label: "Accepted", className: "text-[#34C759]" },
  declined: { label: "Cancelled", className: "text-[#FF3B30]" },
  pending: { label: "Pending", className: "text-muted-foreground" },
};

/** Same bar as the search field, with the sliding selected tab. */
function ParticipantResponseIsland({
  value,
  onChange,
}: {
  value: SignupRosterTab;
  onChange: (next: SignupRosterTab) => void;
}) {
  const count = TABS.length;
  const index = Math.max(
    0,
    TABS.findIndex((option) => option.id === value),
  );

  return (
    <div
      role="tablist"
      aria-label="Participant responses"
      className="relative grid h-7 w-full shrink-0 rounded-md bg-secondary p-0.5"
      style={{ gridTemplateColumns: `repeat(${count}, minmax(0, 1fr))` }}
    >
      <span
        aria-hidden
        className="pointer-events-none absolute bottom-0.5 top-0.5 rounded-[8px] bg-white"
        style={{
          width: `calc((100% - 4px) / ${count})`,
          left: 2,
          transform: `translateX(${index * 100}%)`,
          transition: "transform 180ms ease",
          boxShadow: "0 1px 2px rgba(0, 0, 0, 0.08)",
        }}
      />
      {TABS.map((option) => {
        const selected = option.id === value;
        return (
          <button
            key={option.id}
            type="button"
            role="tab"
            aria-selected={selected}
            onClick={() => onChange(option.id)}
            className="relative z-10 cursor-default text-[12px] text-ink"
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

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
      aria-label={`${count} accepted`}
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
 * Side panel for a team session with sign-up on.
 * Each row shows the name, then Accepted, Cancelled, or Pending. Focusing search
 * hides the tab island and lists everyone in that status order.
 */
export function SessionSignupParticipantsPanel({
  members,
  loading = false,
  responsesByMember,
  responsesByUser,
  appGroupId,
  onClose,
}: {
  members: EntityMember[];
  loading?: boolean;
  responsesByMember: Readonly<Record<string, SignupResponse>>;
  responsesByUser: Readonly<Record<string, SignupResponse>>;
  appGroupId: string | null;
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const [searchFocused, setSearchFocused] = useState(false);
  const [tab, setTab] = useState<SignupRosterTab>("accepted");
  const searching = searchFocused || query.trim().length > 0;

  const audience = useMemo(
    () => sessionAudienceMembers(members, appGroupId),
    [members, appGroupId],
  );

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    const matched = audience.filter((member) => {
      if (!q) return true;
      const label = rosterDisplayLabel(member).toLowerCase();
      return label.includes(q) || member.email.toLowerCase().includes(q);
    });
    if (!searching) {
      return matched.filter(
        (member) =>
          signupTabForRosterMember(member, responsesByMember, responsesByUser) === tab,
      );
    }
    return [...matched].sort((a, b) =>
      compareSignupRosterLabels(
        {
          tab: signupTabForRosterMember(a, responsesByMember, responsesByUser),
          label: rosterDisplayLabel(a),
        },
        {
          tab: signupTabForRosterMember(b, responsesByMember, responsesByUser),
          label: rosterDisplayLabel(b),
        },
      ),
    );
  }, [audience, responsesByMember, responsesByUser, searching, tab, query]);

  const empty =
    loading && audience.length === 0
      ? "Loading members…"
      : audience.length === 0
      ? "No members are invited to this session."
      : searching
        ? "No members match your search."
        : tab === "accepted"
          ? "No members have accepted."
          : tab === "declined"
            ? "No members have cancelled."
            : "No members are pending.";

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
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onFocus={() => setSearchFocused(true)}
            onBlur={() => {
              if (!query.trim()) setSearchFocused(false);
            }}
            placeholder="Search participants"
            className="min-w-0 flex-1 bg-transparent text-[12px] text-ink placeholder:text-muted-foreground/70 focus:outline-none"
          />
          {query ? (
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => setQuery("")}
              aria-label="Clear search"
              className="ml-1 grid h-5 w-5 shrink-0 place-items-center rounded text-muted-foreground hover:bg-white/60 hover:text-ink"
            >
              <X className="h-3 w-3" />
            </button>
          ) : null}
        </div>

        {searching ? null : (
          <ParticipantResponseIsland value={tab} onChange={setTab} />
        )}

        <div className="min-h-0 flex-1 overflow-y-auto [scrollbar-width:thin]">
          {visible.length === 0 ? (
            <p className="px-1 py-4 text-center text-[12px] text-muted-foreground">{empty}</p>
          ) : (
            <ul
              className="flex flex-col"
              onMouseDown={(e) => {
                if (searching) e.preventDefault();
              }}
            >
              {visible.map((row, index) => {
                const status =
                  STATUS_STYLE[
                    signupTabForRosterMember(row, responsesByMember, responsesByUser)
                  ];
                const name = rosterDisplayLabel(row);
                return (
                  <li
                    key={row.id}
                    className={[
                      "flex h-[22px] cursor-default items-center gap-2 rounded-md px-3 text-[12px]",
                      index % 2 === 1 ? "bg-[#F5F5F7]" : "bg-white",
                      "hover:bg-[#EAEAEC]",
                    ].join(" ")}
                  >
                    <span className="min-w-0 flex-1 cursor-default truncate text-ink" title={name}>
                      {name}
                    </span>
                    <span className={`shrink-0 text-right font-medium ${status.className}`}>
                      {status.label}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

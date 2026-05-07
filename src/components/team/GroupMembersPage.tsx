import { useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Search, UsersRound } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { useIsGroupLeader } from "@/hooks/useIsGroupLeader";

export function GroupMembersPage() {
  const { user, mode, activeEntityId, loading: authLoading } = useAuth();
  const isGroupLeader = useIsGroupLeader();
  const navigate = useNavigate();
  const [query, setQuery] = useState("");

  const isTeamMode = mode === "team" || mode === "organizer" || !!activeEntityId;

  useEffect(() => {
    if (!authLoading && !user) navigate({ to: "/auth" });
  }, [authLoading, user, navigate]);

  if (!user) return null;
  if (!isTeamMode || !isGroupLeader) {
    return (
      <div className="px-6 py-16 text-center text-sm text-muted-foreground">
        Group Members are available to group leaders only.
      </div>
    );
  }

  return (
    <div className="px-4 md:px-6">
      {/* Top tab bar — single fixed "Group members" tab (member tabs land in next iteration) */}
      <div className="sticky top-14 z-20 -mx-4 flex items-end gap-0 border-b border-hairline bg-background pl-4 pr-4 md:-mx-6 md:pl-6 md:pr-6">
        <button
          className="-mb-px inline-flex shrink-0 select-none items-center gap-1.5 border-b-2 border-primary py-2.5 pl-0 pr-4 text-sm font-medium text-ink"
          style={{ width: 220, justifyContent: "flex-start" }}
          title="Group members"
        >
          <UsersRound className="h-3.5 w-3.5 opacity-70" strokeWidth={2.25} />
          <span>Group members</span>
        </button>
      </div>

      <div className="grid gap-6 pt-4 md:grid-cols-[220px_1fr]">
        <aside className="md:sticky md:top-28 md:self-start">
          <div className="flex flex-col gap-3">
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search members"
                className="h-9 w-full rounded-md border border-hairline bg-transparent pl-8 pr-3 text-sm outline-none placeholder:text-muted-foreground focus:border-ink/30"
              />
            </div>
            <div className="px-3 py-2 text-xs text-muted-foreground">
              No members yet.
            </div>
          </div>
        </aside>
        <div className="min-w-0 px-2 py-12 text-sm text-muted-foreground">
          Select a member to view their data.
        </div>
      </div>
    </div>
  );
}

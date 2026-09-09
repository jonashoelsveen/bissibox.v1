import { useEffect, useMemo, useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { DEFAULT_GROUP_NAME } from "@/hooks/useEntityRoster";
import { subscribeEntityRosterSync } from "@/lib/entityRosterSync";
import {
  ENTITY_GROUP_ALL_ID,
  useEntityGroupVisibilitySafe,
} from "./EntityGroupVisibilityContext";

type GroupTab = { id: string; name: string };

/**
 * Entity-mode left rail: one row per roster group (plus All).
 * Eye toggles that group's sessions in the main calendar. No colour menu.
 */
export function EntityGroupTabs({ teamId }: { teamId: string | null }) {
  const visibility = useEntityGroupVisibilitySafe();
  const [groups, setGroups] = useState<GroupTab[]>([]);

  useEffect(() => {
    if (!teamId) {
      setGroups([]);
      return;
    }
    let cancelled = false;
    const load = async () => {
      const { data, error } = await supabase
        .from("app_team_groups")
        .select("id, name, sort_order")
        .eq("team_id", teamId)
        .is("deleted_at", null)
        .order("sort_order");
      if (cancelled) return;
      if (error) {
        setGroups([]);
        return;
      }
      const next: GroupTab[] = [];
      for (const row of data ?? []) {
        const id = typeof row.id === "string" ? row.id : "";
        if (!id) continue;
        const name =
          typeof row.name === "string" && row.name.trim()
            ? row.name.trim()
            : DEFAULT_GROUP_NAME;
        next.push({ id, name });
      }
      setGroups(next);
    };
    void load();
    const unsub = subscribeEntityRosterSync(supabase, teamId, () => {
      void load();
    });
    return () => {
      cancelled = true;
      unsub();
    };
  }, [teamId]);

  const tabs = useMemo<GroupTab[]>(
    () => [{ id: ENTITY_GROUP_ALL_ID, name: "All" }, ...groups],
    [groups],
  );

  if (!teamId || !visibility) {
    return <div className="min-h-0 flex-1" aria-hidden="true" />;
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden px-1.5">
      <div
        className="sidenav-scroll group/scroll flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto pb-6 pt-1"
        style={{
          maskImage:
            "linear-gradient(to bottom, black 0, black calc(100% - 28px), transparent 100%)",
          WebkitMaskImage:
            "linear-gradient(to bottom, black 0, black calc(100% - 28px), transparent 100%)",
        }}
      >
        {tabs.map((tab) => {
          const hidden = visibility.isHidden(tab.id);
          return (
            <div
              key={tab.id}
              className={`group flex cursor-default items-center gap-2 rounded-md px-2 py-1 text-xs transition-colors hover:bg-secondary/60 ${
                hidden ? "text-muted-foreground" : "text-ink"
              }`}
            >
              <span className="min-w-0 flex-1 cursor-default truncate select-none">{tab.name}</span>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  visibility.toggleHidden(tab.id);
                }}
                onPointerDown={(e) => e.stopPropagation()}
                aria-label={hidden ? `Show ${tab.name} sessions` : `Hide ${tab.name} sessions`}
                className="grid h-5 w-5 shrink-0 place-items-center rounded hover:bg-secondary"
              >
                {hidden ? (
                  <EyeOff className="h-3 w-3 text-muted-foreground/70" />
                ) : (
                  <Eye className="h-3 w-3 text-muted-foreground/50 opacity-0 group-hover:opacity-100" />
                )}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

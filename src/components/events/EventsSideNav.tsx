import { Link } from "@tanstack/react-router";
import { Plus } from "lucide-react";
import { useEventSearch } from "./EventSearchContext";
import { EventSearchResults } from "./EventSearch";
import type { EventDraft } from "./event-ui-types";

function sideRowClass(active = false) {
  return (
    "flex h-8 w-full items-center gap-2 rounded-md px-2 text-left text-sm transition-colors " +
    (active ? "bg-secondary font-medium text-ink" : "text-ink hover:bg-secondary/70")
  );
}

export function EventsHomeSideNav({
  drafts,
  onNewEvent,
}: {
  drafts: EventDraft[];
  onNewEvent: () => void;
}) {
  const { active: searchActive } = useEventSearch();

  if (searchActive) {
    return (
      <div className="h-full overflow-y-auto sidenav-scroll">
        <EventSearchResults />
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col overflow-y-auto sidenav-scroll">
      <nav className="flex flex-col gap-0.5 px-1">
        <button type="button" onClick={onNewEvent} className={sideRowClass()}>
          <Plus className="h-3.5 w-3.5 shrink-0" strokeWidth={2} />
          <span className="min-w-0 flex-1 truncate">New event</span>
        </button>

        {drafts.length === 0 ? (
          <p className="px-2 py-3 text-xs text-muted-foreground">No events yet.</p>
        ) : (
          drafts.map((draft) => (
            <Link
              key={draft.id}
              to="/events/$eventId"
              params={{ eventId: draft.id }}
              className={sideRowClass()}
            >
              <span className="min-w-0 flex-1 truncate">{draft.name}</span>
            </Link>
          ))
        )}
      </nav>
    </div>
  );
}

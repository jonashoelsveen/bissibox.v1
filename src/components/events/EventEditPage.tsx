import { useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useAuth } from "@/lib/auth";
import { useLibrarySetting } from "@/lib/library-settings";
import { LeftPanel } from "@/components/LeftPanel";
import { Route } from "@/routes/events.$eventId";
import { EventAboutSection } from "./EventAboutSection";
import { EventEditSideNav } from "./EventEditSideNav";
import { EventEditTopChrome } from "./EventEditTopChrome";
import { EventParticipantsSection } from "./EventParticipantsSection";
import { EventSubeventsSection } from "./EventSubeventsSection";
import { EventTicketsSection } from "./EventTicketsSection";
import { useEventDrafts } from "./useEventDrafts";
import { type EventDraft, type EventSection } from "./event-ui-types";

export function EventEditPage() {
  const { eventId } = Route.useParams();
  const { user, activeEntityId } = useAuth();
  const navigate = useNavigate();
  const { drafts, updateDraft, loading, ensureDraft } = useEventDrafts();
  const cached = drafts.find((d) => d.id === eventId) ?? null;
  const [fetched, setFetched] = useState<EventDraft | null>(null);
  const [fetching, setFetching] = useState(false);
  const draft = cached ?? (fetched?.id === eventId ? fetched : null);

  const scopeKey = `${user?.id ?? "anon"}:${activeEntityId ?? "individual"}`;
  const [panelOpen, setPanelOpen] = useLibrarySetting<boolean>(
    `events:panel:open:${scopeKey}`,
    true,
  );
  const [activeSection, setActiveSection] = useState<EventSection>("about");

  useEffect(() => {
    if (!user) {
      void navigate({ to: "/", search: { signin: "calendar" } });
    }
  }, [user, navigate]);

  useEffect(() => {
    setFetched(null);
    setActiveSection("about");
  }, [eventId]);

  useEffect(() => {
    if (cached || !eventId || !user) return;
    let cancelled = false;
    setFetching(true);
    void ensureDraft(eventId)
      .then((d) => {
        if (!cancelled) setFetched(d);
      })
      .finally(() => {
        if (!cancelled) setFetching(false);
      });
    return () => {
      cancelled = true;
    };
  }, [cached, eventId, user, ensureDraft]);

  if ((loading || fetching) && !draft) {
    return (
      <div className="flex h-full items-center justify-center bg-white">
        <p className="text-sm text-muted-foreground">Loading event…</p>
      </div>
    );
  }

  if (!draft) {
    return (
      <div className="flex h-full items-center justify-center bg-white">
        <div className="text-center">
          <p className="text-sm text-muted-foreground">Event not found.</p>
          <button
            type="button"
            onClick={() => void navigate({ to: "/events" })}
            className="mt-3 text-sm font-medium text-primary hover:underline"
          >
            Back to Events
          </button>
        </div>
      </div>
    );
  }

  const subeventsOpen = activeSection === "subevents";
  const participantsOpen = activeSection === "participants";
  const flushMain = subeventsOpen || participantsOpen;

  return (
    <div className="relative h-full overflow-hidden bg-white">
      <EventEditTopChrome
        title={draft.name}
        onBack={() => void navigate({ to: "/events" })}
      />

      <LeftPanel open={panelOpen} onOpenChange={setPanelOpen}>
        <div className="h-full overflow-hidden pt-[48px]">
          <EventEditSideNav
            activeSection={activeSection}
            onSectionChange={setActiveSection}
          />
        </div>
      </LeftPanel>

      <div
        className={
          flushMain
            ? "flex h-full min-h-0 flex-col overflow-hidden bg-white"
            : "flex h-full min-h-0 flex-col overflow-hidden bg-white pt-[48px]"
        }
      >
        {activeSection === "about" && (
          <div className="min-h-0 flex-1 overflow-y-auto">
            <EventAboutSection
              draft={draft}
              onChange={(patch) => updateDraft(draft.id, patch)}
            />
          </div>
        )}
        {activeSection === "subevents" && (
          <div className="min-h-0 flex-1 overflow-hidden bg-white pt-[48px]">
            <EventSubeventsSection
              draft={draft}
              onChange={(patch) => updateDraft(draft.id, patch)}
            />
          </div>
        )}
        {activeSection === "tickets" && (
          <div className="min-h-0 flex-1 overflow-y-auto">
            <EventTicketsSection
              draft={draft}
              onChange={(patch) => updateDraft(draft.id, patch)}
            />
          </div>
        )}
        {activeSection === "participants" && (
          <div className="min-h-0 flex-1 overflow-hidden bg-white pt-[48px]">
            <EventParticipantsSection
              draft={draft}
              onChange={(patch) => updateDraft(draft.id, patch)}
            />
          </div>
        )}
      </div>
    </div>
  );
}

import { useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { useAuth } from "@/lib/auth";
import { useLibrarySetting } from "@/lib/library-settings";
import { LeftPanel } from "@/components/LeftPanel";
import { EventSearchProvider } from "./EventSearchContext";
import { EventSearchToggle, EventSearchInput } from "./EventSearch";
import { EventsHomeSideNav } from "./EventsSideNav";
import { NewEventModal } from "./NewEventModal";
import { useEventDrafts } from "./useEventDrafts";

export function EventsPage() {
  return (
    <EventSearchProvider>
      <EventsPageInner />
    </EventSearchProvider>
  );
}

function EventsPageInner() {
  const { user, activeEntityId } = useAuth();
  const navigate = useNavigate();
  const scopeKey = `${user?.id ?? "anon"}:${activeEntityId ?? "individual"}`;
  const [panelOpen, setPanelOpen] = useLibrarySetting<boolean>(
    `events:panel:open:${scopeKey}`,
    true,
  );
  const [modalOpen, setModalOpen] = useState(false);
  const { drafts, createDraft, loading } = useEventDrafts();

  useEffect(() => {
    if (!user) {
      void navigate({ to: "/", search: { signin: "calendar" } });
    }
  }, [user, navigate]);

  const handleSave = async (
    name: string,
    coOrganizers: Parameters<typeof createDraft>[1],
  ) => {
    try {
      const draft = await createDraft(name, coOrganizers);
      setModalOpen(false);
      void navigate({ to: "/events/$eventId", params: { eventId: draft.id } });
    } catch (e) {
      console.error("[events] create failed", e);
      const msg =
        e instanceof Error
          ? e.message
          : e &&
              typeof e === "object" &&
              "message" in e &&
              typeof (e as { message: unknown }).message === "string"
            ? (e as { message: string }).message
            : "Could not create event";
      toast.error(msg);
    }
  };

  return (
    <div className="relative h-full overflow-hidden bg-white">
      <EventSearchToggle />
      <EventSearchInput />

      <LeftPanel open={panelOpen} onOpenChange={setPanelOpen}>
        <div className="h-full overflow-hidden pl-1.5 pr-0 pt-[48px]">
          <EventsHomeSideNav drafts={drafts} onNewEvent={() => setModalOpen(true)} />
        </div>
      </LeftPanel>

      <div className="flex h-full min-h-0 flex-col">
        <div className="flex flex-1 flex-col items-center justify-center px-8">
          <div className="max-w-md text-center">
            <h1 className="text-xl font-semibold text-ink">Events</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              {loading
                ? "Loading events…"
                : drafts.length === 0
                  ? "Create your first event using New event in the left panel."
                  : "Select an event in the left panel, or create a new one."}
            </p>
          </div>
        </div>
      </div>

      <NewEventModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onSave={handleSave}
      />
    </div>
  );
}

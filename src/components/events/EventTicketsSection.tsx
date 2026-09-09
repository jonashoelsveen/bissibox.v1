import { useState } from "react";
import { MoreHorizontal } from "lucide-react";
import {
  CategoryActionsMenu,
  STANDARD_COLORS_8,
} from "@/components/library/CategoryActionsMenu";
import {
  DEFAULT_TICKET_COLOR,
  type EventDraft,
} from "./event-ui-types";
import { useTicketControl } from "./TicketControlVisual";
import {
  EventTicketFlipCard,
  EVENT_TICKET_REF_WIDTH,
} from "./EventTicketFlipCard";
import {
  Iphone17ProFrame,
  IPHONE_17_PRO_SCREEN_WIDTH,
} from "./Iphone17ProFrame";

type Props = {
  draft: EventDraft;
  onChange: (patch: { ticketColor: string }) => void;
};

/** Gap below Dynamic Island before the mirrored ticket. */
const PHONE_TICKET_TOP = 58;
const PHONE_TICKET_PAD_X = 14;

export function EventTicketsSection({ draft, onChange }: Props) {
  const color = draft.ticketColor || DEFAULT_TICKET_COLOR;
  const [flipped, setFlipped] = useState(false);
  const [inspecting, setInspecting] = useState(false);
  const { payload, error, loading } = useTicketControl(draft.id, inspecting);

  const subevents = [...draft.subevents].sort((a, b) => a.sortOrder - b.sortOrder);
  const primarySubevent =
    subevents.find((s) => s.live) ?? subevents[0] ?? null;
  const subeventLabel = !primarySubevent
    ? "No subevent"
    : subevents.length === 1
      ? primarySubevent.name || "Untitled"
      : `${primarySubevent.name || "Untitled"} +${subevents.length - 1}`;

  const phoneTicketScale =
    (IPHONE_17_PRO_SCREEN_WIDTH - PHONE_TICKET_PAD_X * 2) / EVENT_TICKET_REF_WIDTH;

  const ticketProps = {
    draft,
    flipped,
    inspecting,
    primarySubevent,
    subeventLabel,
    controlPayload: payload,
    controlError: error,
    controlLoading: loading,
  } as const;

  return (
    <div className="flex h-full min-h-0 flex-col items-center overflow-y-auto px-8 pb-16 pt-10">
      <div className="relative w-full max-w-[720px]">
        <EventTicketFlipCard
          {...ticketProps}
          interactive
          onFlipToggle={() => setFlipped((v) => !v)}
          onInspectToggle={() => setInspecting((v) => !v)}
        />

        <div className="mt-3 flex justify-start">
          <CategoryActionsMenu
            trigger={
              <button
                type="button"
                className="grid h-7 w-7 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-secondary hover:text-ink data-[state=open]:bg-secondary data-[state=open]:text-ink"
                aria-label="Ticket options"
              >
                <MoreHorizontal className="h-4 w-4" />
              </button>
            }
            currentColor={color}
            onColorChange={(hex) => onChange({ ticketColor: hex })}
            colorSwatches={STANDARD_COLORS_8}
          />
        </div>

        <div className="mt-14 flex justify-center">
          <Iphone17ProFrame>
            <div
              className="absolute inset-0"
              style={{
                background:
                  "linear-gradient(165deg, #F2F2F7 0%, #E5E5EA 55%, #D1D1D6 100%)",
              }}
            >
              <div
                className="absolute left-0 right-0 overflow-visible"
                style={{
                  top: PHONE_TICKET_TOP,
                  paddingLeft: PHONE_TICKET_PAD_X,
                  paddingRight: PHONE_TICKET_PAD_X,
                }}
              >
                <div
                  style={{
                    width: EVENT_TICKET_REF_WIDTH,
                    transform: `scale(${phoneTicketScale})`,
                    transformOrigin: "top left",
                  }}
                >
                  <EventTicketFlipCard
                    {...ticketProps}
                    interactive={false}
                    width={EVENT_TICKET_REF_WIDTH}
                  />
                </div>
              </div>
            </div>
          </Iphone17ProFrame>
        </div>
      </div>
    </div>
  );
}

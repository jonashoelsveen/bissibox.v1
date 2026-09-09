import { useEffect } from "react";

type HoverRect = { left: number; top: number; width: number; height: number } | null;

/**
 * Closes session edit/hover/detail panels when their bound event disappears
 * from the events list (e.g. deleted on another device).
 */
export function useClosePanelsForDeletedEvents(
  events: Array<{ id: string }>,
  {
    hoverId,
    setForceEditId,
    setLockedId,
    setDetailsEvId,
    setHoverId,
    setHoverRect,
    setPopover,
  }: {
    hoverId: string | null;
    setForceEditId: React.Dispatch<React.SetStateAction<string | null>>;
    setLockedId: React.Dispatch<React.SetStateAction<string | null>>;
    setDetailsEvId: React.Dispatch<React.SetStateAction<string | null>>;
    setHoverId: React.Dispatch<React.SetStateAction<string | null>>;
    setHoverRect: React.Dispatch<React.SetStateAction<HoverRect>>;
    setPopover?: React.Dispatch<
      React.SetStateAction<{ eventId?: string | null } | null>
    >;
  },
) {
  useEffect(() => {
    const ids = new Set(events.map((e) => e.id));
    setForceEditId((id) => (id && !ids.has(id) ? null : id));
    setLockedId((id) => (id && !ids.has(id) ? null : id));
    setDetailsEvId((id) => (id && !ids.has(id) ? null : id));
    setPopover?.((p) => (p?.eventId && !ids.has(p.eventId) ? null : p));
  }, [events, setForceEditId, setLockedId, setDetailsEvId, setPopover]);

  useEffect(() => {
    if (!hoverId) return;
    if (events.some((e) => e.id === hoverId)) return;
    setHoverId(null);
    setHoverRect(null);
  }, [events, hoverId, setHoverId, setHoverRect]);
}

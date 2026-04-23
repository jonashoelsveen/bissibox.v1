-- Co-organizers: shared edit access for events
CREATE TABLE public.event_co_organizers (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  event_id UUID NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (event_id, user_id)
);

CREATE INDEX idx_event_co_organizers_user ON public.event_co_organizers(user_id);
CREATE INDEX idx_event_co_organizers_event ON public.event_co_organizers(event_id);

ALTER TABLE public.event_co_organizers ENABLE ROW LEVEL SECURITY;

-- Anyone authenticated can read co-organizer rows for an event they own or co-organize
CREATE POLICY "Co-organizers: owner or self read"
ON public.event_co_organizers
FOR SELECT
TO authenticated
USING (
  auth.uid() = user_id
  OR EXISTS (SELECT 1 FROM public.events e WHERE e.id = event_id AND e.owner_id = auth.uid())
);

-- Only the event owner can add co-organizers
CREATE POLICY "Co-organizers: owner insert"
ON public.event_co_organizers
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (SELECT 1 FROM public.events e WHERE e.id = event_id AND e.owner_id = auth.uid())
);

-- Only the event owner can remove co-organizers (or a co-organizer can remove themselves)
CREATE POLICY "Co-organizers: owner or self delete"
ON public.event_co_organizers
FOR DELETE
TO authenticated
USING (
  auth.uid() = user_id
  OR EXISTS (SELECT 1 FROM public.events e WHERE e.id = event_id AND e.owner_id = auth.uid())
);

-- Extend event policies so co-organizers can read/update events, classes, subevents
CREATE POLICY "Events: co-organizer update"
ON public.events
FOR UPDATE
TO authenticated
USING (
  EXISTS (SELECT 1 FROM public.event_co_organizers c WHERE c.event_id = events.id AND c.user_id = auth.uid())
);

CREATE POLICY "Subevents: co-organizer all"
ON public.event_subevents
FOR ALL
TO authenticated
USING (
  EXISTS (SELECT 1 FROM public.event_co_organizers c WHERE c.event_id = event_subevents.event_id AND c.user_id = auth.uid())
)
WITH CHECK (
  EXISTS (SELECT 1 FROM public.event_co_organizers c WHERE c.event_id = event_subevents.event_id AND c.user_id = auth.uid())
);

CREATE POLICY "Classes: co-organizer all"
ON public.event_classes
FOR ALL
TO authenticated
USING (
  EXISTS (SELECT 1 FROM public.event_co_organizers c WHERE c.event_id = event_classes.event_id AND c.user_id = auth.uid())
)
WITH CHECK (
  EXISTS (SELECT 1 FROM public.event_co_organizers c WHERE c.event_id = event_classes.event_id AND c.user_id = auth.uid())
);

CREATE TABLE public.event_media (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  event_id UUID NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  media_item_id UUID NOT NULL REFERENCES public.media_items(id) ON DELETE CASCADE,
  added_by UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (event_id, media_item_id)
);

CREATE INDEX idx_event_media_event ON public.event_media(event_id);
CREATE INDEX idx_event_media_item ON public.event_media(media_item_id);

ALTER TABLE public.event_media ENABLE ROW LEVEL SECURITY;

-- Public can read links for any event (so viewers can see the gallery)
CREATE POLICY "EventMedia: public read"
ON public.event_media FOR SELECT
TO public
USING (true);

-- Owner of the event can insert
CREATE POLICY "EventMedia: owner insert"
ON public.event_media FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (SELECT 1 FROM public.events e WHERE e.id = event_media.event_id AND e.owner_id = auth.uid())
  OR EXISTS (SELECT 1 FROM public.event_co_organizers c WHERE c.event_id = event_media.event_id AND c.user_id = auth.uid())
);

-- Owner of the event can delete
CREATE POLICY "EventMedia: owner delete"
ON public.event_media FOR DELETE
TO authenticated
USING (
  EXISTS (SELECT 1 FROM public.events e WHERE e.id = event_media.event_id AND e.owner_id = auth.uid())
  OR EXISTS (SELECT 1 FROM public.event_co_organizers c WHERE c.event_id = event_media.event_id AND c.user_id = auth.uid())
);

-- Allow public read of media_items that are linked to an event (so event viewers can see them via signed URLs)
CREATE POLICY "Media: linked-to-event read"
ON public.media_items FOR SELECT
TO public
USING (
  EXISTS (SELECT 1 FROM public.event_media em WHERE em.media_item_id = media_items.id)
);

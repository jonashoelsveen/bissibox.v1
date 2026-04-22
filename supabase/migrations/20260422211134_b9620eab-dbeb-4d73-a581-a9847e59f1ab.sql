-- Extend registrations with subevent, class, and data-share consent
ALTER TABLE public.registrations
  ADD COLUMN IF NOT EXISTS subevent_id uuid REFERENCES public.event_subevents(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS class_code text,
  ADD COLUMN IF NOT EXISTS consent_share_data boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_registrations_event_id ON public.registrations(event_id);
CREATE INDEX IF NOT EXISTS idx_registrations_subevent_id ON public.registrations(subevent_id);

-- Allow event owners to read registrations for their events
DROP POLICY IF EXISTS "Registrations: owner read" ON public.registrations;
CREATE POLICY "Registrations: owner read"
ON public.registrations
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.events e
    WHERE e.id = registrations.event_id AND e.owner_id = auth.uid()
  )
);

-- Allow event owners to read profile data of consenting participants
DROP POLICY IF EXISTS "Profiles: organizer read consenting participants" ON public.profiles;
CREATE POLICY "Profiles: organizer read consenting participants"
ON public.profiles
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.registrations r
    JOIN public.events e ON e.id = r.event_id
    WHERE r.user_id = profiles.id
      AND r.consent_share_data = true
      AND e.owner_id = auth.uid()
  )
);
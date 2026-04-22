
-- 1. owner_id on events
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS owner_id uuid;
CREATE INDEX IF NOT EXISTS idx_events_owner ON public.events(owner_id);

-- Allow organizers to manage their own events
DROP POLICY IF EXISTS "Events: owner insert" ON public.events;
CREATE POLICY "Events: owner insert" ON public.events
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = owner_id);

DROP POLICY IF EXISTS "Events: owner update" ON public.events;
CREATE POLICY "Events: owner update" ON public.events
  FOR UPDATE TO authenticated
  USING (auth.uid() = owner_id);

DROP POLICY IF EXISTS "Events: owner delete" ON public.events;
CREATE POLICY "Events: owner delete" ON public.events
  FOR DELETE TO authenticated
  USING (auth.uid() = owner_id);

-- 2. event_classes
CREATE TABLE IF NOT EXISTS public.event_classes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  code text NOT NULL,
  label text,
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (event_id, code)
);
ALTER TABLE public.event_classes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Classes: public read" ON public.event_classes
  FOR SELECT USING (true);

CREATE POLICY "Classes: owner insert" ON public.event_classes
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.events e WHERE e.id = event_id AND e.owner_id = auth.uid()));

CREATE POLICY "Classes: owner update" ON public.event_classes
  FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.events e WHERE e.id = event_id AND e.owner_id = auth.uid()));

CREATE POLICY "Classes: owner delete" ON public.event_classes
  FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.events e WHERE e.id = event_id AND e.owner_id = auth.uid()));

-- 3. event_subevents (races within an event)
CREATE TABLE IF NOT EXISTS public.event_subevents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  name text NOT NULL,
  starts_at timestamptz,
  distance_km numeric,
  bib_from int,
  bib_to int,
  max_participants int,
  class_codes text[] NOT NULL DEFAULT '{}',
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.event_subevents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Subevents: public read" ON public.event_subevents
  FOR SELECT USING (true);

CREATE POLICY "Subevents: owner insert" ON public.event_subevents
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.events e WHERE e.id = event_id AND e.owner_id = auth.uid()));

CREATE POLICY "Subevents: owner update" ON public.event_subevents
  FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.events e WHERE e.id = event_id AND e.owner_id = auth.uid()));

CREATE POLICY "Subevents: owner delete" ON public.event_subevents
  FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.events e WHERE e.id = event_id AND e.owner_id = auth.uid()));

CREATE TRIGGER trg_subevents_updated_at
  BEFORE UPDATE ON public.event_subevents
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

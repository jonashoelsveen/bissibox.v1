CREATE TABLE public.calendar_category_coach_access (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL,
  category_id uuid NOT NULL REFERENCES public.calendar_categories(id) ON DELETE CASCADE,
  coach_user_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (category_id, coach_user_id)
);

CREATE INDEX idx_ccca_owner ON public.calendar_category_coach_access (owner_id);
CREATE INDEX idx_ccca_coach ON public.calendar_category_coach_access (coach_user_id);
CREATE INDEX idx_ccca_category ON public.calendar_category_coach_access (category_id);

ALTER TABLE public.calendar_category_coach_access ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ccca: owner select"
  ON public.calendar_category_coach_access
  FOR SELECT TO authenticated
  USING (auth.uid() = owner_id);

CREATE POLICY "ccca: owner insert"
  ON public.calendar_category_coach_access
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = owner_id);

CREATE POLICY "ccca: owner delete"
  ON public.calendar_category_coach_access
  FOR DELETE TO authenticated
  USING (auth.uid() = owner_id);

CREATE POLICY "ccca: coach select"
  ON public.calendar_category_coach_access
  FOR SELECT TO authenticated
  USING (auth.uid() = coach_user_id);

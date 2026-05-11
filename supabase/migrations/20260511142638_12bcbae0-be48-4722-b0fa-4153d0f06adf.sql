
ALTER TABLE public.calendar_categories
  ADD COLUMN IF NOT EXISTS team_id uuid REFERENCES public.teams(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_calendar_categories_team ON public.calendar_categories(team_id);

-- Replace RLS policies to support team scope (team owners manage team categories).
DROP POLICY IF EXISTS "calendar_categories: self select" ON public.calendar_categories;
DROP POLICY IF EXISTS "calendar_categories: self insert" ON public.calendar_categories;
DROP POLICY IF EXISTS "calendar_categories: self update" ON public.calendar_categories;
DROP POLICY IF EXISTS "calendar_categories: self delete" ON public.calendar_categories;

CREATE POLICY "calendar_categories: select"
  ON public.calendar_categories FOR SELECT
  USING (
    (team_id IS NULL AND auth.uid() = user_id)
    OR (team_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.teams t WHERE t.id = team_id AND t.owner_id = auth.uid()
    ))
  );

CREATE POLICY "calendar_categories: insert"
  ON public.calendar_categories FOR INSERT
  WITH CHECK (
    (team_id IS NULL AND auth.uid() = user_id)
    OR (team_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.teams t WHERE t.id = team_id AND t.owner_id = auth.uid()
    ))
  );

CREATE POLICY "calendar_categories: update"
  ON public.calendar_categories FOR UPDATE
  USING (
    (team_id IS NULL AND auth.uid() = user_id)
    OR (team_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.teams t WHERE t.id = team_id AND t.owner_id = auth.uid()
    ))
  );

CREATE POLICY "calendar_categories: delete"
  ON public.calendar_categories FOR DELETE
  USING (
    is_default = false
    AND (
      (team_id IS NULL AND auth.uid() = user_id)
      OR (team_id IS NOT NULL AND EXISTS (
        SELECT 1 FROM public.teams t WHERE t.id = team_id AND t.owner_id = auth.uid()
      ))
    )
  );

-- Trigger to seed team default categories on team creation.
CREATE OR REPLACE FUNCTION public.seed_team_calendar_categories()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO public.calendar_categories (user_id, team_id, name, color, sort_order, is_default, default_key)
  VALUES
    (NEW.owner_id, NEW.id, 'Meeting',  '#E63337', 0, true, 'meeting'),
    (NEW.owner_id, NEW.id, 'Training', '#B8B8FF', 1, true, 'training'),
    (NEW.owner_id, NEW.id, 'Event',    '#F09B0A', 2, true, 'event')
  ON CONFLICT DO NOTHING;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_seed_team_calendar_categories ON public.teams;
CREATE TRIGGER trg_seed_team_calendar_categories
  AFTER INSERT ON public.teams
  FOR EACH ROW EXECUTE FUNCTION public.seed_team_calendar_categories();

-- Backfill existing teams.
INSERT INTO public.calendar_categories (user_id, team_id, name, color, sort_order, is_default, default_key)
SELECT t.owner_id, t.id, x.name, x.color, x.sort_order, true, x.default_key
FROM public.teams t
CROSS JOIN (VALUES
  ('Meeting',  '#E63337', 0, 'meeting'),
  ('Training', '#B8B8FF', 1, 'training'),
  ('Event',    '#F09B0A', 2, 'event')
) AS x(name, color, sort_order, default_key)
WHERE NOT EXISTS (
  SELECT 1 FROM public.calendar_categories c
  WHERE c.team_id = t.id AND c.default_key = x.default_key
);

-- Individual calendar categories must stay separate from app-team scope (mobile)

CREATE POLICY "calendar_categories: individual select"
  ON public.calendar_categories FOR SELECT TO authenticated
  USING (app_team_id IS NULL AND team_id IS NULL AND auth.uid() = user_id);

CREATE POLICY "calendar_categories: individual insert"
  ON public.calendar_categories FOR INSERT TO authenticated
  WITH CHECK (app_team_id IS NULL AND team_id IS NULL AND auth.uid() = user_id);

CREATE POLICY "calendar_categories: individual update"
  ON public.calendar_categories FOR UPDATE TO authenticated
  USING (app_team_id IS NULL AND team_id IS NULL AND auth.uid() = user_id)
  WITH CHECK (app_team_id IS NULL AND team_id IS NULL AND auth.uid() = user_id);

CREATE POLICY "calendar_categories: individual delete"
  ON public.calendar_categories FOR DELETE TO authenticated
  USING (
    app_team_id IS NULL
    AND team_id IS NULL
    AND auth.uid() = user_id
    AND is_default = false
  );

-- Restore personal categories that existed before the team was created
UPDATE public.calendar_categories c
SET app_team_id = NULL
FROM public.app_teams t
WHERE c.app_team_id = t.id
  AND c.user_id = t.owner_id
  AND c.app_group_id IS NULL
  AND c.created_at < t.created_at;

-- Restore seeded personal defaults wrongly moved to team scope
UPDATE public.calendar_categories c
SET app_team_id = NULL
WHERE c.app_team_id IS NOT NULL
  AND c.app_group_id IS NULL
  AND c.is_default = true
  AND c.kind = 'calendar'
  AND c.default_key IN ('training', 'school', 'work')
  AND NOT EXISTS (
    SELECT 1
    FROM public.calendar_categories c2
    WHERE c2.user_id = c.user_id
      AND c2.app_team_id IS NULL
      AND c2.team_id IS NULL
      AND c2.kind = 'calendar'
      AND c2.default_key = c.default_key
  );

-- Backfill missing personal calendar defaults for users who lost them
INSERT INTO public.calendar_categories (user_id, name, color, sort_order, is_default, default_key, kind, app_team_id, team_id)
SELECT u.id, d.name, d.color, d.sort_order, true, d.default_key, 'calendar', NULL, NULL
FROM auth.users u
CROSS JOIN (
  VALUES
    ('Training', '#B8B8FF', 0, 'training'),
    ('School',   '#ADD8E6', 1, 'school'),
    ('Work',     '#C19A6B', 2, 'work')
) AS d(name, color, sort_order, default_key)
WHERE NOT EXISTS (
  SELECT 1
  FROM public.calendar_categories c
  WHERE c.user_id = u.id
    AND c.app_team_id IS NULL
    AND c.team_id IS NULL
    AND c.kind = 'calendar'
    AND c.default_key = d.default_key
);

NOTIFY pgrst, 'reload schema';

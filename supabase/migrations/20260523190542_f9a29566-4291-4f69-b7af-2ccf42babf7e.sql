
-- Update seed trigger to also create default diary activities.
CREATE OR REPLACE FUNCTION public.seed_calendar_categories()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.calendar_categories (user_id, name, color, sort_order, is_default, default_key, kind)
  VALUES
    (NEW.id, 'Training', '#B8B8FF', 0, true, 'training', 'calendar'),
    (NEW.id, 'School',   '#ADD8E6', 1, true, 'school',   'calendar'),
    (NEW.id, 'Work',     '#C19A6B', 2, true, 'work',     'calendar')
  ON CONFLICT DO NOTHING;

  INSERT INTO public.calendar_categories (user_id, name, color, sort_order, is_default, default_key, kind)
  VALUES
    (NEW.id, 'Running',    '#ef4444', 0, true, 'running',    'diary_activity'),
    (NEW.id, 'Cycling',    '#f97316', 1, true, 'cycling',    'diary_activity'),
    (NEW.id, 'Swimming',   '#eab308', 2, true, 'swimming',   'diary_activity'),
    (NEW.id, 'Core',       '#22c55e', 3, true, 'core',       'diary_activity'),
    (NEW.id, 'Lifting',    '#3b82f6', 4, true, 'lifting',    'diary_activity'),
    (NEW.id, 'Stretching', '#8b5cf6', 5, true, 'stretching', 'diary_activity')
  ON CONFLICT DO NOTHING;

  RETURN NEW;
END;
$$;

-- Backfill diary_activity defaults for existing users.
WITH defs(name, color, sort_order, default_key) AS (
  VALUES
    ('Running',    '#ef4444', 0, 'running'),
    ('Cycling',    '#f97316', 1, 'cycling'),
    ('Swimming',   '#eab308', 2, 'swimming'),
    ('Core',       '#22c55e', 3, 'core'),
    ('Lifting',    '#3b82f6', 4, 'lifting'),
    ('Stretching', '#8b5cf6', 5, 'stretching')
)
INSERT INTO public.calendar_categories (user_id, name, color, sort_order, is_default, default_key, kind)
SELECT u.id, d.name, d.color, d.sort_order, true, d.default_key, 'diary_activity'
FROM auth.users u
CROSS JOIN defs d
WHERE NOT EXISTS (
  SELECT 1 FROM public.calendar_categories c
  WHERE c.user_id = u.id
    AND c.team_id IS NULL
    AND c.kind = 'diary_activity'
    AND c.default_key = d.default_key
);

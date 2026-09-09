-- Restore custom personal activities that only exist under a team profile scope

INSERT INTO public.calendar_categories (
  user_id, name, color, sort_order, hidden, kind, is_default, app_team_id, team_id
)
SELECT
  c.user_id,
  c.name,
  c.color,
  c.sort_order,
  c.hidden,
  c.kind,
  false,
  NULL,
  NULL
FROM public.calendar_categories c
INNER JOIN public.app_teams t ON t.id = c.app_team_id AND t.owner_id = c.user_id
WHERE c.app_group_id IS NULL
  AND c.team_id IS NULL
  AND c.kind = 'calendar'
  AND c.is_default = false
  AND NOT EXISTS (
    SELECT 1
    FROM public.calendar_categories i
    WHERE i.user_id = c.user_id
      AND i.app_team_id IS NULL
      AND i.team_id IS NULL
      AND i.kind = 'calendar'
      AND lower(i.name) = lower(c.name)
  );

NOTIFY pgrst, 'reload schema';

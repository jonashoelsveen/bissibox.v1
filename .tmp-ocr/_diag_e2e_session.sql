SELECT
  cs.id,
  cs.title,
  cs.entity_id,
  cs.user_id,
  cs.app_group_id,
  cs.starts_at,
  cs.ends_at,
  cs.all_day,
  cs.created_by_coach_id,
  cs.coach_pending,
  cs.signup_enabled,
  EXISTS (SELECT 1 FROM public.app_teams t WHERE t.id = cs.entity_id) AS entity_is_team,
  (SELECT t.name FROM public.app_teams t WHERE t.id = cs.entity_id) AS team_name,
  (SELECT COUNT(*) FROM public.entity_members em
     WHERE em.team_id = cs.entity_id AND em.status IN ('active','roster')) AS live_members
FROM public.calendar_sessions cs
WHERE cs.title ILIKE '%E2E member overlay%'
   OR cs.title ILIKE '%20260901%'
ORDER BY cs.starts_at DESC;

SELECT
  LEFT(em.user_id::text, 8) AS uid8,
  em.status,
  LEFT(em.team_id::text, 8) AS team8,
  (
    SELECT COUNT(*)
    FROM public.calendar_sessions cs
    WHERE cs.entity_id = em.team_id
  ) AS team_sessions,
  jsonb_array_length(
    public.list_visible_calendar_sessions_for(em.user_id, em.email)->'memberships'
  ) AS vis_memberships,
  jsonb_array_length(
    public.list_visible_calendar_sessions_for(em.user_id, em.email)->'sessions'
  ) AS vis_sessions_total,
  (
    SELECT COUNT(*)
    FROM jsonb_array_elements(
      public.list_visible_calendar_sessions_for(em.user_id, em.email)->'sessions'
    ) s
    WHERE s->>'entity_id' IS NOT NULL AND s->>'entity_id' <> ''
  ) AS vis_entity_sessions
FROM public.entity_members em
WHERE em.user_id IS NOT NULL
  AND em.status IN ('active', 'roster')
ORDER BY em.status, em.team_id;

SELECT em.user_id, em.team_id, em.status,
  (SELECT jsonb_array_length(list_member_entity_calendar_for(em.user_id, em.email)->'sessions')) AS overlay_sessions,
  (SELECT jsonb_array_length(list_member_entity_calendar_for(em.user_id, em.email)->'memberships')) AS overlay_memberships
FROM public.entity_members em
WHERE em.user_id IS NOT NULL
  AND em.status IN ('active','roster')
LIMIT 8;

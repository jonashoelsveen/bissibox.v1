SELECT jsonb_pretty(
  jsonb_build_object(
    'membership_count', jsonb_array_length(COALESCE(v->'memberships', '[]'::jsonb)),
    'session_count', jsonb_array_length(COALESCE(v->'sessions', '[]'::jsonb)),
    'memberships', v->'memberships',
    'entity_session_titles', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'id', s->>'id',
        'title', left(s->>'title', 48),
        'entity_id', s->>'entity_id',
        'app_group_id', s->>'app_group_id'
      )), '[]'::jsonb)
      FROM jsonb_array_elements(COALESCE(v->'sessions', '[]'::jsonb)) s
      WHERE s->>'entity_id' IS NOT NULL
    )
  )
) AS visible
FROM public.list_visible_calendar_sessions_for(
  '9848e203-f34c-4bbc-bc47-1d3b42985ade'::uuid,
  'jhoelsveen@gmail.com'
) v;

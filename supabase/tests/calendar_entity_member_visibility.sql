-- Regression: entity admin create is visible to a team member and not to a stranger.
-- Run: supabase db query --linked -f supabase/tests/calendar_entity_member_visibility.sql

DO $$
DECLARE
  team uuid := gen_random_uuid();
  sess uuid := gen_random_uuid();
  owner constant uuid := '7b14e9c4-8b9c-4b4d-bc00-6dec506d0919';
  member constant uuid := '9848e203-f34c-4bbc-bc47-1d3b42985ade';
  stranger uuid := gen_random_uuid();
  code text;
  member_payload jsonb;
  stranger_payload jsonb;
  member_ids text[];
  stranger_ids text[];
BEGIN
  code := rpad(translate(replace(team::text, '-', ''), '01', '23'), 32, 'a');

  INSERT INTO public.app_teams (id, owner_id, name, entity_code)
  VALUES (team, owner, 'regtest-member-visibility', code);

  INSERT INTO public.entity_members (team_id, user_id, email, status)
  VALUES (team, member, 'jhoelsveen@gmail.com', 'active');

  PERFORM public.upsert_entity_calendar_session_for(
    owner,
    jsonb_build_object(
      'id', sess::text,
      'entity_id', team::text,
      'title', 'regtest member visibility',
      'starts_at', '2026-09-15T09:00:00+00:00',
      'ends_at', '2026-09-15T10:00:00+00:00',
      'all_day', false
    )
  );

  IF NOT EXISTS (
    SELECT 1
    FROM public.calendar_sessions cs
    WHERE cs.id = sess
      AND cs.entity_id = team
  ) THEN
    RAISE EXCEPTION 'entity session did not land with entity_id = %', team;
  END IF;

  member_payload := public.list_visible_calendar_sessions_for(member, 'jhoelsveen@gmail.com');
  SELECT COALESCE(array_agg(s->>'id'), ARRAY[]::text[])
    INTO member_ids
  FROM jsonb_array_elements(member_payload->'sessions') s;

  IF NOT (sess::text = ANY (member_ids)) THEN
    RAISE EXCEPTION 'member list_visible did not return %; got %', sess, member_ids;
  END IF;

  stranger_payload := public.list_visible_calendar_sessions_for(stranger, 'nobody-regtest@example.invalid');
  SELECT COALESCE(array_agg(s->>'id'), ARRAY[]::text[])
    INTO stranger_ids
  FROM jsonb_array_elements(stranger_payload->'sessions') s;

  IF sess::text = ANY (stranger_ids) THEN
    RAISE EXCEPTION 'non-member list_visible returned entity session %', sess;
  END IF;

  DELETE FROM public.calendar_sessions WHERE id = sess;
  DELETE FROM public.entity_members WHERE team_id = team;
  DELETE FROM public.app_teams WHERE id = team;
EXCEPTION
  WHEN OTHERS THEN
    DELETE FROM public.calendar_sessions WHERE id = sess;
    DELETE FROM public.entity_members WHERE team_id = team;
    DELETE FROM public.app_teams WHERE id = team;
    RAISE;
END $$;

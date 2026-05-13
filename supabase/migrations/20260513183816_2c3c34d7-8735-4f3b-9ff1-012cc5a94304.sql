-- 1. Add member link column to media_albums
ALTER TABLE public.media_albums
  ADD COLUMN IF NOT EXISTS member_user_id uuid;

-- One member-album per (team, member)
CREATE UNIQUE INDEX IF NOT EXISTS uniq_media_albums_team_member
  ON public.media_albums (team_id, member_user_id)
  WHERE member_user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_media_albums_member_user
  ON public.media_albums (member_user_id)
  WHERE member_user_id IS NOT NULL;

-- 2. Trigger: when a member is added to a team group, ensure a per-member album exists
CREATE OR REPLACE FUNCTION public.ensure_member_media_album()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_owner_id uuid;
  v_display  text;
  v_first    text;
  v_last     text;
  v_email    text;
BEGIN
  SELECT owner_id INTO v_owner_id FROM public.teams WHERE id = NEW.team_id;
  IF v_owner_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT first_name, last_name, email
    INTO v_first, v_last, v_email
  FROM public.profiles WHERE id = NEW.user_id;

  v_display := btrim(coalesce(v_first,'') || ' ' || coalesce(v_last,''));
  IF v_display = '' THEN
    v_display := coalesce(v_email, 'Member');
  END IF;

  INSERT INTO public.media_albums (user_id, team_id, name, member_user_id, description)
  VALUES (v_owner_id, NEW.team_id, v_display, NEW.user_id,
          'Auto-created album for team member.')
  ON CONFLICT (team_id, member_user_id) WHERE member_user_id IS NOT NULL
  DO NOTHING;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_ensure_member_media_album ON public.team_group_members;
CREATE TRIGGER trg_ensure_member_media_album
AFTER INSERT ON public.team_group_members
FOR EACH ROW EXECUTE FUNCTION public.ensure_member_media_album();

-- 3. Backfill existing memberships
INSERT INTO public.media_albums (user_id, team_id, name, member_user_id, description)
SELECT DISTINCT
  t.owner_id,
  m.team_id,
  CASE
    WHEN btrim(coalesce(p.first_name,'') || ' ' || coalesce(p.last_name,'')) <> ''
      THEN btrim(coalesce(p.first_name,'') || ' ' || coalesce(p.last_name,''))
    ELSE coalesce(p.email, 'Member')
  END,
  m.user_id,
  'Auto-created album for team member.'
FROM public.team_group_members m
JOIN public.teams t ON t.id = m.team_id
LEFT JOIN public.profiles p ON p.id = m.user_id
ON CONFLICT (team_id, member_user_id) WHERE member_user_id IS NOT NULL
DO NOTHING;
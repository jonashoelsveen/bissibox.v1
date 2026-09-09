-- Shareable Entity ID for membership joins.
-- Alphabet excludes 0, 1, l, o to avoid visual confusion.

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

CREATE OR REPLACE FUNCTION public.generate_entity_code()
RETURNS text
LANGUAGE plpgsql
VOLATILE
SET search_path = public
AS $$
DECLARE
  alphabet constant text := '23456789abcdefghijkmnpqrstuvwxyz';
  bytes bytea;
  result text := '';
  i int;
BEGIN
  bytes := extensions.gen_random_bytes(32);
  FOR i IN 0..31 LOOP
    result := result || substr(alphabet, (get_byte(bytes, i) % 32) + 1, 1);
  END LOOP;
  RETURN result;
END;
$$;

ALTER TABLE public.app_teams
  ADD COLUMN IF NOT EXISTS entity_code text;

DO $$
DECLARE
  r record;
  candidate text;
  attempts int;
BEGIN
  FOR r IN
    SELECT id FROM public.app_teams
    WHERE entity_code IS NULL
       OR entity_code !~ '^[23456789abcdefghijkmnpqrstuvwxyz]{32}$'
  LOOP
    attempts := 0;
    LOOP
      candidate := public.generate_entity_code();
      EXIT WHEN NOT EXISTS (
        SELECT 1 FROM public.app_teams WHERE entity_code = candidate
      );
      attempts := attempts + 1;
      IF attempts > 8 THEN
        RAISE EXCEPTION 'could not generate unique entity_code';
      END IF;
    END LOOP;
    UPDATE public.app_teams SET entity_code = candidate WHERE id = r.id;
  END LOOP;
END $$;

ALTER TABLE public.app_teams
  ALTER COLUMN entity_code SET NOT NULL;

ALTER TABLE public.app_teams
  DROP CONSTRAINT IF EXISTS app_teams_entity_code_format;

ALTER TABLE public.app_teams
  ADD CONSTRAINT app_teams_entity_code_format
  CHECK (entity_code ~ '^[23456789abcdefghijkmnpqrstuvwxyz]{32}$');

CREATE UNIQUE INDEX IF NOT EXISTS app_teams_entity_code_key
  ON public.app_teams (entity_code);

CREATE OR REPLACE FUNCTION public.app_teams_assign_entity_code()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  candidate text;
  attempts int := 0;
BEGIN
  IF NEW.entity_code IS NOT NULL AND NEW.entity_code <> '' THEN
    RETURN NEW;
  END IF;
  LOOP
    candidate := public.generate_entity_code();
    EXIT WHEN NOT EXISTS (
      SELECT 1 FROM public.app_teams WHERE entity_code = candidate
    );
    attempts := attempts + 1;
    IF attempts > 8 THEN
      RAISE EXCEPTION 'could not generate unique entity_code';
    END IF;
  END LOOP;
  NEW.entity_code := candidate;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS app_teams_assign_entity_code ON public.app_teams;
CREATE TRIGGER app_teams_assign_entity_code
  BEFORE INSERT ON public.app_teams
  FOR EACH ROW
  EXECUTE FUNCTION public.app_teams_assign_entity_code();

COMMENT ON COLUMN public.app_teams.entity_code IS
  'Shareable 32-character Entity ID used to join the entity.';

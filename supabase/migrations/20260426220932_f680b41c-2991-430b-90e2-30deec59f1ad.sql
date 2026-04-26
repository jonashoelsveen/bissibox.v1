
-- 1. New columns on notes
ALTER TABLE public.notes
  ADD COLUMN IF NOT EXISTS cover_image_url text,
  ADD COLUMN IF NOT EXISTS cover_status text NOT NULL DEFAULT 'idle',
  ADD COLUMN IF NOT EXISTS word_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS attachments_count integer NOT NULL DEFAULT 0;

-- 2. Job queue table
CREATE TABLE IF NOT EXISTS public.note_cover_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  note_id uuid NOT NULL REFERENCES public.notes(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  team_id uuid,
  status text NOT NULL DEFAULT 'queued', -- queued | processing | done | failed
  attempts integer NOT NULL DEFAULT 0,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  started_at timestamptz,
  finished_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_note_cover_jobs_status ON public.note_cover_jobs(status, created_at);
CREATE INDEX IF NOT EXISTS idx_note_cover_jobs_note ON public.note_cover_jobs(note_id);

ALTER TABLE public.note_cover_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "NoteCoverJobs: owner read"
  ON public.note_cover_jobs FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id OR (team_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.teams t WHERE t.id = team_id AND t.owner_id = auth.uid()
  )));

-- 3. Helpers: word count, threshold, enqueue
CREATE OR REPLACE FUNCTION public.calc_word_count(_body text)
RETURNS integer
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN _body IS NULL OR length(btrim(_body)) = 0 THEN 0
    ELSE array_length(regexp_split_to_array(btrim(_body), '\s+'), 1)
  END;
$$;

CREATE OR REPLACE FUNCTION public.notes_maintain_and_enqueue()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  meets_threshold boolean;
BEGIN
  NEW.word_count := public.calc_word_count(NEW.body);

  meets_threshold := (NEW.word_count >= 100 OR NEW.attachments_count >= 1);

  IF meets_threshold
     AND (NEW.cover_image_url IS NULL OR length(NEW.cover_image_url) = 0)
     AND NEW.cover_status NOT IN ('pending','generating','done') THEN
    NEW.cover_status := 'pending';
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.notes_enqueue_after()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.cover_status = 'pending'
     AND (TG_OP = 'INSERT' OR OLD.cover_status IS DISTINCT FROM 'pending') THEN
    INSERT INTO public.note_cover_jobs (note_id, user_id, team_id, status)
    VALUES (NEW.id, NEW.user_id, NEW.team_id, 'queued');
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notes_maintain ON public.notes;
CREATE TRIGGER trg_notes_maintain
  BEFORE INSERT OR UPDATE ON public.notes
  FOR EACH ROW EXECUTE FUNCTION public.notes_maintain_and_enqueue();

DROP TRIGGER IF EXISTS trg_notes_enqueue ON public.notes;
CREATE TRIGGER trg_notes_enqueue
  AFTER INSERT OR UPDATE ON public.notes
  FOR EACH ROW EXECUTE FUNCTION public.notes_enqueue_after();

-- 4. Maintain attachments_count on note_attachments
CREATE OR REPLACE FUNCTION public.note_attachments_recount()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_note_id uuid;
BEGIN
  v_note_id := COALESCE(NEW.note_id, OLD.note_id);
  UPDATE public.notes
     SET attachments_count = (SELECT count(*) FROM public.note_attachments WHERE note_id = v_note_id)
   WHERE id = v_note_id;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_note_attachments_recount ON public.note_attachments;
CREATE TRIGGER trg_note_attachments_recount
  AFTER INSERT OR DELETE ON public.note_attachments
  FOR EACH ROW EXECUTE FUNCTION public.note_attachments_recount();

-- 5. updated_at trigger on jobs
DROP TRIGGER IF EXISTS trg_note_cover_jobs_touch ON public.note_cover_jobs;
CREATE TRIGGER trg_note_cover_jobs_touch
  BEFORE UPDATE ON public.note_cover_jobs
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- 6. Storage bucket for covers
INSERT INTO storage.buckets (id, name, public)
VALUES ('note-covers', 'note-covers', true)
ON CONFLICT (id) DO UPDATE SET public = true;

CREATE POLICY "NoteCovers: public read"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'note-covers');

-- 7. Backfill word_count and attachments_count for existing notes
UPDATE public.notes n
   SET word_count = public.calc_word_count(n.body),
       attachments_count = COALESCE((SELECT count(*) FROM public.note_attachments a WHERE a.note_id = n.id), 0);

-- 8. Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.notes;

-- 9. pg_cron + pg_net job to drain the queue every minute
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Unschedule old job if present
DO $$
DECLARE jid bigint;
BEGIN
  SELECT jobid INTO jid FROM cron.job WHERE jobname = 'note-cover-drain';
  IF jid IS NOT NULL THEN PERFORM cron.unschedule(jid); END IF;
END $$;

SELECT cron.schedule(
  'note-cover-drain',
  '* * * * *',
  $$
  SELECT net.http_post(
    url := 'https://amakxzegfryagorwoxbx.supabase.co/functions/v1/note-cover-worker',
    headers := jsonb_build_object(
      'Content-Type','application/json',
      'Authorization','Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFtYWt4emVnZnJ5YWdvcndveGJ4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY4NDE3ODIsImV4cCI6MjA5MjQxNzc4Mn0.LDkig40PZyawux5FkVDn8OZMhNWRbC56i0ommZazaI0'
    ),
    body := '{"trigger":"cron"}'::jsonb
  );
  $$
);

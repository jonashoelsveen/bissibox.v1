ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS athlete_active boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS is_photographer boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS photographer_active boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS photographer_bio text;

CREATE POLICY "Profiles: public read active"
ON public.profiles
FOR SELECT
TO public
USING (athlete_active = true OR photographer_active = true);
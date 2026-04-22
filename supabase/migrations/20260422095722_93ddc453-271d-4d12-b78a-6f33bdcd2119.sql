ALTER TABLE public.events ADD COLUMN IF NOT EXISTS world_athletics_certified BOOLEAN NOT NULL DEFAULT false;

-- Mark a few road races as World Athletics certified for demo purposes
UPDATE public.events
SET world_athletics_certified = true
WHERE lower(coalesce(category,'')) = 'road'
   OR EXISTS (
     SELECT 1 FROM unnest(race_types) rt
     WHERE lower(rt) IN ('marathon', 'half marathon', '10k', '5k')
   );
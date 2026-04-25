-- Add entity type to teams so a team row can represent a Team, Company, or Cooperation
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'teams' AND column_name = 'entity_type'
  ) THEN
    ALTER TABLE public.teams ADD COLUMN entity_type text NOT NULL DEFAULT 'team';
    ALTER TABLE public.teams ADD CONSTRAINT teams_entity_type_check
      CHECK (entity_type IN ('team', 'company', 'cooperation'));
  END IF;
END$$;
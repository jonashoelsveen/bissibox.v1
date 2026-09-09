-- Hex color for entity group tabs (left-panel three-dot Colour menu).
ALTER TABLE public.app_team_groups
  ADD COLUMN IF NOT EXISTS color text;

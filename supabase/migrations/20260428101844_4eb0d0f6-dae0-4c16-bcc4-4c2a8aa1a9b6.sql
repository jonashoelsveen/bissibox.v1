ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS top_bar_color text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS avatar_url text;
ALTER TABLE public.teams ADD COLUMN IF NOT EXISTS top_bar_color text;
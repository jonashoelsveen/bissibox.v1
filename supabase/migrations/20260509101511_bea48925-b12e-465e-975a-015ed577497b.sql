-- User-managed calendar categories ("Me" group)
CREATE TABLE public.calendar_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  color text NOT NULL,
  pinned boolean NOT NULL DEFAULT false,
  hidden boolean NOT NULL DEFAULT false,
  sort_order integer NOT NULL DEFAULT 0,
  is_default boolean NOT NULL DEFAULT false,
  default_key text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_calendar_categories_user ON public.calendar_categories(user_id);

ALTER TABLE public.calendar_categories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "calendar_categories: self select" ON public.calendar_categories
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "calendar_categories: self insert" ON public.calendar_categories
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "calendar_categories: self update" ON public.calendar_categories
  FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "calendar_categories: self delete" ON public.calendar_categories
  FOR DELETE USING (auth.uid() = user_id AND is_default = false);

CREATE TRIGGER calendar_categories_touch
  BEFORE UPDATE ON public.calendar_categories
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- Seed defaults for new users
CREATE OR REPLACE FUNCTION public.seed_calendar_categories()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.calendar_categories (user_id, name, color, sort_order, is_default, default_key)
  VALUES
    (NEW.id, 'Training', '#B8B8FF', 0, true, 'training'),
    (NEW.id, 'School',   '#ADD8E6', 1, true, 'school'),
    (NEW.id, 'Work',     '#C19A6B', 2, true, 'work')
  ON CONFLICT DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created_seed_categories ON auth.users;
CREATE TRIGGER on_auth_user_created_seed_categories
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.seed_calendar_categories();

-- Backfill existing users
INSERT INTO public.calendar_categories (user_id, name, color, sort_order, is_default, default_key)
SELECT u.id, 'Training', '#B8B8FF', 0, true, 'training' FROM auth.users u
WHERE NOT EXISTS (SELECT 1 FROM public.calendar_categories c WHERE c.user_id = u.id AND c.default_key = 'training');
INSERT INTO public.calendar_categories (user_id, name, color, sort_order, is_default, default_key)
SELECT u.id, 'School', '#ADD8E6', 1, true, 'school' FROM auth.users u
WHERE NOT EXISTS (SELECT 1 FROM public.calendar_categories c WHERE c.user_id = u.id AND c.default_key = 'school');
INSERT INTO public.calendar_categories (user_id, name, color, sort_order, is_default, default_key)
SELECT u.id, 'Work', '#C19A6B', 2, true, 'work' FROM auth.users u
WHERE NOT EXISTS (SELECT 1 FROM public.calendar_categories c WHERE c.user_id = u.id AND c.default_key = 'work');
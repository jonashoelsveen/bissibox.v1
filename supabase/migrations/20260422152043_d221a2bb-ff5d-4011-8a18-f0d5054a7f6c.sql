CREATE TABLE public.event_likes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  event_id uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, event_id)
);

ALTER TABLE public.event_likes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Likes: users read own" ON public.event_likes
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Likes: users insert own" ON public.event_likes
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Likes: users delete own" ON public.event_likes
  FOR DELETE USING (auth.uid() = user_id);

CREATE INDEX idx_event_likes_user ON public.event_likes(user_id);
CREATE INDEX idx_event_likes_event ON public.event_likes(event_id);

CREATE TABLE public.user_coaches (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  owner_id uuid NOT NULL,
  coach_email text NOT NULL,
  coach_user_id uuid,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','accepted')),
  calendar_access text NOT NULL DEFAULT 'view' CHECK (calendar_access IN ('view','edit')),
  diary_access text NOT NULL DEFAULT 'view' CHECK (diary_access IN ('view','edit')),
  photos_access text NOT NULL DEFAULT 'view' CHECK (photos_access IN ('view','edit')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX user_coaches_owner_email_uidx
  ON public.user_coaches (owner_id, lower(coach_email));

ALTER TABLE public.user_coaches ENABLE ROW LEVEL SECURITY;

CREATE POLICY "user_coaches: owner all"
  ON public.user_coaches
  FOR ALL
  TO authenticated
  USING (auth.uid() = owner_id)
  WITH CHECK (auth.uid() = owner_id);

CREATE POLICY "user_coaches: coach read own"
  ON public.user_coaches
  FOR SELECT
  TO authenticated
  USING (
    coach_user_id = auth.uid()
    OR lower(coach_email) = lower(COALESCE(auth.jwt() ->> 'email',''))
  );

CREATE TRIGGER user_coaches_set_updated_at
  BEFORE UPDATE ON public.user_coaches
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_now();

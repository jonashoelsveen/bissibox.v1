-- Ensure users can always read and update their own profile row (account page APIs).

DROP POLICY IF EXISTS "Profiles: users read own" ON public.profiles;
CREATE POLICY "Profiles: users read own"
  ON public.profiles
  FOR SELECT
  TO authenticated
  USING (auth.uid() = id);

DROP POLICY IF EXISTS "Profiles: users update own" ON public.profiles;
CREATE POLICY "Profiles: users update own"
  ON public.profiles
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

DROP POLICY IF EXISTS "Profiles: users insert own" ON public.profiles;
CREATE POLICY "Profiles: users insert own"
  ON public.profiles
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = id);

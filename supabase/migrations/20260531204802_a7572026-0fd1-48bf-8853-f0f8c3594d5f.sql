-- Clean up existing orphaned client/coach links where the owner profile no longer exists
DELETE FROM public.user_coaches uc
WHERE NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = uc.owner_id);

-- Also clean up rows where the coach account has been deleted
DELETE FROM public.user_coaches uc
WHERE uc.coach_user_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = uc.coach_user_id);

-- Ensure future account deletions remove the corresponding client/coach links automatically
ALTER TABLE public.user_coaches
  ADD CONSTRAINT user_coaches_owner_id_fkey
  FOREIGN KEY (owner_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE public.user_coaches
  ADD CONSTRAINT user_coaches_coach_user_id_fkey
  FOREIGN KEY (coach_user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
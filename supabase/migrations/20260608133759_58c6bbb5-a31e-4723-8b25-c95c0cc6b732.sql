CREATE OR REPLACE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

INSERT INTO public.profiles (id, email, first_name, last_name)
SELECT u.id, u.email,
       coalesce(u.raw_user_meta_data->>'first_name',''),
       coalesce(u.raw_user_meta_data->>'last_name','')
FROM auth.users u
LEFT JOIN public.profiles p ON p.id = u.id
WHERE p.id IS NULL;
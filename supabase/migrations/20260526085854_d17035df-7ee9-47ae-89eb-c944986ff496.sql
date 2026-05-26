ALTER TABLE public.user_coaches REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.user_coaches;
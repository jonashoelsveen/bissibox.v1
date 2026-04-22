INSERT INTO public.events (title, organizer, description, race_types, category, location, region, country, starts_at, signup_fee, currency, featured, popularity, world_athletics_certified)
VALUES (
  'Oslo Sentrum 10K',
  'Oslo Løpeklubb',
  'A fast, certified 10K through downtown Oslo.',
  ARRAY['10K', '5K'],
  'Road',
  'Oslo Sentrum',
  'Oslo',
  'NO',
  date_trunc('day', now()) + interval '17 hours',
  350,
  'NOK',
  true,
  92,
  true
);
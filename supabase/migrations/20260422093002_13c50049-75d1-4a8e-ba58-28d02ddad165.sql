-- PROFILES
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  first_name text,
  last_name text,
  gender text check (gender in ('male','female','other')),
  birth_date date,
  anonymous boolean not null default false,
  club text,
  company_club text,
  team text,
  team_group text,
  default_class text,
  license text,
  address text,
  address2 text,
  postal_code text,
  postal_place text,
  country text default 'NO',
  nationality text default 'NO',
  mobile text,
  email text,
  emergency_contact text,
  emergency_phone text,
  companion text,
  mode text not null default 'participant' check (mode in ('participant','organizer')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "Profiles: users read own"
  on public.profiles for select
  using (auth.uid() = id);

create policy "Profiles: users insert own"
  on public.profiles for insert
  with check (auth.uid() = id);

create policy "Profiles: users update own"
  on public.profiles for update
  using (auth.uid() = id);

-- Auto-create profile on signup
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, email, first_name, last_name)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'first_name',''),
    coalesce(new.raw_user_meta_data->>'last_name','')
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- updated_at helper
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end; $$;

create trigger profiles_touch
  before update on public.profiles
  for each row execute procedure public.touch_updated_at();

-- EVENTS
create table public.events (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  organizer text not null,
  description text,
  race_types text[] not null default '{}',
  category text,
  location text,
  region text,
  country text default 'NO',
  starts_at timestamptz not null,
  signup_deadline timestamptz,
  signup_fee numeric(10,2) not null default 0,
  currency text not null default 'NOK',
  cover_image text,
  featured boolean not null default false,
  popularity int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.events enable row level security;

create policy "Events: public read"
  on public.events for select
  using (true);

create trigger events_touch
  before update on public.events
  for each row execute procedure public.touch_updated_at();

create index events_starts_at_idx on public.events(starts_at);
create index events_featured_idx on public.events(featured);
create index events_region_idx on public.events(region);

-- REGISTRATIONS
create table public.registrations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  event_id uuid not null references public.events(id) on delete cascade,
  race_type text not null,
  status text not null default 'pending' check (status in ('pending','confirmed','cancelled')),
  bib_number text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, event_id)
);

alter table public.registrations enable row level security;

create policy "Registrations: users read own"
  on public.registrations for select
  using (auth.uid() = user_id);

create policy "Registrations: users insert own"
  on public.registrations for insert
  with check (auth.uid() = user_id);

create policy "Registrations: users update own"
  on public.registrations for update
  using (auth.uid() = user_id);

create policy "Registrations: users delete own"
  on public.registrations for delete
  using (auth.uid() = user_id);

create trigger registrations_touch
  before update on public.registrations
  for each row execute procedure public.touch_updated_at();
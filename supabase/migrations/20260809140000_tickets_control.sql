-- Event admission tickets (paid/active) for conductor visual control.
-- Organizer Tickets-tab Inspection can fall back to draft ids when no row exists yet.

create table if not exists public.tickets (
  id text primary key,
  event_id uuid references public.events(id) on delete set null,
  user_id uuid references auth.users(id) on delete set null,
  status text not null default 'active'
    check (status in ('active', 'void', 'expired', 'refunded')),
  paid boolean not null default false,
  participant_name text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists tickets_event_id_idx on public.tickets(event_id);
create index if not exists tickets_user_id_idx on public.tickets(user_id);
create index if not exists tickets_status_paid_idx on public.tickets(status, paid);

alter table public.tickets enable row level security;

-- Owners of the linked event can read tickets; holders can read their own.
drop policy if exists "Tickets: holder read own" on public.tickets;
create policy "Tickets: holder read own"
  on public.tickets for select
  using (auth.uid() = user_id);

drop policy if exists "Tickets: event owner read" on public.tickets;
create policy "Tickets: event owner read"
  on public.tickets for select
  using (
    event_id is not null
    and exists (
      select 1 from public.events e
      where e.id = tickets.event_id and e.owner_id = auth.uid()
    )
  );

drop trigger if exists tickets_touch on public.tickets;
create trigger tickets_touch
  before update on public.tickets
  for each row execute procedure public.touch_updated_at();

comment on table public.tickets is
  'Issued admission tickets. Control endpoint requires status=active and paid=true.';

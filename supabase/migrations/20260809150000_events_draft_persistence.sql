-- Persist Events UI drafts in public.events (+ related subevent fields).

-- Drafts may not have a start time yet.
alter table public.events
  alter column starts_at drop not null;

alter table public.events
  add column if not exists ticket_color text,
  add column if not exists participants_json jsonb not null default '[]'::jsonb,
  add column if not exists co_organizer_emails jsonb not null default '[]'::jsonb;

comment on column public.events.ticket_color is
  'Ticket stub fill colour for the Events editor.';
comment on column public.events.participants_json is
  'Event signup roster draft (isolated from entity members).';
comment on column public.events.co_organizer_emails is
  'Pending co-organizer invite emails from the New event flow.';

alter table public.event_subevents
  add column if not exists ends_at timestamptz,
  add column if not exists color text,
  add column if not exists live boolean not null default false;

comment on column public.event_subevents.ends_at is
  'Optional subevent end time from the Events editor.';
comment on column public.event_subevents.color is
  'Subevent tab colour (activity palette).';
comment on column public.event_subevents.live is
  'When true, subevent is visible live for participant signup.';


create table if not exists public.diary_session_note_views (
  viewer_id uuid not null references auth.users(id) on delete cascade,
  event_id uuid not null,
  last_seen_at timestamptz not null default now(),
  primary key (viewer_id, event_id)
);

alter table public.diary_session_note_views enable row level security;

create policy "viewer can read own session note views"
  on public.diary_session_note_views for select
  using (auth.uid() = viewer_id);

create policy "viewer can insert own session note views"
  on public.diary_session_note_views for insert
  with check (auth.uid() = viewer_id);

create policy "viewer can update own session note views"
  on public.diary_session_note_views for update
  using (auth.uid() = viewer_id)
  with check (auth.uid() = viewer_id);

create policy "viewer can delete own session note views"
  on public.diary_session_note_views for delete
  using (auth.uid() = viewer_id);

-- Ready for Mapbox place linking on events (feature id / place id).
alter table public.events
  add column if not exists mapbox_place_id text;

comment on column public.events.mapbox_place_id is
  'Mapbox Geocoding / Search feature id for the event location pin.';

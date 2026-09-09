-- Drop tables that are no longer part of the product.
-- CASCADE removes any FK constraints in other tables that reference these
-- (events.timing_company_id, user_roles.company_id, event_media.media_item_id,
--  media_item_albums.album_id / media_item_id) without dropping those tables.

DROP TABLE IF EXISTS public.company_follows    CASCADE;
DROP TABLE IF EXISTS public.media_item_albums  CASCADE;
DROP TABLE IF EXISTS public.media_items        CASCADE;
DROP TABLE IF EXISTS public.media_albums       CASCADE;
DROP TABLE IF EXISTS public.companies          CASCADE;

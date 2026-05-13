
-- Change 1: drop virus-scan columns
ALTER TABLE public.media_items DROP COLUMN IF EXISTS scan_status;
ALTER TABLE public.media_items DROP COLUMN IF EXISTS scanned_at;
ALTER TABLE public.media_items DROP COLUMN IF EXISTS scan_details;

ALTER TABLE public.files DROP COLUMN IF EXISTS scan_status;
ALTER TABLE public.files DROP COLUMN IF EXISTS scanned_at;
ALTER TABLE public.files DROP COLUMN IF EXISTS scan_details;

-- Change 2: bucket size + mime limits
UPDATE storage.buckets
SET file_size_limit = 5368709120,
    allowed_mime_types = ARRAY['image/jpeg','image/png','image/webp','image/heic','image/heif','image/gif','video/mp4','video/quicktime','video/webm','video/x-m4v']
WHERE id = 'media';

UPDATE storage.buckets
SET file_size_limit = 1073741824,
    allowed_mime_types = NULL
WHERE id = 'documents';

UPDATE storage.buckets
SET file_size_limit = 104857600,
    allowed_mime_types = NULL
WHERE id = 'note-attachments';

UPDATE storage.buckets
SET file_size_limit = 104857600,
    allowed_mime_types = NULL
WHERE id = 'board-attachments';

UPDATE storage.buckets
SET file_size_limit = 10485760,
    allowed_mime_types = ARRAY['image/jpeg','image/png','image/webp']
WHERE id = 'note-covers';

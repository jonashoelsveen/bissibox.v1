DROP POLICY IF EXISTS "BoardAttachmentsStorage: team owner all" ON storage.objects;
DROP POLICY IF EXISTS "BoardAttachmentsStorage: board read" ON storage.objects;
DROP POLICY IF EXISTS "BoardAttachmentsStorage: team owner insert" ON storage.objects;
DROP POLICY IF EXISTS "BoardAttachmentsStorage: team owner update" ON storage.objects;
DROP POLICY IF EXISTS "BoardAttachmentsStorage: team owner delete" ON storage.objects;
DROP POLICY IF EXISTS "BoardAttachmentsStorage: team owner select" ON storage.objects;

CREATE POLICY "BoardAttachmentsStorage: team owner insert"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'board-attachments'
  AND EXISTS (
    SELECT 1
    FROM public.teams t
    WHERE t.id::text = (storage.foldername(storage.objects.name))[1]
      AND t.owner_id = auth.uid()
  )
);

CREATE POLICY "BoardAttachmentsStorage: team owner update"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'board-attachments'
  AND EXISTS (
    SELECT 1
    FROM public.teams t
    WHERE t.id::text = (storage.foldername(storage.objects.name))[1]
      AND t.owner_id = auth.uid()
  )
)
WITH CHECK (
  bucket_id = 'board-attachments'
  AND EXISTS (
    SELECT 1
    FROM public.teams t
    WHERE t.id::text = (storage.foldername(storage.objects.name))[1]
      AND t.owner_id = auth.uid()
  )
);

CREATE POLICY "BoardAttachmentsStorage: team owner delete"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'board-attachments'
  AND EXISTS (
    SELECT 1
    FROM public.teams t
    WHERE t.id::text = (storage.foldername(storage.objects.name))[1]
      AND t.owner_id = auth.uid()
  )
);

CREATE POLICY "BoardAttachmentsStorage: team owner select"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'board-attachments'
  AND EXISTS (
    SELECT 1
    FROM public.teams t
    WHERE t.id::text = (storage.foldername(storage.objects.name))[1]
      AND t.owner_id = auth.uid()
  )
);

CREATE POLICY "BoardAttachmentsStorage: board read"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'board-attachments'
  AND EXISTS (
    SELECT 1
    FROM public.team_board_members b
    WHERE b.team_id::text = (storage.foldername(storage.objects.name))[1]
      AND b.user_id = auth.uid()
      AND b.status = 'active'
  )
);

-- Storage policies for board-attachments bucket: allow team owners and active board members

CREATE POLICY "BoardAttachmentsStorage: team owner all"
ON storage.objects
FOR ALL
TO authenticated
USING (
  bucket_id = 'board-attachments'
  AND EXISTS (
    SELECT 1 FROM public.teams t
    WHERE t.id::text = (storage.foldername(name))[1]
      AND t.owner_id = auth.uid()
  )
)
WITH CHECK (
  bucket_id = 'board-attachments'
  AND EXISTS (
    SELECT 1 FROM public.teams t
    WHERE t.id::text = (storage.foldername(name))[1]
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
    SELECT 1 FROM public.team_board_members b
    WHERE b.team_id::text = (storage.foldername(name))[1]
      AND b.user_id = auth.uid()
      AND b.status = 'active'
  )
);

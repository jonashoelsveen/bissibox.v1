-- calendar_sessions.entity_id must point at a live app_teams row.
--
-- ON DELETE RESTRICT: app_teams is hard-deleted today. SET NULL would silently
-- turn entity sessions into personal rows (user_id = creator, members lose them).
-- Groups already soft-delete so sessions can keep app_group_id; team delete
-- should fail loudly until those sessions are handled.
--
-- NOT VALID: do not check existing rows. Two orphan sessions remain for manual
-- review and must not be rewritten or deleted by this migration:
--   entity_id 6001ef00-3fb0-45ca-8f1d-ff527aa656f8 (not in app_teams)
--   calendar_sessions 4947381c-e38e-4684-8922-732cded43327
--   calendar_sessions 17583b14-3868-4c1e-b3cd-49725e340319
-- VALIDATE the constraint only after those rows are assigned to a live team
-- or archived by hand.

ALTER TABLE public.calendar_sessions
  DROP CONSTRAINT IF EXISTS calendar_sessions_entity_id_fkey;

ALTER TABLE public.calendar_sessions
  ADD CONSTRAINT calendar_sessions_entity_id_fkey
  FOREIGN KEY (entity_id) REFERENCES public.app_teams(id)
  ON DELETE RESTRICT
  NOT VALID;

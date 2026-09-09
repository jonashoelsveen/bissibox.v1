-- Trigger functions are not an RPC surface. Default PUBLIC execute would let
-- anon/authenticated call broadcast_entity_calendar_sync via PostgREST.

REVOKE ALL ON FUNCTION public.broadcast_entity_calendar_sync() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.broadcast_entity_calendar_sync() FROM anon, authenticated;

REVOKE ALL ON FUNCTION public.list_member_entity_calendar() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_member_entity_calendar() TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.can_view_entity_calendar_session(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.can_view_entity_calendar_session(uuid, uuid) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.is_app_team_member(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_app_team_member(uuid) TO authenticated, service_role;

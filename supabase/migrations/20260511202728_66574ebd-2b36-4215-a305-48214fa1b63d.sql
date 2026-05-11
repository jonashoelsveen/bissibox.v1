REVOKE EXECUTE ON FUNCTION public.is_group_leader_of_member(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_active_follower_of_member(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_follower_of_member(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.can_annotate_member(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.can_view_member(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_member_viewer_role(uuid) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.is_group_leader_of_member(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_active_follower_of_member(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_follower_of_member(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_annotate_member(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_view_member(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_member_viewer_role(uuid) TO authenticated;
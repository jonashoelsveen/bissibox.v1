SELECT status, COUNT(*) AS n,
       COUNT(*) FILTER (WHERE user_id IS NOT NULL) AS with_user,
       COUNT(*) FILTER (WHERE app_group_id IS NOT NULL) AS with_app_group
FROM public.entity_members
GROUP BY status
ORDER BY status;

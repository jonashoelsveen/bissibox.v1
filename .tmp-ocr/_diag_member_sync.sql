SELECT status, count(*) AS n,
       count(*) FILTER (WHERE user_id IS NOT NULL) AS with_user_id,
       count(*) FILTER (WHERE email IS NOT NULL AND btrim(email) <> '') AS with_email
FROM public.entity_members
GROUP BY status
ORDER BY status;

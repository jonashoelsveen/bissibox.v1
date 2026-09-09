SELECT em.team_id,
       em.status,
       (em.user_id IS NOT NULL) AS linked,
       (
         SELECT COUNT(*)
         FROM public.calendar_sessions cs
         WHERE cs.entity_id = em.team_id
           AND (
             cs.app_group_id IS NULL
             OR cs.app_group_id = em.app_group_id
             OR EXISTS (
               SELECT 1
               FROM public.entity_member_groups g
               WHERE g.member_id = em.id
                 AND g.group_id = cs.app_group_id
             )
           )
       ) AS visible_sessions
FROM public.entity_members em
WHERE em.status IN ('active', 'roster')
ORDER BY em.status, em.team_id;

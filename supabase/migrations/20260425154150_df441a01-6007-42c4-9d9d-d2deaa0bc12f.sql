DELETE FROM public.team_memberships
 WHERE team_id NOT IN (SELECT team_id FROM public.team_membership_tiers);
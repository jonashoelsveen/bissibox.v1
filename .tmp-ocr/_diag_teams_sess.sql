SELECT t.id, t.name,
  (SELECT COUNT(*) FROM calendar_sessions cs WHERE cs.entity_id = t.id) AS sessions,
  (SELECT COUNT(*) FROM entity_members em WHERE em.team_id = t.id AND em.status IN ('active','roster')) AS members
FROM app_teams t
ORDER BY t.created_at;

SELECT cs.entity_id, cs.app_group_id, left(cs.title, 40) AS title, cs.starts_at
FROM calendar_sessions cs
WHERE cs.entity_id IS NOT NULL
ORDER BY cs.starts_at DESC
LIMIT 20;

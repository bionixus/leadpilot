-- Atomic task claiming function to prevent concurrent processing of the same task.
-- Uses SELECT ... FOR UPDATE SKIP LOCKED to ensure only one worker claims each task.
CREATE OR REPLACE FUNCTION claim_next_agent_task(p_org_id uuid, p_limit int DEFAULT 5)
RETURNS SETOF agent_tasks AS $$
  UPDATE agent_tasks
  SET status = 'running', started_at = now()
  WHERE id IN (
    SELECT id FROM agent_tasks
    WHERE org_id = p_org_id
      AND status = 'pending'
      AND scheduled_for <= now()
    ORDER BY priority DESC, created_at ASC
    LIMIT p_limit
    FOR UPDATE SKIP LOCKED
  )
  RETURNING *;
$$ LANGUAGE sql;

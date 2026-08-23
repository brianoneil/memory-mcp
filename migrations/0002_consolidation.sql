CREATE TABLE IF NOT EXISTS consolidation_runs (
  id          TEXT    PRIMARY KEY,
  agent_id    TEXT,                       -- NULL = all agents (cron run)
  triggered_by TEXT NOT NULL DEFAULT 'cron', -- 'cron' | 'agent' | 'manual'
  started_at  INTEGER NOT NULL,
  completed_at INTEGER,
  memories_before INTEGER NOT NULL DEFAULT 0,
  memories_after  INTEGER NOT NULL DEFAULT 0,
  groups_processed INTEGER NOT NULL DEFAULT 0,
  status      TEXT NOT NULL DEFAULT 'running', -- 'running' | 'completed' | 'failed'
  error       TEXT
);

CREATE INDEX IF NOT EXISTS idx_runs_agent ON consolidation_runs(agent_id, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_runs_started ON consolidation_runs(started_at DESC);

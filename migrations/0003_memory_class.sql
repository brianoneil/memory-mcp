ALTER TABLE memories ADD COLUMN memory_class TEXT NOT NULL DEFAULT 'long_term';

CREATE INDEX IF NOT EXISTS idx_memories_class ON memories(agent_id, memory_class, updated_at DESC);

-- Memory storage table
CREATE TABLE IF NOT EXISTS memories (
  id         TEXT    PRIMARY KEY,
  agent_id   TEXT    NOT NULL,
  content    TEXT    NOT NULL,
  summary    TEXT    NOT NULL,
  tags       TEXT    NOT NULL DEFAULT '[]',  -- JSON array of strings
  importance INTEGER NOT NULL DEFAULT 3,      -- 1 (low) to 5 (high)
  metadata   TEXT    NOT NULL DEFAULT '{}',   -- JSON object, freeform
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_memories_agent ON memories(agent_id);
CREATE INDEX IF NOT EXISTS idx_memories_importance ON memories(agent_id, importance DESC);

-- FTS5 virtual table for full-text search on content + summary + tags
CREATE VIRTUAL TABLE IF NOT EXISTS memories_fts USING fts5(
  content,
  summary,
  tags,
  content=memories,
  content_rowid=rowid
);

-- Keep FTS in sync with memories table
CREATE TRIGGER IF NOT EXISTS memories_ai AFTER INSERT ON memories BEGIN
  INSERT INTO memories_fts(rowid, content, summary, tags)
  VALUES (new.rowid, new.content, new.summary, new.tags);
END;

CREATE TRIGGER IF NOT EXISTS memories_ad AFTER DELETE ON memories BEGIN
  INSERT INTO memories_fts(memories_fts, rowid, content, summary, tags)
  VALUES ('delete', old.rowid, old.content, old.summary, old.tags);
END;

CREATE TRIGGER IF NOT EXISTS memories_au AFTER UPDATE ON memories BEGIN
  INSERT INTO memories_fts(memories_fts, rowid, content, summary, tags)
  VALUES ('delete', old.rowid, old.content, old.summary, old.tags);
  INSERT INTO memories_fts(rowid, content, summary, tags)
  VALUES (new.rowid, new.content, new.summary, new.tags);
END;

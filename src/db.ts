import { Memory, MemoryRow, MemorySummary, rowToMemory } from './types.js';

export async function storeMemory(
  db: D1Database,
  params: {
    id: string;
    agent_id: string;
    content: string;
    summary: string;
    tags: string[];
    importance: number;
    metadata: Record<string, unknown>;
    now: number;
  }
): Promise<void> {
  await db
    .prepare(
      `INSERT INTO memories (id, agent_id, content, summary, tags, importance, metadata, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(
      params.id,
      params.agent_id,
      params.content,
      params.summary,
      JSON.stringify(params.tags),
      params.importance,
      JSON.stringify(params.metadata),
      params.now,
      params.now
    )
    .run();
}

export async function getMemory(db: D1Database, id: string): Promise<Memory | null> {
  const row = await db
    .prepare(`SELECT * FROM memories WHERE id = ?`)
    .bind(id)
    .first<MemoryRow>();
  return row ? rowToMemory(row) : null;
}

export async function updateMemory(
  db: D1Database,
  id: string,
  patch: {
    content?: string;
    summary?: string;
    tags?: string[];
    importance?: number;
    metadata?: Record<string, unknown>;
  },
  now: number
): Promise<boolean> {
  const existing = await db
    .prepare(`SELECT * FROM memories WHERE id = ?`)
    .bind(id)
    .first<MemoryRow>();
  if (!existing) return false;

  const content = patch.content ?? existing.content;
  const summary = patch.summary ?? existing.summary;
  const tags = JSON.stringify(patch.tags ?? (JSON.parse(existing.tags) as string[]));
  const importance = patch.importance ?? existing.importance;
  const metadata = JSON.stringify(
    patch.metadata ?? (JSON.parse(existing.metadata) as Record<string, unknown>)
  );

  await db
    .prepare(
      `UPDATE memories SET content=?, summary=?, tags=?, importance=?, metadata=?, updated_at=? WHERE id=?`
    )
    .bind(content, summary, tags, importance, metadata, now, id)
    .run();
  return true;
}

export async function deleteMemory(db: D1Database, id: string): Promise<boolean> {
  const result = await db.prepare(`DELETE FROM memories WHERE id = ?`).bind(id).run();
  return (result.meta.changes ?? 0) > 0;
}

export async function recallMemories(
  db: D1Database,
  params: {
    agent_id: string;
    query?: string;
    tags?: string[];
    min_importance?: number;
    cross_agent?: boolean;
    limit: number;
  }
): Promise<MemorySummary[]> {
  const { agent_id, query, tags, min_importance = 1, cross_agent = false, limit } = params;

  let sql: string;
  const bindings: (string | number)[] = [];

  if (query) {
    // FTS path
    sql = `
      SELECT m.id, m.agent_id, m.summary, m.tags, m.importance, m.created_at
      FROM memories_fts fts
      JOIN memories m ON m.rowid = fts.rowid
      WHERE memories_fts MATCH ?
        AND m.importance >= ?
    `;
    bindings.push(query, min_importance);
    if (!cross_agent) {
      sql += ` AND m.agent_id = ?`;
      bindings.push(agent_id);
    }
  } else {
    sql = `
      SELECT id, agent_id, summary, tags, importance, created_at
      FROM memories
      WHERE importance >= ?
    `;
    bindings.push(min_importance);
    if (!cross_agent) {
      sql += ` AND agent_id = ?`;
      bindings.push(agent_id);
    }
  }

  // Tag filter (post-filter; tags stored as JSON array string)
  // We do this in SQL with a LIKE for simplicity — fast enough for tag subsets
  if (tags && tags.length > 0) {
    for (const tag of tags) {
      sql += ` AND tags LIKE ?`;
      bindings.push(`%"${tag}"%`);
    }
  }

  sql += ` ORDER BY importance DESC, updated_at DESC LIMIT ?`;
  bindings.push(limit);

  const rows = await db
    .prepare(sql)
    .bind(...bindings)
    .all<{ id: string; agent_id: string; summary: string; tags: string; importance: number; created_at: number }>();

  return (rows.results ?? []).map((r) => ({
    id: r.id,
    agent_id: r.agent_id,
    summary: r.summary,
    tags: JSON.parse(r.tags) as string[],
    importance: r.importance,
    created_at: r.created_at,
  }));
}

export async function listAgents(db: D1Database): Promise<{ agent_id: string; count: number }[]> {
  const rows = await db
    .prepare(`SELECT agent_id, COUNT(*) as count FROM memories GROUP BY agent_id ORDER BY count DESC`)
    .all<{ agent_id: string; count: number }>();
  return rows.results ?? [];
}

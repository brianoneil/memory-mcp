import { Memory, MemoryClass, MemoryRow, MemorySummary, rowToMemory } from './types.js';

const MS_PER_DAY = 86_400_000;

export async function storeMemory(
  db: D1Database,
  params: {
    id: string;
    agent_id: string;
    content: string;
    summary: string;
    tags: string[];
    importance: number;
    memory_class: MemoryClass;
    metadata: Record<string, unknown>;
    now: number;
  }
): Promise<void> {
  await db
    .prepare(
      `INSERT INTO memories (id, agent_id, content, summary, tags, importance, memory_class, metadata, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(
      params.id,
      params.agent_id,
      params.content,
      params.summary,
      JSON.stringify(params.tags),
      params.importance,
      params.memory_class,
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

function sanitizeFtsQuery(q: string): string {
  // Strip FTS5 special chars that cause syntax errors, collapse whitespace
  return q.replace(/["'()*^:!]/g, ' ').replace(/\s+/g, ' ').trim();
}

function buildBaseQuery(
  db: D1Database,
  params: {
    agent_id: string;
    min_importance: number;
    memory_class?: MemoryClass;
    cross_agent: boolean;
    tags?: string[];
    limit: number;
  }
): { stmt: ReturnType<D1Database['prepare']> } {
  const { agent_id, min_importance, memory_class, cross_agent, tags, limit } = params;
  const bindings: (string | number)[] = [];

  let sql = `
    SELECT id, agent_id, summary, tags, importance, memory_class, updated_at, created_at
    FROM memories
    WHERE importance >= ?
  `;
  bindings.push(min_importance);
  if (!cross_agent) { sql += ` AND agent_id = ?`; bindings.push(agent_id); }
  if (memory_class) { sql += ` AND memory_class = ?`; bindings.push(memory_class); }
  if (tags && tags.length > 0) {
    for (const tag of tags) {
      sql += ` AND tags LIKE ?`;
      bindings.push(`%"${tag}"%`);
    }
  }
  sql += ` ORDER BY CASE memory_class WHEN 'long_term' THEN 0 ELSE 1 END, importance DESC, updated_at DESC LIMIT ?`;
  bindings.push(limit);
  return { stmt: db.prepare(sql).bind(...bindings) };
}

export async function recallMemories(
  db: D1Database,
  params: {
    agent_id: string;
    query?: string;
    tags?: string[];
    min_importance?: number;
    memory_class?: MemoryClass;
    cross_agent?: boolean;
    limit: number;
  }
): Promise<MemorySummary[]> {
  const { agent_id, query, tags, min_importance = 1, memory_class, cross_agent = false, limit } = params;
  const now = Date.now();

  type Row = { id: string; agent_id: string; summary: string; tags: string; importance: number; memory_class: MemoryClass; updated_at: number; created_at: number };

  let rows: D1Result<Row> | null = null;

  if (query) {
    const safe = sanitizeFtsQuery(query);
    if (safe) {
      try {
        const bindings: (string | number)[] = [safe, min_importance];
        let sql = `
          SELECT m.id, m.agent_id, m.summary, m.tags, m.importance, m.memory_class, m.updated_at, m.created_at
          FROM memories_fts fts
          JOIN memories m ON m.rowid = fts.rowid
          WHERE memories_fts MATCH ?
            AND m.importance >= ?
        `;
        if (!cross_agent) { sql += ` AND m.agent_id = ?`; bindings.push(agent_id); }
        if (memory_class) { sql += ` AND m.memory_class = ?`; bindings.push(memory_class); }
        if (tags && tags.length > 0) {
          for (const tag of tags) { sql += ` AND m.tags LIKE ?`; bindings.push(`%"${tag}"%`); }
        }
        sql += ` ORDER BY CASE m.memory_class WHEN 'long_term' THEN 0 ELSE 1 END, m.importance DESC, m.updated_at DESC LIMIT ?`;
        bindings.push(limit);
        rows = await db.prepare(sql).bind(...bindings).all<Row>();
      } catch {
        // FTS error — fall through to plain scan below
      }
    }
  }

  if (!rows) {
    const { stmt } = buildBaseQuery(db, { agent_id, min_importance, memory_class, cross_agent, tags, limit });
    rows = await stmt.all<Row>();
  }

  return (rows.results ?? []).map((r) => {
    const staleness_days = r.memory_class === 'working_state'
      ? Math.floor((now - r.updated_at) / MS_PER_DAY)
      : undefined;
    return {
      id: r.id,
      agent_id: r.agent_id,
      summary: r.summary,
      tags: JSON.parse(r.tags) as string[],
      importance: r.importance,
      memory_class: r.memory_class ?? 'long_term',
      created_at: r.created_at,
      ...(staleness_days !== undefined ? { staleness_days } : {}),
    };
  });
}

export async function replaceWorkingState(
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
): Promise<{ replaced: number; new_id: string }> {
  // Delete existing working_state memories for this agent
  const deleted = await db
    .prepare(`DELETE FROM memories WHERE agent_id = ? AND memory_class = 'working_state'`)
    .bind(params.agent_id)
    .run();

  // Store the new working state
  await db
    .prepare(
      `INSERT INTO memories (id, agent_id, content, summary, tags, importance, memory_class, metadata, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, 'working_state', ?, ?, ?)`
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

  return { replaced: deleted.meta.changes ?? 0, new_id: params.id };
}

export async function listAgents(db: D1Database): Promise<{ agent_id: string; count: number; working_state_count: number }[]> {
  const rows = await db
    .prepare(
      `SELECT agent_id,
              COUNT(*) as count,
              SUM(CASE WHEN memory_class='working_state' THEN 1 ELSE 0 END) as working_state_count
       FROM memories GROUP BY agent_id ORDER BY count DESC`
    )
    .all<{ agent_id: string; count: number; working_state_count: number }>();
  return rows.results ?? [];
}

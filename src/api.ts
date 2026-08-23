import { Env, MemoryRow, rowToMemory } from './types.js';
import { runConsolidation } from './consolidate.js';
import { ulid } from 'ulid';

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
  });
}

export async function handleApi(request: Request, env: Env, pathname: string): Promise<Response | null> {
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      },
    });
  }

  // GET /api/agents
  if (pathname === '/api/agents' && request.method === 'GET') {
    const rows = await env.DB.prepare(
      `SELECT agent_id, COUNT(*) as count,
              MAX(updated_at) as last_active,
              AVG(importance) as avg_importance
       FROM memories GROUP BY agent_id ORDER BY count DESC`
    ).all<{ agent_id: string; count: number; last_active: number; avg_importance: number }>();
    return json(rows.results ?? []);
  }

  // GET /api/stats
  if (pathname === '/api/stats' && request.method === 'GET') {
    const [totals, byImportance, lastRun] = await Promise.all([
      env.DB.prepare(`SELECT COUNT(*) as total, COUNT(DISTINCT agent_id) as agents FROM memories`)
        .first<{ total: number; agents: number }>(),
      env.DB.prepare(
        `SELECT importance, COUNT(*) as count FROM memories GROUP BY importance ORDER BY importance`
      ).all<{ importance: number; count: number }>(),
      env.DB.prepare(
        `SELECT * FROM consolidation_runs ORDER BY started_at DESC LIMIT 1`
      ).first<{ started_at: number; memories_before: number; memories_after: number; status: string }>(),
    ]);
    return json({
      total_memories: totals?.total ?? 0,
      total_agents: totals?.agents ?? 0,
      by_importance: byImportance.results ?? [],
      last_consolidation: lastRun ?? null,
    });
  }

  // GET /api/memories?agent_id=X&query=Y&limit=N
  if (pathname === '/api/memories' && request.method === 'GET') {
    const url = new URL(request.url);
    const agentId = url.searchParams.get('agent_id');
    const query = url.searchParams.get('query') ?? '';
    const limit = Math.min(200, parseInt(url.searchParams.get('limit') ?? '50', 10));

    let sql: string;
    const bindings: (string | number)[] = [];

    if (query) {
      sql = `SELECT m.id, m.agent_id, m.summary, m.tags, m.importance, m.created_at, m.updated_at
             FROM memories_fts fts JOIN memories m ON m.rowid = fts.rowid
             WHERE memories_fts MATCH ?`;
      bindings.push(query);
      if (agentId) { sql += ` AND m.agent_id = ?`; bindings.push(agentId); }
    } else {
      sql = `SELECT id, agent_id, summary, tags, importance, created_at, updated_at FROM memories WHERE 1=1`;
      if (agentId) { sql += ` AND agent_id = ?`; bindings.push(agentId); }
    }

    sql += ` ORDER BY importance DESC, updated_at DESC LIMIT ?`;
    bindings.push(limit);

    const rows = await env.DB.prepare(sql).bind(...bindings).all<{
      id: string; agent_id: string; summary: string; tags: string;
      importance: number; created_at: number; updated_at: number;
    }>();

    return json((rows.results ?? []).map(r => ({
      ...r,
      tags: JSON.parse(r.tags) as string[],
    })));
  }

  // GET /api/memory/:id
  const memMatch = pathname.match(/^\/api\/memory\/([^/]+)$/);
  if (memMatch) {
    const id = memMatch[1]!;

    if (request.method === 'GET') {
      const row = await env.DB.prepare(`SELECT * FROM memories WHERE id = ?`).bind(id).first<MemoryRow>();
      if (!row) return json({ error: 'Not found' }, 404);
      return json(rowToMemory(row));
    }

    if (request.method === 'DELETE') {
      const result = await env.DB.prepare(`DELETE FROM memories WHERE id = ?`).bind(id).run();
      return json({ deleted: (result.meta.changes ?? 0) > 0 });
    }

    if (request.method === 'PUT') {
      const body = await request.json() as Record<string, unknown>;
      const existing = await env.DB.prepare(`SELECT * FROM memories WHERE id = ?`).bind(id).first<MemoryRow>();
      if (!existing) return json({ error: 'Not found' }, 404);
      const content = String(body.content ?? existing.content);
      const summary = String(body.summary ?? existing.summary);
      const tags = JSON.stringify(Array.isArray(body.tags) ? body.tags : JSON.parse(existing.tags));
      const importance = Number(body.importance ?? existing.importance);
      await env.DB.prepare(
        `UPDATE memories SET content=?, summary=?, tags=?, importance=?, updated_at=? WHERE id=?`
      ).bind(content, summary, tags, importance, Date.now(), id).run();
      return json({ updated: true });
    }
  }

  // GET /api/consolidation-history
  if (pathname === '/api/consolidation-history' && request.method === 'GET') {
    const url = new URL(request.url);
    const agentId = url.searchParams.get('agent_id');
    let sql = `SELECT * FROM consolidation_runs`;
    const bindings: string[] = [];
    if (agentId) { sql += ` WHERE agent_id = ?`; bindings.push(agentId); }
    sql += ` ORDER BY started_at DESC LIMIT 20`;
    const rows = await env.DB.prepare(sql).bind(...bindings).all();
    return json(rows.results ?? []);
  }

  // POST /api/consolidate
  if (pathname === '/api/consolidate' && request.method === 'POST') {
    const body = await request.json() as { agent_id?: string; dry_run?: boolean };
    const result = await runConsolidation(
      env.DB, env.AI,
      body.agent_id ?? null,
      'manual',
      body.dry_run ?? false
    );
    return json(result);
  }

  return null;
}

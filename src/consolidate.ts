import { ulid } from 'ulid';
import { Memory, MemoryRow, rowToMemory } from './types.js';

export interface ConsolidationResult {
  run_id: string;
  agent_id: string | null;
  memories_before: number;
  memories_after: number;
  groups_processed: number;
  groups_merged: number;
  groups_skipped: number;
  ai_errors: string[];
  status: 'completed' | 'failed';
  error?: string;
}

interface AiConsolidated {
  content: string;
  summary: string;
  tags: string[];
  importance: number;
}

async function callAI(ai: Ai, memories: Memory[]): Promise<AiConsolidated[] | null> {
  const memoriesText = memories
    .map((m, i) =>
      `[${i + 1}] Summary: ${m.summary}\nContent: ${m.content}\nTags: ${m.tags.join(', ')}\nImportance: ${m.importance}`
    )
    .join('\n\n---\n\n');

  const prompt = `You are a memory consolidation assistant. Review these ${memories.length} memories and merge any that cover the same topic or contain redundant information. Keep memories that are about genuinely different topics separate.

Rules:
- Merge memories about the same subject into ONE concise memory
- Keep content to 2-4 sentences max per memory
- Summary must be 1-2 sentences
- Set importance to the highest value among merged memories
- Tags should be the union of merged memories (max 8 most relevant)
- Return a JSON array of the resulting memories (fewer than input if merges happened)
- Return ONLY valid JSON, no other text

Input memories:
${memoriesText}

Return exactly this format:
[{"content":"...","summary":"...","tags":["..."],"importance":3}]`;

  try {
    const response = await (ai as any).run('@cf/meta/llama-3.3-70b-instruct-fp8-fast', {
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 2048,
      stream: false,
    }) as unknown;

    // Cloudflare Workers AI can return various shapes; extract text robustly
    let text = '';
    if (typeof response === 'string') {
      text = response;
    } else if (response && typeof response === 'object') {
      const r = response as Record<string, unknown>;
      const raw = r['response'] ?? (r['result'] as Record<string,unknown> | undefined)?.['response'] ?? '';
      text = typeof raw === 'string' ? raw : JSON.stringify(raw);
    }
    text = text.trim();
    // Extract JSON array
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (!jsonMatch) return null;

    const parsed = JSON.parse(jsonMatch[0]) as unknown[];
    if (!Array.isArray(parsed) || parsed.length === 0) return null;

    return parsed
      .filter((item): item is Record<string, unknown> => typeof item === 'object' && item !== null)
      .map(item => ({
        content: String(item['content'] ?? ''),
        summary: String(item['summary'] ?? ''),
        tags: Array.isArray(item['tags']) ? (item['tags'] as unknown[]).map(String) : [],
        importance: Math.min(5, Math.max(1, Number(item['importance'] ?? 3))),
      }))
      .filter(m => m.content && m.summary);
  } catch (e) {
    throw new Error(`Workers AI error: ${e instanceof Error ? e.message : String(e)}`);
  }
}

function chunkMemories(memories: Memory[], chunkSize: number): Memory[][] {
  // Sort by tags alphabetically so topically related memories cluster
  const sorted = [...memories].sort((a, b) =>
    a.tags.join(',').localeCompare(b.tags.join(','))
  );
  const chunks: Memory[][] = [];
  for (let i = 0; i < sorted.length; i += chunkSize) {
    chunks.push(sorted.slice(i, i + chunkSize));
  }
  return chunks;
}

export async function runConsolidation(
  db: D1Database,
  ai: Ai,
  agentId: string | null,
  triggeredBy: 'cron' | 'agent' | 'manual',
  dryRun = false
): Promise<ConsolidationResult> {
  const runId = ulid();
  const now = Date.now();
  const aiErrors: string[] = [];

  if (!dryRun) {
    await db.prepare(
      `INSERT INTO consolidation_runs (id, agent_id, triggered_by, started_at, status)
       VALUES (?, ?, ?, ?, 'running')`
    ).bind(runId, agentId, triggeredBy, now).run();
  }

  try {
    let agentIds: string[];
    if (agentId) {
      agentIds = [agentId];
    } else {
      const rows = await db.prepare(`SELECT DISTINCT agent_id FROM memories`).all<{ agent_id: string }>();
      agentIds = (rows.results ?? []).map(r => r.agent_id);
    }

    let totalBefore = 0;
    let totalAfter = 0;
    let totalGroupsProcessed = 0;
    let totalGroupsMerged = 0;
    let totalGroupsSkipped = 0;

    for (const aid of agentIds) {
      // Only consolidate long_term memories — working_state is replaced, not merged
      const rows = await db
        .prepare(`SELECT * FROM memories WHERE agent_id = ? AND memory_class = 'long_term' ORDER BY importance DESC, updated_at DESC`)
        .bind(aid)
        .all<MemoryRow>();

      const memories = (rows.results ?? []).map(rowToMemory);
      totalBefore += memories.length;

      if (memories.length < 2) {
        totalAfter += memories.length;
        continue;
      }

      // Chunk memories into groups of 8 for AI processing
      const chunks = chunkMemories(memories, 8);

      for (const chunk of chunks) {
        totalGroupsProcessed++;

        let consolidated: AiConsolidated[] | null = null;
        try {
          consolidated = await callAI(ai, chunk);
        } catch (e) {
          aiErrors.push(e instanceof Error ? e.message : String(e));
          totalGroupsSkipped++;
          totalAfter += chunk.length;
          continue;
        }

        if (!consolidated || consolidated.length >= chunk.length) {
          // AI returned same count or failed — nothing to merge here
          totalAfter += chunk.length;
          if (!consolidated) totalGroupsSkipped++;
          continue;
        }

        // Merge happened
        totalGroupsMerged++;

        if (!dryRun) {
          // Delete originals
          for (const m of chunk) {
            await db.prepare(`DELETE FROM memories WHERE id = ?`).bind(m.id).run();
          }

          // Store consolidated memories
          const mergeNow = Date.now();
          for (const c of consolidated) {
            const newId = ulid();
            await db.prepare(
              `INSERT INTO memories (id, agent_id, content, summary, tags, importance, metadata, created_at, updated_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
            ).bind(
              newId, aid,
              c.content, c.summary,
              JSON.stringify(c.tags),
              c.importance,
              JSON.stringify({ consolidated_from: chunk.map(m => m.id), consolidated_at: mergeNow }),
              mergeNow, mergeNow
            ).run();
          }
        }

        totalAfter += consolidated.length;
      }
    }

    const result: ConsolidationResult = {
      run_id: runId,
      agent_id: agentId,
      memories_before: totalBefore,
      memories_after: totalAfter,
      groups_processed: totalGroupsProcessed,
      groups_merged: totalGroupsMerged,
      groups_skipped: totalGroupsSkipped,
      ai_errors: aiErrors,
      status: 'completed',
    };

    if (!dryRun) {
      await db.prepare(
        `UPDATE consolidation_runs
         SET status='completed', completed_at=?, memories_before=?, memories_after=?, groups_processed=?
         WHERE id=?`
      ).bind(Date.now(), totalBefore, totalAfter, totalGroupsProcessed, runId).run();
    }

    return result;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (!dryRun) {
      await db.prepare(
        `UPDATE consolidation_runs SET status='failed', completed_at=?, error=? WHERE id=?`
      ).bind(Date.now(), msg, runId).run();
    }
    return {
      run_id: runId,
      agent_id: agentId,
      memories_before: 0,
      memories_after: 0,
      groups_processed: 0,
      groups_merged: 0,
      groups_skipped: 0,
      ai_errors: aiErrors,
      status: 'failed',
      error: msg,
    };
  }
}

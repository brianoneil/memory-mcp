import { ulid } from 'ulid';
import { Memory, MemoryRow, rowToMemory } from './types.js';

export interface ConsolidationResult {
  run_id: string;
  agent_id: string | null;
  memories_before: number;
  memories_after: number;
  groups_processed: number;
  status: 'completed' | 'failed';
  error?: string;
}

interface AiConsolidated {
  content: string;
  summary: string;
  tags: string[];
  importance: number;
}

async function callAI(ai: Ai, memories: Memory[]): Promise<AiConsolidated | null> {
  const memoriesText = memories
    .map((m, i) =>
      `[${i + 1}] Summary: ${m.summary}\nContent: ${m.content}\nTags: ${m.tags.join(', ')}\nImportance: ${m.importance}`
    )
    .join('\n\n');

  const prompt = `You are a memory consolidation assistant. Merge the following related memories into ONE concise memory. Rules:
- Preserve all distinct facts; discard exact duplicates
- Keep content concise (2-4 sentences max)
- Summary must be 1-2 sentences
- Set importance to the highest value among the inputs
- Tags should be the union of all input tags (keep up to 8 most relevant)
- Return ONLY valid JSON, no other text

Memories to merge:
${memoriesText}

Return exactly this JSON structure:
{"content":"...","summary":"...","tags":["..."],"importance":1}`;

  try {
    const response = await (ai as any).run('@cf/meta/llama-3.1-8b-instruct', {
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 512,
    }) as { response?: string };

    const text = response?.response ?? '';
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;

    const parsed = JSON.parse(jsonMatch[0]) as Partial<AiConsolidated>;
    if (!parsed.content || !parsed.summary) return null;

    return {
      content: String(parsed.content),
      summary: String(parsed.summary),
      tags: Array.isArray(parsed.tags) ? parsed.tags.map(String) : [],
      importance: Math.min(5, Math.max(1, Number(parsed.importance) || 3)),
    };
  } catch {
    return null;
  }
}

function groupByTags(memories: Memory[]): Memory[][] {
  // Group memories that share at least 2 tags; singletons kept as-is
  const groups: Memory[][] = [];
  const assigned = new Set<string>();

  for (let i = 0; i < memories.length; i++) {
    if (assigned.has(memories[i]!.id)) continue;
    const group: Memory[] = [memories[i]!];
    assigned.add(memories[i]!.id);

    for (let j = i + 1; j < memories.length; j++) {
      if (assigned.has(memories[j]!.id)) continue;
      const sharedTags = memories[i]!.tags.filter(t => memories[j]!.tags.includes(t));
      if (sharedTags.length >= 2) {
        group.push(memories[j]!);
        assigned.add(memories[j]!.id);
      }
    }

    groups.push(group);
  }

  return groups;
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

  if (!dryRun) {
    await db.prepare(
      `INSERT INTO consolidation_runs (id, agent_id, triggered_by, started_at, status)
       VALUES (?, ?, ?, ?, 'running')`
    ).bind(runId, agentId, triggeredBy, now).run();
  }

  try {
    // Get all agents to process
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

    for (const aid of agentIds) {
      const rows = await db
        .prepare(`SELECT * FROM memories WHERE agent_id = ? ORDER BY importance DESC, updated_at DESC`)
        .bind(aid)
        .all<MemoryRow>();

      const memories = (rows.results ?? []).map(rowToMemory);
      if (memories.length < 2) {
        totalAfter += memories.length;
        totalBefore += memories.length;
        continue;
      }

      totalBefore += memories.length;
      const groups = groupByTags(memories);

      for (const group of groups) {
        totalGroupsProcessed++;

        if (group.length < 2) {
          // Nothing to consolidate in this group
          totalAfter++;
          continue;
        }

        const consolidated = await callAI(ai, group);
        if (!consolidated) {
          // AI failed for this group — leave originals untouched
          totalAfter += group.length;
          continue;
        }

        if (!dryRun) {
          // Delete originals
          for (const m of group) {
            await db.prepare(`DELETE FROM memories WHERE id = ?`).bind(m.id).run();
          }

          // Store consolidated memory
          const newId = ulid();
          const mergeNow = Date.now();
          await db.prepare(
            `INSERT INTO memories (id, agent_id, content, summary, tags, importance, metadata, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
          ).bind(
            newId, aid,
            consolidated.content, consolidated.summary,
            JSON.stringify(consolidated.tags),
            consolidated.importance,
            JSON.stringify({ consolidated_from: group.map(m => m.id), consolidated_at: mergeNow }),
            mergeNow, mergeNow
          ).run();
        }

        totalAfter++;
      }
    }

    if (!dryRun) {
      await db.prepare(
        `UPDATE consolidation_runs
         SET status='completed', completed_at=?, memories_before=?, memories_after=?, groups_processed=?
         WHERE id=?`
      ).bind(Date.now(), totalBefore, totalAfter, totalGroupsProcessed, runId).run();
    }

    return {
      run_id: runId,
      agent_id: agentId,
      memories_before: totalBefore,
      memories_after: totalAfter,
      groups_processed: totalGroupsProcessed,
      status: 'completed',
    };
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
      status: 'failed',
      error: msg,
    };
  }
}

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import { z } from 'zod';
import { ulid } from 'ulid';
import { Env } from './types.js';
import { storeMemory, getMemory, updateMemory, deleteMemory, recallMemories, listAgents, replaceWorkingState } from './db.js';
import { runConsolidation } from './consolidate.js';
import { handleApi } from './api.js';
import { getDashboardHTML } from './dashboard.js';

function authenticate(request: Request, env: Env): boolean {
  const auth = request.headers.get('Authorization') ?? '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7).trim() : '';
  return token === env.API_KEY;
}

function unauthorized(): Response {
  return new Response(JSON.stringify({ error: 'Unauthorized' }), {
    status: 401,
    headers: { 'Content-Type': 'application/json' },
  });
}

function createServer(env: Env): McpServer {
  const server = new McpServer({
    name: 'memory-mcp',
    version: '1.0.0',
  });

  // ── store_memory ──────────────────────────────────────────────────────────
  server.registerTool(
    'store_memory',
    {
      description:
        'Store a new long-term memory. Use this for facts that remain true over time: ' +
        'who the user is, their goals, relationships, preferences, key decisions, and ongoing projects. ' +
        'For current task context (what you\'re working on right now), use update_working_state instead. ' +
        'Set importance 1–5 (1=trivia, 3=useful, 5=critical).',
      inputSchema: {
        agent_id: z.string().min(1).describe('Unique identifier for the calling agent'),
        content: z.string().min(1).describe('Full memory content'),
        summary: z.string().min(1).describe('Short 1–2 sentence summary for fast scanning'),
        tags: z.array(z.string()).default([]).describe('Categorisation tags'),
        importance: z.number().int().min(1).max(5).default(3).describe('1=low 5=critical'),
        memory_class: z.enum(['long_term', 'working_state']).default('long_term').describe(
          'long_term = authoritative facts that persist indefinitely; ' +
          'working_state = current task context that decays in relevance over time'
        ),
        metadata: z.record(z.unknown()).default({}).describe('Optional freeform metadata'),
      },
    },
    async (args) => {
      const id = ulid();
      const now = Date.now();
      await storeMemory(env.DB, {
        id,
        agent_id: args.agent_id,
        content: args.content,
        summary: args.summary,
        tags: args.tags,
        importance: args.importance,
        memory_class: args.memory_class,
        metadata: args.metadata as Record<string, unknown>,
        now,
      });
      return {
        content: [{ type: 'text', text: JSON.stringify({ id, stored: true, memory_class: args.memory_class }) }],
      };
    }
  );

  // ── update_working_state ─────────────────────────────────────────────────
  server.registerTool(
    'update_working_state',
    {
      description:
        'Replace the current working-state for an agent in one atomic call. ' +
        'Deletes all previous working_state memories for this agent and stores a fresh one. ' +
        'Use this at the end of a session or whenever the task context changes significantly. ' +
        'Working-state decays in relevance over time — staleness_days is returned in recall results.',
      inputSchema: {
        agent_id: z.string().min(1).describe('Unique identifier for the calling agent'),
        content: z.string().min(1).describe('Full description of current task context'),
        summary: z.string().min(1).describe('Short 1–2 sentence summary for fast scanning'),
        tags: z.array(z.string()).default([]).describe('Categorisation tags'),
        importance: z.number().int().min(1).max(5).default(3).describe('1=low 5=critical'),
        metadata: z.record(z.unknown()).default({}).describe('Optional freeform metadata'),
      },
    },
    async (args) => {
      const id = ulid();
      const now = Date.now();
      const result = await replaceWorkingState(env.DB, {
        id,
        agent_id: args.agent_id,
        content: args.content,
        summary: args.summary,
        tags: args.tags,
        importance: args.importance,
        metadata: args.metadata as Record<string, unknown>,
        now,
      });
      return {
        content: [{ type: 'text', text: JSON.stringify({ id, ...result }) }],
      };
    }
  );

  // ── recall_memories ───────────────────────────────────────────────────────
  server.registerTool(
    'recall_memories',
    {
      description:
        'Search memories and return summaries + IDs. Use get_memory to fetch full content for specific results. ' +
        'Set cross_agent=true to search memories stored by other agents. ' +
        'Working-state results include staleness_days so you can gauge how stale the context is.',
      inputSchema: {
        agent_id: z.string().min(1).describe('Calling agent ID (used as default namespace)'),
        query: z.string().optional().describe('Full-text search query'),
        tags: z.array(z.string()).optional().describe('Filter by tags (AND logic)'),
        min_importance: z.number().int().min(1).max(5).default(1).describe('Minimum importance'),
        memory_class: z.enum(['long_term', 'working_state']).optional().describe('Filter by memory class; omit for both'),
        cross_agent: z.boolean().default(false).describe('Include memories from other agents'),
        limit: z.number().int().min(1).max(100).default(20).describe('Max results'),
      },
    },
    async (args) => {
      const results = await recallMemories(env.DB, {
        agent_id: args.agent_id,
        query: args.query,
        tags: args.tags,
        min_importance: args.min_importance,
        memory_class: args.memory_class,
        cross_agent: args.cross_agent,
        limit: args.limit,
      });
      return {
        content: [{ type: 'text', text: JSON.stringify(results) }],
      };
    }
  );

  // ── get_memory ────────────────────────────────────────────────────────────
  server.registerTool(
    'get_memory',
    {
      description: 'Fetch the full content of a memory by ID.',
      inputSchema: {
        id: z.string().min(1).describe('Memory ID from recall_memories'),
      },
    },
    async (args) => {
      const memory = await getMemory(env.DB, args.id);
      if (!memory) {
        return { content: [{ type: 'text', text: JSON.stringify({ error: 'Not found' }) }] };
      }
      return { content: [{ type: 'text', text: JSON.stringify(memory) }] };
    }
  );

  // ── update_memory ─────────────────────────────────────────────────────────
  server.registerTool(
    'update_memory',
    {
      description: 'Update an existing memory. Only supply fields you want to change.',
      inputSchema: {
        id: z.string().min(1).describe('Memory ID'),
        content: z.string().optional(),
        summary: z.string().optional(),
        tags: z.array(z.string()).optional(),
        importance: z.number().int().min(1).max(5).optional(),
        metadata: z.record(z.unknown()).optional(),
      },
    },
    async (args) => {
      const { id, ...patch } = args;
      const updated = await updateMemory(env.DB, id, patch as Parameters<typeof updateMemory>[2], Date.now());
      return {
        content: [{ type: 'text', text: JSON.stringify({ id, updated }) }],
      };
    }
  );

  // ── delete_memory ─────────────────────────────────────────────────────────
  server.registerTool(
    'delete_memory',
    {
      description: 'Permanently delete a memory by ID.',
      inputSchema: {
        id: z.string().min(1).describe('Memory ID'),
      },
    },
    async (args) => {
      const deleted = await deleteMemory(env.DB, args.id);
      return {
        content: [{ type: 'text', text: JSON.stringify({ id: args.id, deleted }) }],
      };
    }
  );

  // ── list_agents ───────────────────────────────────────────────────────────
  server.registerTool(
    'list_agents',
    {
      description: 'List all agent IDs that have stored memories, with total count and working_state_count.',
      inputSchema: {},
    },
    async () => {
      const agents = await listAgents(env.DB);
      return { content: [{ type: 'text', text: JSON.stringify(agents) }] };
    }
  );

  // ── get_current_time ─────────────────────────────────────────────────────
  server.registerTool(
    'get_current_time',
    {
      description:
        'Returns the current UTC date and time as a Unix timestamp (ms) and ISO 8601 string. ' +
        'Use this to determine how old working_state memories are — compare against their updated_at or staleness_days.',
      inputSchema: {},
    },
    async () => {
      const now = Date.now();
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({ now_ms: now, iso: new Date(now).toISOString() }),
        }],
      };
    }
  );

  // ── consolidate_memories ──────────────────────────────────────────────────
  server.registerTool(
    'consolidate_memories',
    {
      description:
        'Consolidate memories for an agent using AI — merges related memories into fewer, cleaner ones. ' +
        'Use dry_run=true to preview without making changes.',
      inputSchema: {
        agent_id: z.string().min(1).describe('Agent whose memories to consolidate'),
        dry_run: z.boolean().default(false).describe('Preview changes without writing'),
      },
    },
    async (args) => {
      const result = await runConsolidation(env.DB, env.AI, args.agent_id, 'agent', args.dry_run);
      return {
        content: [{ type: 'text', text: JSON.stringify(result) }],
      };
    }
  );

  return server;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const { pathname } = url;

    // Health check
    if (pathname === '/health') {
      return new Response(JSON.stringify({ ok: true, service: 'memory-mcp' }), {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Dashboard (no auth required for HTML — JS does auth via API key)
    if (pathname === '/' || pathname === '') {
      return new Response(getDashboardHTML(), {
        headers: { 'Content-Type': 'text/html; charset=utf-8' },
      });
    }

    // REST API (requires auth)
    if (pathname.startsWith('/api/')) {
      if (!authenticate(request, env)) return unauthorized();
      const apiResponse = await handleApi(request, env, pathname);
      if (apiResponse) return apiResponse;
    }

    // MCP endpoint
    if (pathname === '/mcp') {
      if (!authenticate(request, env)) return unauthorized();

      if (request.method === 'POST') {
        // Inject Accept header if missing — many MCP clients omit it
        const accept = request.headers.get('Accept') ?? '';
        const normalized = accept.includes('text/event-stream')
          ? request
          : new Request(request, {
              headers: new Headers({
                ...Object.fromEntries(request.headers),
                Accept: 'application/json, text/event-stream',
              }),
            });

        const server = createServer(env);
        const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined });
        await server.connect(transport);
        return transport.handleRequest(normalized);
      }

      return new Response('Method Not Allowed', { status: 405 });
    }

    return new Response('Not Found', { status: 404 });
  },

  async scheduled(_event: ScheduledEvent, env: Env): Promise<void> {
    await runConsolidation(env.DB, env.AI, null, 'cron', false);
  },
} satisfies ExportedHandler<Env>;

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { z } from 'zod';
import { ulid } from 'ulid';
import { Env } from './types.js';
import { storeMemory, getMemory, updateMemory, deleteMemory, recallMemories, listAgents } from './db.js';

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
        'Store a new memory. Provide a full content and a short summary (1–2 sentences). ' +
        'Set importance 1–5 (1=trivia, 3=useful, 5=critical). Add tags for easier recall later.',
      inputSchema: {
        agent_id: z.string().min(1).describe('Unique identifier for the calling agent'),
        content: z.string().min(1).describe('Full memory content'),
        summary: z.string().min(1).describe('Short 1–2 sentence summary for fast scanning'),
        tags: z.array(z.string()).default([]).describe('Categorisation tags'),
        importance: z.number().int().min(1).max(5).default(3).describe('1=low 5=critical'),
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
        metadata: args.metadata as Record<string, unknown>,
        now,
      });
      return {
        content: [{ type: 'text', text: JSON.stringify({ id, stored: true }) }],
      };
    }
  );

  // ── recall_memories ───────────────────────────────────────────────────────
  server.registerTool(
    'recall_memories',
    {
      description:
        'Search memories and return summaries + IDs. Use get_memory to fetch full content for specific results. ' +
        'Set cross_agent=true to search memories stored by other agents.',
      inputSchema: {
        agent_id: z.string().min(1).describe('Calling agent ID (used as default namespace)'),
        query: z.string().optional().describe('Full-text search query'),
        tags: z.array(z.string()).optional().describe('Filter by tags (AND logic)'),
        min_importance: z.number().int().min(1).max(5).default(1).describe('Minimum importance'),
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
      description: 'List all agent IDs that have stored memories, with counts.',
      inputSchema: {},
    },
    async () => {
      const agents = await listAgents(env.DB);
      return { content: [{ type: 'text', text: JSON.stringify(agents) }] };
    }
  );

  return server;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    // Health check
    if (url.pathname === '/health') {
      return new Response(JSON.stringify({ ok: true, service: 'memory-mcp' }), {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // MCP endpoint
    if (url.pathname === '/mcp') {
      if (!authenticate(request, env)) return unauthorized();

      if (request.method === 'POST') {
        const server = createServer(env);
        const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
        await server.connect(transport);
        const response = await transport.handleRequest(request);
        return response;
      }

      return new Response('Method Not Allowed', { status: 405 });
    }

    return new Response('Not Found', { status: 404 });
  },
} satisfies ExportedHandler<Env>;

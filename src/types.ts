export interface Env {
  DB: D1Database;
  API_KEY: string;
}

export interface Memory {
  id: string;
  agent_id: string;
  content: string;
  summary: string;
  tags: string[];
  importance: number;
  metadata: Record<string, unknown>;
  created_at: number;
  updated_at: number;
}

export interface MemoryRow {
  id: string;
  agent_id: string;
  content: string;
  summary: string;
  tags: string;
  importance: number;
  metadata: string;
  created_at: number;
  updated_at: number;
}

export function rowToMemory(row: MemoryRow): Memory {
  return {
    ...row,
    tags: JSON.parse(row.tags) as string[],
    metadata: JSON.parse(row.metadata) as Record<string, unknown>,
  };
}

export interface MemorySummary {
  id: string;
  agent_id: string;
  summary: string;
  tags: string[];
  importance: number;
  created_at: number;
}

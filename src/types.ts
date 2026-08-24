export interface Env {
  DB: D1Database;
  API_KEY: string;
  AI: Ai;
}

export type MemoryClass = 'long_term' | 'working_state';

export interface Memory {
  id: string;
  agent_id: string;
  content: string;
  summary: string;
  tags: string[];
  importance: number;
  memory_class: MemoryClass;
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
  memory_class: MemoryClass;
  metadata: string;
  created_at: number;
  updated_at: number;
}

export function rowToMemory(row: MemoryRow): Memory {
  return {
    ...row,
    tags: JSON.parse(row.tags) as string[],
    metadata: JSON.parse(row.metadata) as Record<string, unknown>,
    memory_class: (row.memory_class ?? 'long_term') as MemoryClass,
  };
}

export interface MemorySummary {
  id: string;
  agent_id: string;
  summary: string;
  tags: string[];
  importance: number;
  memory_class: MemoryClass;
  staleness_days?: number;
  created_at: number;
}

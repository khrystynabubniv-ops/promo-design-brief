import { randomUUID } from 'crypto';
import { Pool } from 'pg';
import type { GenerationHistoryItem, GenerationHistoryTool } from './types';

const HISTORY_RETENTION_DAYS = 30;
const HISTORY_DEFAULT_LIMIT = 100;
const HISTORY_MAX_LIMIT = 300;

type SaveGenerationHistoryParams = {
  durationMs?: number;
  input: unknown;
  output: unknown;
  title: string;
  tool: GenerationHistoryTool;
};

let pool: Pool | null = null;
let schemaReadyPromise: Promise<void> | null = null;

function getDatabaseUrl() {
  return process.env.DATABASE_URL || process.env.POSTGRES_URL || '';
}

function getPool() {
  const databaseUrl = getDatabaseUrl();

  if (!databaseUrl) {
    return null;
  }

  if (!pool) {
    pool = new Pool({
      connectionString: databaseUrl,
      ssl: databaseUrl.includes('railway.internal')
        ? false
        : {
            rejectUnauthorized: false,
          },
    });
  }

  return pool;
}

async function ensureGenerationHistoryTable(currentPool: Pool) {
  if (!schemaReadyPromise) {
    schemaReadyPromise = currentPool.query(`
      CREATE TABLE IF NOT EXISTS generation_history (
        id TEXT PRIMARY KEY,
        tool TEXT NOT NULL,
        title TEXT NOT NULL,
        input JSONB NOT NULL,
        output JSONB NOT NULL,
        duration_ms INTEGER,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE INDEX IF NOT EXISTS generation_history_created_at_idx
        ON generation_history (created_at DESC);

      CREATE INDEX IF NOT EXISTS generation_history_tool_created_at_idx
        ON generation_history (tool, created_at DESC);
    `).then(() => undefined);
  }

  await schemaReadyPromise;
}

function normalizeLimit(value: number | undefined) {
  if (!value || !Number.isFinite(value)) {
    return HISTORY_DEFAULT_LIMIT;
  }

  return Math.min(HISTORY_MAX_LIMIT, Math.max(1, Math.round(value)));
}

function mapHistoryRow(row: {
  created_at: Date | string;
  duration_ms: number | null;
  id: string;
  input: unknown;
  output: unknown;
  title: string;
  tool: GenerationHistoryTool;
}): GenerationHistoryItem {
  const createdAt = row.created_at instanceof Date
    ? row.created_at.toISOString()
    : new Date(row.created_at).toISOString();

  return {
    createdAt,
    durationMs: row.duration_ms ?? undefined,
    id: row.id,
    input: row.input,
    output: row.output,
    title: row.title,
    tool: row.tool,
  };
}

export function isGenerationHistoryConfigured() {
  return Boolean(getDatabaseUrl());
}

export async function pruneOldGenerationHistory() {
  const currentPool = getPool();

  if (!currentPool) {
    return;
  }

  await ensureGenerationHistoryTable(currentPool);
  await currentPool.query(
    `DELETE FROM generation_history
     WHERE created_at < NOW() - ($1::int * INTERVAL '1 day')`,
    [HISTORY_RETENTION_DAYS],
  );
}

export async function saveGenerationHistory(params: SaveGenerationHistoryParams) {
  const currentPool = getPool();

  if (!currentPool) {
    return null;
  }

  await ensureGenerationHistoryTable(currentPool);
  await pruneOldGenerationHistory();

  const id = randomUUID();
  const result = await currentPool.query(
    `INSERT INTO generation_history (
       id,
       tool,
       title,
       input,
       output,
       duration_ms
     )
     VALUES ($1, $2, $3, $4::jsonb, $5::jsonb, $6)
     RETURNING id, tool, title, input, output, duration_ms, created_at`,
    [
      id,
      params.tool,
      params.title,
      JSON.stringify(params.input),
      JSON.stringify(params.output),
      params.durationMs ?? null,
    ],
  );

  return mapHistoryRow(result.rows[0]);
}

export async function saveGenerationHistorySafely(params: SaveGenerationHistoryParams) {
  try {
    return await saveGenerationHistory(params);
  } catch (error) {
    console.warn('[generation-history] failed to save generation', {
      error: error instanceof Error ? error.message : 'unknown error',
      tool: params.tool,
    });

    return null;
  }
}

export async function getRecentGenerationHistory(options: {
  limit?: number;
  tool?: GenerationHistoryTool;
} = {}) {
  const currentPool = getPool();

  if (!currentPool) {
    return [];
  }

  await ensureGenerationHistoryTable(currentPool);
  await pruneOldGenerationHistory();

  const limit = normalizeLimit(options.limit);
  const queryParams: Array<string | number> = [HISTORY_RETENTION_DAYS, limit];
  const toolFilter = options.tool
    ? 'AND tool = $3'
    : '';

  if (options.tool) {
    queryParams.push(options.tool);
  }

  const result = await currentPool.query(
    `SELECT id, tool, title, input, output, duration_ms, created_at
     FROM generation_history
     WHERE created_at >= NOW() - ($1::int * INTERVAL '1 day')
       ${toolFilter}
     ORDER BY created_at DESC
     LIMIT $2`,
    queryParams,
  );

  return result.rows.map(mapHistoryRow);
}

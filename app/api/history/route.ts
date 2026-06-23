import { NextResponse } from 'next/server';
import {
  getRecentGenerationHistory,
  isGenerationHistoryConfigured,
} from '@/lib/generationHistory';
import type { GenerationHistoryTool } from '@/lib/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const allowedTools = new Set<GenerationHistoryTool>(['articles', 'brief', 'smm', 'merch']);

function parseLimit(value: string | null) {
  const parsed = Number.parseInt(value ?? '', 10);

  return Number.isFinite(parsed) ? parsed : undefined;
}

function parseTool(value: string | null): GenerationHistoryTool | undefined {
  if (!value || !allowedTools.has(value as GenerationHistoryTool)) {
    return undefined;
  }

  return value as GenerationHistoryTool;
}

export async function GET(request: Request) {
  const startedAt = Date.now();
  const url = new URL(request.url);

  try {
    const storageConfigured = isGenerationHistoryConfigured();
    const items = storageConfigured
      ? await getRecentGenerationHistory({
          limit: parseLimit(url.searchParams.get('limit')),
          tool: parseTool(url.searchParams.get('tool')),
        })
      : [];

    return NextResponse.json(
      {
        durationMs: Date.now() - startedAt,
        items,
        retentionDays: 30,
        storageConfigured,
      },
      {
        headers: {
          'Cache-Control': 'no-store',
        },
      },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Не вдалося прочитати історію.';

    console.error('[generation-history] failed to read history', {
      durationMs: Date.now() - startedAt,
      error: message,
    });

    return NextResponse.json(
      {
        durationMs: Date.now() - startedAt,
        error: message,
        items: [],
        retentionDays: 30,
        storageConfigured: isGenerationHistoryConfigured(),
      },
      { status: 500 },
    );
  }
}

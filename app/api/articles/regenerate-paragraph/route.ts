import { NextResponse } from 'next/server';
import { regenerateArticleParagraph } from '@/features/articles/lib/generate';
import { regenerateParagraphRequestSchema } from '@/features/articles/lib/schema';

export const runtime = 'nodejs';
export const maxDuration = 90;

export async function POST(request: Request) {
  const startedAt = Date.now();

  try {
    if (!process.env.OPENROUTER_API_KEY || process.env.OPENROUTER_API_KEY === 'your_key_here') {
      return NextResponse.json(
        {
          durationMs: Date.now() - startedAt,
          error: 'OPENROUTER_API_KEY не налаштовано в .env.local або Railway variables.',
        },
        { status: 500 },
      );
    }

    const rawBody: unknown = await request.json();
    const parsedRequest = regenerateParagraphRequestSchema.safeParse(rawBody);

    if (!parsedRequest.success) {
      return NextResponse.json(
        {
          durationMs: Date.now() - startedAt,
          error: 'Не вдалося перегенерувати абзац: бракує тексту або контексту.',
        },
        { status: 400 },
      );
    }

    const paragraph = await regenerateArticleParagraph(parsedRequest.data);

    return NextResponse.json({
      durationMs: Date.now() - startedAt,
      paragraph: paragraph.trim(),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Не вдалося перегенерувати абзац.';

    console.error('[articles/regenerate-paragraph] failed', {
      durationMs: Date.now() - startedAt,
      error: message,
    });

    return NextResponse.json(
      {
        durationMs: Date.now() - startedAt,
        error: message,
      },
      { status: 500 },
    );
  }
}

import { NextResponse } from 'next/server';
import { extractStyle } from '@/features/articles/lib/extractStyle';
import { extractStyleRequestSchema } from '@/features/articles/lib/schema';

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
    const parsedRequest = extractStyleRequestSchema.safeParse(rawBody);

    if (!parsedRequest.success) {
      return NextResponse.json(
        {
          durationMs: Date.now() - startedAt,
          error: 'Заповніть імʼя, посаду й додайте до трьох текстів або опис TOV.',
        },
        { status: 400 },
      );
    }

    const card = await extractStyle(parsedRequest.data);

    return NextResponse.json({
      card,
      durationMs: Date.now() - startedAt,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Не вдалося витягнути стиль.';

    console.error('[articles/extract-style] failed', {
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

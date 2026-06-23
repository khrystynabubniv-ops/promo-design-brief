import { NextResponse } from 'next/server';
import { saveGenerationHistorySafely } from '@/lib/generationHistory';
import { generateArticleDraft } from '@/features/articles/lib/generate';
import { generateArticleRequestSchema } from '@/features/articles/lib/schema';

export const runtime = 'nodejs';
export const maxDuration = 180;

const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX_REQUESTS = 8;

type RateLimitBucket = {
  count: number;
  resetAt: number;
};

const rateLimitBuckets = new Map<string, RateLimitBucket>();

function getClientKey(request: Request) {
  const forwardedFor = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim();
  const realIp = request.headers.get('x-real-ip')?.trim();

  return forwardedFor || realIp || 'local';
}

function checkRateLimit(key: string) {
  const now = Date.now();
  const currentBucket = rateLimitBuckets.get(key);

  if (!currentBucket || currentBucket.resetAt <= now) {
    rateLimitBuckets.set(key, {
      count: 1,
      resetAt: now + RATE_LIMIT_WINDOW_MS,
    });

    return { allowed: true, retryAfterSeconds: 0 };
  }

  if (currentBucket.count >= RATE_LIMIT_MAX_REQUESTS) {
    return {
      allowed: false,
      retryAfterSeconds: Math.ceil((currentBucket.resetAt - now) / 1000),
    };
  }

  currentBucket.count += 1;
  rateLimitBuckets.set(key, currentBucket);

  return { allowed: true, retryAfterSeconds: 0 };
}

function deriveHistoryTitle(topic: string) {
  return topic.length > 76 ? `${topic.slice(0, 76)}...` : topic;
}

export async function POST(request: Request) {
  const startedAt = Date.now();
  const rateLimit = checkRateLimit(getClientKey(request));

  if (!rateLimit.allowed) {
    return NextResponse.json(
      {
        durationMs: Date.now() - startedAt,
        error: `Забагато запитів. Спробуйте ще раз за ${rateLimit.retryAfterSeconds} с.`,
      },
      { status: 429 },
    );
  }

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
    const parsedRequest = generateArticleRequestSchema.safeParse(rawBody);

    if (!parsedRequest.success) {
      return NextResponse.json(
        {
          durationMs: Date.now() - startedAt,
          error: 'Перевірте бриф: тема обовʼязкова, факти та повторювані рядки мають бути заповнені.',
        },
        { status: 400 },
      );
    }

    const result = await generateArticleDraft(parsedRequest.data.brief, parsedRequest.data.speakers);
    const durationMs = Date.now() - startedAt;
    const historyItem = await saveGenerationHistorySafely({
      durationMs,
      input: parsedRequest.data.brief,
      output: result.draft,
      title: deriveHistoryTitle(parsedRequest.data.brief.topic),
      tool: 'articles',
    });

    return NextResponse.json({
      durationMs,
      historyItem,
      result,
    });
  } catch (error) {
    const durationMs = Date.now() - startedAt;
    const message = error instanceof Error ? error.message : 'Сталася помилка генерації статті.';

    console.error('[articles/generate] failed', {
      durationMs,
      error: message,
    });

    return NextResponse.json(
      {
        durationMs,
        error: message,
      },
      { status: 500 },
    );
  }
}

import { NextResponse } from 'next/server';
import { saveGenerationHistorySafely } from '@/lib/generationHistory';
import { generateSmmResult } from '@/lib/openrouter';
import { smmGenerateRequestSchema } from '@/lib/schema';

export const runtime = 'nodejs';
export const maxDuration = 180;

const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX_REQUESTS = 8;

type RateLimitBucket = {
  count: number;
  resetAt: number;
};

const rateLimitBuckets = new Map<string, RateLimitBucket>();

function deriveHistoryTitle(material: string) {
  const firstLine = material
    .split('\n')
    .map((line) => line.replace(/^#+\s*/, '').replaceAll('*', '').trim())
    .find(Boolean);

  if (!firstLine) {
    return 'SMM генерація';
  }

  return firstLine.length > 76 ? `${firstLine.slice(0, 76)}...` : firstLine;
}

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
    const parsedRequest = smmGenerateRequestSchema.safeParse(rawBody);

    if (!parsedRequest.success) {
      return NextResponse.json(
        {
          durationMs: Date.now() - startedAt,
          error: 'Перевірте поля форми: матеріал обовʼязковий, а селекти мають бути з дозволених значень.',
        },
        { status: 400 },
      );
    }

    const result = await generateSmmResult(parsedRequest.data);
    const durationMs = Date.now() - startedAt;

    const historyItem = await saveGenerationHistorySafely({
      durationMs,
      input: parsedRequest.data,
      output: result,
      title: deriveHistoryTitle(parsedRequest.data.material),
      tool: 'smm',
    });

    console.info('[generate-smm] completed', {
      durationMs,
      format: parsedRequest.data.format,
      platform: parsedRequest.data.platform,
      contentType: parsedRequest.data.contentType,
    });

    return NextResponse.json({
      durationMs,
      historyItem,
      result,
    });
  } catch (error) {
    const durationMs = Date.now() - startedAt;
    const message = error instanceof Error ? error.message : 'Сталася помилка генерації.';

    console.error('[generate-smm] failed', {
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

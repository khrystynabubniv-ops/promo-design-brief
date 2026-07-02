import { NextResponse } from 'next/server';
import { saveGenerationHistorySafely } from '@/lib/generationHistory';
import { reviseSmmResult } from '@/lib/openrouter';
import { smmReviseRequestSchema } from '@/lib/schema';

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
    return 'Доопрацювання SMM';
  }

  const title = firstLine.length > 60 ? `${firstLine.slice(0, 60)}...` : firstLine;

  return `Доопрацювання: ${title}`;
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
    const parsedRequest = smmReviseRequestSchema.safeParse(rawBody);

    if (!parsedRequest.success) {
      return NextResponse.json(
        {
          durationMs: Date.now() - startedAt,
          error: 'Перевірте правку та наявність попереднього SMM результату.',
        },
        { status: 400 },
      );
    }

    const result = await reviseSmmResult(parsedRequest.data);
    const durationMs = Date.now() - startedAt;

    const historyItem = await saveGenerationHistorySafely({
      durationMs,
      input: {
        ...parsedRequest.data.form,
        revisionInstruction: parsedRequest.data.instruction,
        revisedFrom: parsedRequest.data.result,
      },
      output: result,
      title: deriveHistoryTitle(parsedRequest.data.form.material),
      tool: 'smm',
    });

    console.info('[revise-smm] completed', {
      durationMs,
      format: parsedRequest.data.form.format,
      platform: parsedRequest.data.form.platform,
      contentType: parsedRequest.data.form.contentType,
    });

    return NextResponse.json({
      durationMs,
      historyItem,
      result,
    });
  } catch (error) {
    const durationMs = Date.now() - startedAt;
    const message = error instanceof Error ? error.message : 'Сталася помилка доопрацювання.';

    console.error('[revise-smm] failed', {
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

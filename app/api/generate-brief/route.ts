import { NextResponse } from 'next/server';

const OPENROUTER_API_URL = 'https://openrouter.ai/api/v1/chat/completions';
const DEFAULT_OPENROUTER_MODEL = 'anthropic/claude-sonnet-4';
const DEFAULT_OPENROUTER_TITLE = 'Brief Generator';

type OpenRouterResponse = {
  choices?: Array<{
    message?: {
      content?: string;
    };
  }>;
  error?: {
    message?: string;
  };
};

function toAsciiHeaderValue(value: string | undefined) {
  const asciiValue = value?.replace(/[^\x20-\x7E]/g, '').trim();
  return asciiValue || DEFAULT_OPENROUTER_TITLE;
}

function toAsciiUrlHeaderValue(value: string | undefined) {
  if (!value) {
    return undefined;
  }

  try {
    const url = new URL(value);

    if (!['http:', 'https:'].includes(url.protocol)) {
      return undefined;
    }

    const normalizedUrl = url.toString();
    return /^[\x20-\x7E]+$/.test(normalizedUrl) ? normalizedUrl : undefined;
  } catch {
    return undefined;
  }
}

export async function POST(req: Request) {
  try {
    if (!process.env.OPENROUTER_API_KEY || process.env.OPENROUTER_API_KEY === 'your_key_here') {
      return NextResponse.json(
        { error: 'OPENROUTER_API_KEY не налаштовано в .env.local або Railway variables.' },
        { status: 500 },
      );
    }

    const { vacancies, systemPrompt } = await req.json();

    if (!vacancies || !systemPrompt) {
      return NextResponse.json(
        { error: 'Передайте vacancies і systemPrompt.' },
        { status: 400 },
      );
    }

    const headers: Record<string, string> = {
      Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
      'Content-Type': 'application/json',
      'X-Title': toAsciiHeaderValue(process.env.NEXT_PUBLIC_APP_TITLE),
    };

    const siteUrl = toAsciiUrlHeaderValue(process.env.OPENROUTER_SITE_URL);

    if (siteUrl) {
      headers['HTTP-Referer'] = siteUrl;
    }

    const response = await fetch(OPENROUTER_API_URL, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model: process.env.OPENROUTER_MODEL ?? DEFAULT_OPENROUTER_MODEL,
        max_tokens: 4000,
        temperature: 0.7,
        messages: [
          {
            role: 'system',
            content: systemPrompt,
          },
          {
            role: 'user',
            content: `Ось список вакансій:\n\n${vacancies}\n\nНапиши бриф на дизайнера.`,
          },
        ],
      }),
    });

    const data = (await response.json()) as OpenRouterResponse;

    if (!response.ok) {
      throw new Error(
        data.error?.message ?? `OpenRouter API повернув помилку ${response.status}.`,
      );
    }

    const brief = data.choices?.[0]?.message?.content ?? '';

    if (!brief) {
      throw new Error('OpenRouter API не повернув текст брифу.');
    }

    return NextResponse.json({ brief });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : 'OpenRouter API повернув невідому помилку.',
      },
      { status: 500 },
    );
  }
}

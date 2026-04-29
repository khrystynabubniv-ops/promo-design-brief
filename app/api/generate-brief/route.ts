import { NextResponse } from 'next/server';

const OPENROUTER_API_URL = 'https://openrouter.ai/api/v1/chat/completions';
const DEFAULT_OPENROUTER_MODEL = 'anthropic/claude-sonnet-4';
const DEFAULT_OPENROUTER_TITLE = 'Brief Generator';
const BRIEF_GENERATION_GUARDRAILS = `Критичні правила, які мають вищий пріоритет за стилістичні побажання:

1. Назви вакансій з вхідного тексту треба зберігати дослівно.
   - Не перекладай назви.
   - Не скорочуй назви.
   - Не перефразовуй назви.
   - Не додавай нові слова до назв.
   - Якщо назва подана як Markdown heading, прибери тільки службові символи Markdown (#, **), але залиш саму назву без зміни.

2. Бриф повинен бути читабельним Markdown:
   - Не використовуй code fence.
   - Використовуй заголовки ## та ###.
   - Кожну вакансію оформлюй як: ### **[точна назва вакансії]**
   - Став порожній рядок між секціями, концептами та списками.
   - Використовуй жирний текст для labels: **Лінки:**, **Формат:**, **Тексти:**.
   - Використовуй bullet lists замість довгих суцільних абзаців.

3. Для кожної вакансії створи рівно 3 окремі креативні концепції.
   - Якщо в інпуті 1 вакансія, має бути 3 концепції.
   - Якщо в інпуті 3 вакансії, має бути 9 концепцій: по 3 для кожної вакансії.
   - Не роби 3 концепції на весь пакет вакансій.
   - Не об'єднуй кілька вакансій в один блок.

4. Якщо у вхідному тексті є кілька вакансій, збережи всі вакансії в тому самому порядку.`;

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
        max_tokens: 8000,
        temperature: 0.7,
        messages: [
          {
            role: 'system',
            content: `${systemPrompt}\n\n${BRIEF_GENERATION_GUARDRAILS}`,
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

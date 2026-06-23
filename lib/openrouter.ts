import { SMM_SYSTEM_PROMPT } from './systemPrompt';
import { buildSmmUserMessage } from './userMessage';
import {
  captionResultSchema,
  carouselResultSchema,
  type CaptionResult,
  type CarouselResult,
  type SmmAtomicFormat,
  type SmmGenerateRequest,
  type SmmGenerationResult,
} from './schema';

const OPENROUTER_API_URL = 'https://openrouter.ai/api/v1/chat/completions';
const DEFAULT_OPENROUTER_MODEL = 'anthropic/claude-sonnet-4.6';
const DEFAULT_OPENROUTER_TEMPERATURE = 0.8;
const DEFAULT_OPENROUTER_TIMEOUT_MS = 120000;
const OPENROUTER_RETRY_DELAYS_MS = [800, 1800];

type OpenRouterMessage = {
  role: 'system' | 'user' | 'assistant';
  content: string;
};

type OpenRouterChoice = {
  message?: {
    content?: string;
  };
  finish_reason?: string | null;
  native_finish_reason?: string | null;
};

type OpenRouterResponse = {
  choices?: OpenRouterChoice[];
  error?: {
    message?: string;
  };
};

type CompletionRequest = {
  format: SmmAtomicFormat;
  messages: OpenRouterMessage[];
};

function toAsciiHeaderValue(value: string | undefined, fallbackValue: string) {
  const asciiValue = value?.replace(/[^\x20-\x7E]/g, '').trim();
  return asciiValue || fallbackValue;
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

function getOpenRouterTemperature() {
  const configuredValue = Number.parseFloat(process.env.OPENROUTER_TEMPERATURE ?? '');

  return Number.isFinite(configuredValue)
    ? configuredValue
    : DEFAULT_OPENROUTER_TEMPERATURE;
}

function getOpenRouterTimeoutMs() {
  const configuredValue = Number.parseInt(process.env.OPENROUTER_TIMEOUT_MS ?? '', 10);

  return Number.isFinite(configuredValue) && configuredValue > 0
    ? configuredValue
    : DEFAULT_OPENROUTER_TIMEOUT_MS;
}

function getMaxTokens(format: SmmAtomicFormat) {
  return format === 'caption' ? 1500 : 5000;
}

function getHeaders() {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
    'Content-Type': 'application/json',
    'X-Title': toAsciiHeaderValue(process.env.NEXT_PUBLIC_APP_TITLE, 'SMM Universe Generator'),
  };
  const siteUrl = toAsciiUrlHeaderValue(process.env.OPENROUTER_SITE_URL);

  if (siteUrl) {
    headers['HTTP-Referer'] = siteUrl;
  }

  return headers;
}

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs: number) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, {
      ...init,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeoutId);
  }
}

function getNetworkErrorMessage(error: unknown, timeoutMs: number) {
  if (error instanceof DOMException && error.name === 'AbortError') {
    return `OpenRouter API не відповів за ${Math.round(timeoutMs / 1000)} секунд. Спробуйте ще раз або скоротіть матеріал.`;
  }

  if (error instanceof Error) {
    return `OpenRouter API недоступний: ${error.message}`;
  }

  return 'OpenRouter API недоступний через невідому мережеву помилку.';
}

async function parseJsonResponse<T>(response: Response): Promise<T> {
  const responseText = await response.text();

  if (!responseText.trim()) {
    return {} as T;
  }

  try {
    return JSON.parse(responseText) as T;
  } catch {
    throw new Error('OpenRouter API повернув відповідь у неочікуваному форматі.');
  }
}

function wait(ms: number) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function shouldRetryStatus(status: number) {
  return status === 429 || status >= 500;
}

function stripJsonFence(value: string) {
  return value
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();
}

function parseAndValidateCompletion(content: string, format: SmmAtomicFormat) {
  let parsed: unknown;

  try {
    parsed = JSON.parse(stripJsonFence(content));
  } catch {
    throw new Error('Модель повернула невалідний JSON.');
  }

  return format === 'caption'
    ? captionResultSchema.parse(parsed)
    : carouselResultSchema.parse(parsed);
}

function buildJsonRepairPrompt(format: SmmAtomicFormat, error: unknown) {
  const details = error instanceof Error ? error.message : 'JSON не пройшов валідацію.';
  const schemaName = format === 'caption' ? 'Caption' : 'Carousel';

  return `Попередня відповідь не підходить під схему ${schemaName}: ${details}

Поверни лише валідний JSON за потрібною схемою. Не додавай markdown, бектики або пояснення.`;
}

async function requestOpenRouterCompletion({ format, messages }: CompletionRequest) {
  const timeoutMs = getOpenRouterTimeoutMs();
  let lastErrorMessage = '';

  for (let attempt = 0; attempt <= OPENROUTER_RETRY_DELAYS_MS.length; attempt += 1) {
    const response = await fetchWithTimeout(
      OPENROUTER_API_URL,
      {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({
          model: process.env.OPENROUTER_MODEL ?? DEFAULT_OPENROUTER_MODEL,
          max_tokens: getMaxTokens(format),
          temperature: getOpenRouterTemperature(),
          messages,
        }),
      },
      timeoutMs,
    ).catch((error: unknown) => {
      throw new Error(getNetworkErrorMessage(error, timeoutMs));
    });

    const data = await parseJsonResponse<OpenRouterResponse>(response);

    if (response.ok) {
      const content = data.choices?.[0]?.message?.content ?? '';

      if (!content.trim()) {
        throw new Error('OpenRouter API не повернув текст відповіді.');
      }

      return content;
    }

    lastErrorMessage = data.error?.message ?? `OpenRouter API повернув помилку ${response.status}.`;

    if (!shouldRetryStatus(response.status) || attempt === OPENROUTER_RETRY_DELAYS_MS.length) {
      break;
    }

    await wait(OPENROUTER_RETRY_DELAYS_MS[attempt]);
  }

  throw new Error(lastErrorMessage || 'OpenRouter API повернув невідому помилку.');
}

export async function generateSmmContent(
  params: SmmGenerateRequest,
  format: SmmAtomicFormat,
): Promise<CaptionResult | CarouselResult> {
  const baseMessages: OpenRouterMessage[] = [
    {
      role: 'system',
      content: SMM_SYSTEM_PROMPT,
    },
    {
      role: 'user',
      content: buildSmmUserMessage(params, format),
    },
  ];
  const firstContent = await requestOpenRouterCompletion({
    format,
    messages: baseMessages,
  });

  try {
    return parseAndValidateCompletion(firstContent, format);
  } catch (validationError) {
    console.warn('[generate-smm] invalid model JSON, retrying once', {
      format,
      error: validationError instanceof Error ? validationError.message : 'unknown validation error',
    });

    const repairedContent = await requestOpenRouterCompletion({
      format,
      messages: [
        ...baseMessages,
        {
          role: 'assistant',
          content: firstContent,
        },
        {
          role: 'user',
          content: buildJsonRepairPrompt(format, validationError),
        },
      ],
    });

    try {
      return parseAndValidateCompletion(repairedContent, format);
    } catch (secondValidationError) {
      const details = secondValidationError instanceof Error
        ? secondValidationError.message
        : 'JSON не пройшов валідацію.';

      throw new Error(`Модель двічі повернула відповідь не у потрібній JSON-схемі. ${details}`);
    }
  }
}

export async function generateSmmResult(params: SmmGenerateRequest): Promise<SmmGenerationResult> {
  if (params.format === 'both') {
    const [captions, carousel] = await Promise.all([
      generateSmmContent(params, 'caption') as Promise<CaptionResult>,
      generateSmmContent(params, 'carousel') as Promise<CarouselResult>,
    ]);

    return { captions, carousel };
  }

  if (params.format === 'caption') {
    return {
      captions: await generateSmmContent(params, 'caption') as CaptionResult,
    };
  }

  return {
    carousel: await generateSmmContent(params, 'carousel') as CarouselResult,
  };
}

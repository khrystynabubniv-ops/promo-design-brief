import { SMM_SYSTEM_PROMPT } from './systemPrompt';
import { buildSmmCarouselVariantUserMessage, buildSmmUserMessage } from './userMessage';
import {
  captionResultSchema,
  carouselResultSchema,
  carouselVariantSchema,
  type CaptionResult,
  type CarouselResult,
  type CarouselVariant,
  merchIdeasResultSchema,
  type MerchIdeasRequest,
  type MerchIdeasResult,
  type SmmAtomicFormat,
  type SmmGenerateRequest,
  type SmmGenerationResult,
} from './schema';

const OPENROUTER_API_URL = 'https://openrouter.ai/api/v1/chat/completions';
const DEFAULT_OPENROUTER_MODEL = 'anthropic/claude-sonnet-4.6';
const DEFAULT_OPENROUTER_TEMPERATURE = 0.8;
const DEFAULT_OPENROUTER_TIMEOUT_MS = 120000;
const OPENROUTER_RETRY_DELAYS_MS = [800, 1800];
const CAROUSEL_VARIANT_CONCURRENCY = 2;

type OpenRouterMessage = {
  role: 'system' | 'user' | 'assistant';
  content: string;
};

type OpenRouterMessageContent = string | Array<{ type: string; text?: string }>;

type OpenRouterChoice = {
  message?: {
    content?: OpenRouterMessageContent;
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

type OpenRouterTool = {
  type: 'openrouter:web_search';
  parameters?: {
    engine?: 'auto' | 'native' | 'exa' | 'firecrawl' | 'parallel' | 'perplexity';
    max_results?: number;
    max_total_results?: number;
    search_context_size?: 'low' | 'medium' | 'high';
  };
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

function getMerchMaxTokens(ideasCount: number) {
  return Math.min(14000, Math.max(4000, ideasCount * 1400 + 1500));
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

function extractJsonObject(value: string) {
  const strippedValue = stripJsonFence(value);
  const firstBraceIndex = strippedValue.indexOf('{');

  if (firstBraceIndex === -1) {
    return strippedValue;
  }

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let index = firstBraceIndex; index < strippedValue.length; index += 1) {
    const character = strippedValue[index];

    if (escaped) {
      escaped = false;
      continue;
    }

    if (character === '\\') {
      escaped = true;
      continue;
    }

    if (character === '"') {
      inString = !inString;
      continue;
    }

    if (inString) {
      continue;
    }

    if (character === '{') {
      depth += 1;
    }

    if (character === '}') {
      depth -= 1;

      if (depth === 0) {
        return strippedValue.slice(firstBraceIndex, index + 1);
      }
    }
  }

  return strippedValue.slice(firstBraceIndex);
}

function getMessageContentText(content: OpenRouterMessageContent | undefined) {
  if (typeof content === 'string') {
    return content;
  }

  if (Array.isArray(content)) {
    return content
      .filter((block) => block.type === 'text')
      .map((block) => block.text ?? '')
      .join('\n')
      .trim();
  }

  return '';
}

function parseAndValidateCompletion(content: string, format: SmmAtomicFormat) {
  let parsed: unknown;

  try {
    parsed = JSON.parse(extractJsonObject(content));
  } catch {
    throw new Error('Модель повернула невалідний JSON.');
  }

  return format === 'caption'
    ? captionResultSchema.parse(parsed)
    : carouselResultSchema.parse(parsed);
}

function parseAndValidateCarouselVariant(content: string) {
  let parsed: unknown;

  try {
    parsed = JSON.parse(extractJsonObject(content));
  } catch {
    throw new Error('Модель повернула невалідний JSON.');
  }

  return carouselVariantSchema.parse(parsed);
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
      const content = getMessageContentText(data.choices?.[0]?.message?.content);

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

async function generateCarouselVariant(
  params: SmmGenerateRequest,
  variantIndex: number,
): Promise<CarouselVariant> {
  const baseMessages: OpenRouterMessage[] = [
    {
      role: 'system',
      content: SMM_SYSTEM_PROMPT,
    },
    {
      role: 'user',
      content: buildSmmCarouselVariantUserMessage(params, variantIndex),
    },
  ];
  const firstContent = await requestOpenRouterCompletion({
    format: 'carousel',
    messages: baseMessages,
  });

  try {
    return parseAndValidateCarouselVariant(firstContent);
  } catch (validationError) {
    console.warn('[generate-smm] invalid carousel variant JSON, retrying once', {
      variantIndex,
      error: validationError instanceof Error ? validationError.message : 'unknown validation error',
    });

    const repairedContent = await requestOpenRouterCompletion({
      format: 'carousel',
      messages: [
        ...baseMessages,
        {
          role: 'assistant',
          content: firstContent,
        },
        {
          role: 'user',
          content: `Попередня відповідь не є валідним JSON-обʼєктом варіанту каруселі.

Поверни лише один валідний JSON-обʼєкт за схемою. Без markdown, без бектиків, без wrapper-поля variants, без пояснень.`,
        },
      ],
    });

    try {
      return parseAndValidateCarouselVariant(repairedContent);
    } catch (secondValidationError) {
      const details = secondValidationError instanceof Error
        ? secondValidationError.message
        : 'JSON не пройшов валідацію.';

      throw new Error(`Не вдалося згенерувати валідний JSON для варіанту каруселі ${variantIndex}. ${details}`);
    }
  }
}

async function mapWithConcurrency<T, U>(
  values: T[],
  concurrency: number,
  mapper: (value: T) => Promise<U>,
) {
  const results: U[] = [];
  let nextIndex = 0;

  async function worker() {
    for (;;) {
      const currentIndex = nextIndex;
      nextIndex += 1;

      if (currentIndex >= values.length) {
        return;
      }

      results[currentIndex] = await mapper(values[currentIndex]);
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(concurrency, values.length) }, () => worker()),
  );

  return results;
}

async function generateCarouselResult(params: SmmGenerateRequest): Promise<CarouselResult> {
  const variantIndexes = Array.from({ length: params.variantsCount }, (_, index) => index + 1);
  const variants = await mapWithConcurrency(
    variantIndexes,
    CAROUSEL_VARIANT_CONCURRENCY,
    (variantIndex) => generateCarouselVariant(params, variantIndex),
  );

  return { variants };
}

export async function generateSmmResult(params: SmmGenerateRequest): Promise<SmmGenerationResult> {
  if (params.format === 'both') {
    const [captions, carousel] = await Promise.all([
      generateSmmContent(params, 'caption') as Promise<CaptionResult>,
      generateCarouselResult(params),
    ]);

    return { captions, carousel };
  }

  if (params.format === 'caption') {
    return {
      captions: await generateSmmContent(params, 'caption') as CaptionResult,
    };
  }

  return {
    carousel: await generateCarouselResult(params),
  };
}

function buildMerchSystemPrompt(ideasCount: number) {
  return `Ти стратег із корпоративного мерчу та подарунків. На основі заданих аудиторії, приводу, напрямку та бюджету згенеруй ${ideasCount} конкретних ідей. Кожну ідею прив'яжи до реального кейсу конкретної компанії, знайденого через вебпошук, із робочим посиланням. Для кожної поясни, чому вона пасує саме цій аудиторії, і запропонуй формат та пакування. Наведені бренди використовуй як орієнтир стилю.

Критичні правила:
- Обов'язково використай web_search для пошуку реальних кейсів компаній.
- Використай максимум 5 пошукових запитів.
- Не вигадуй source_url. Якщо не знайшов робоче джерело для конкретного кейсу, залиш source_url порожнім рядком.
- Відповідай ВИКЛЮЧНО валідним JSON, без markdown, без бектиків і без пояснень.
- Поверни рівно ${ideasCount} ідей, якщо це можливо.
- Пиши українською.

Очікуваний JSON:
{
  "ideas": [
    {
      "title": "...",
      "company": "...",
      "case": "що саме зробила компанія",
      "why_fits": "чому пасує цій аудиторії",
      "format_packaging": "формат і пакування",
      "source_url": "https://..."
    }
  ]
}`;
}

function buildMerchUserMessage(params: MerchIdeasRequest) {
  const optionalFields = [
    params.budget ? `Бюджет: ${params.budget}` : '',
    params.quantity ? `Кількість одиниць: ${params.quantity}` : '',
    params.referenceBrands ? `Бренди-референси: ${params.referenceBrands}` : '',
  ].filter(Boolean);

  return [
    `Аудиторія: ${params.audience}`,
    `Привід / тематика: ${params.occasion}`,
    `Напрямок / формат: ${params.direction}`,
    ...optionalFields,
    `Кількість ідей: ${params.ideasCount}`,
  ].join('\n');
}

function parseMerchIdeasResult(content: string): MerchIdeasResult {
  let parsed: unknown;

  try {
    parsed = JSON.parse(extractJsonObject(content));
  } catch {
    throw new Error('OpenRouter повернув відповідь не у форматі валідного JSON. Спробуйте згенерувати ще раз.');
  }

  try {
    return merchIdeasResultSchema.parse(parsed);
  } catch {
    throw new Error('OpenRouter повернув JSON, але він не відповідає очікуваній структурі ідей.');
  }
}

async function requestOpenRouterMerchIdeas(params: MerchIdeasRequest) {
  const timeoutMs = getOpenRouterTimeoutMs();
  const tools: OpenRouterTool[] = [
    {
      type: 'openrouter:web_search',
      parameters: {
        engine: 'auto',
        max_results: 5,
        max_total_results: 25,
        search_context_size: 'medium',
      },
    },
  ];
  const response = await fetchWithTimeout(
    OPENROUTER_API_URL,
    {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({
        model: process.env.OPENROUTER_MODEL ?? DEFAULT_OPENROUTER_MODEL,
        max_tokens: getMerchMaxTokens(params.ideasCount),
        temperature: getOpenRouterTemperature(),
        messages: [
          {
            role: 'system',
            content: buildMerchSystemPrompt(params.ideasCount),
          },
          {
            role: 'user',
            content: buildMerchUserMessage(params),
          },
        ],
        tools,
      }),
    },
    timeoutMs,
  ).catch((error: unknown) => {
    throw new Error(getNetworkErrorMessage(error, timeoutMs));
  });

  const data = await parseJsonResponse<OpenRouterResponse>(response);

  if (!response.ok) {
    throw new Error(
      data.error?.message ?? `OpenRouter API повернув помилку ${response.status}.`,
    );
  }

  const content = getMessageContentText(data.choices?.[0]?.message?.content);

  if (!content.trim()) {
    throw new Error('OpenRouter API не повернув текст із JSON-ідеями.');
  }

  return content;
}

export async function generateMerchIdeas(params: MerchIdeasRequest): Promise<MerchIdeasResult> {
  return parseMerchIdeasResult(await requestOpenRouterMerchIdeas(params));
}

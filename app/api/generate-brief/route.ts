import { NextResponse } from 'next/server';
import { DEFAULT_PROMPT } from '@/lib/constants';
import { saveGenerationHistorySafely } from '@/lib/generationHistory';

export const runtime = 'nodejs';
export const maxDuration = 300;

const OPENROUTER_API_URL = 'https://openrouter.ai/api/v1/chat/completions';
const DEFAULT_OPENROUTER_MODEL = 'anthropic/claude-sonnet-4.6';
const DEFAULT_OPENROUTER_TITLE = 'Brief Generator';
const DEFAULT_MAX_TOKENS = 8000;
const DEFAULT_OPENROUTER_TIMEOUT_MS = 240000;
const MAX_VACANCY_URLS = 30;
const VACANCY_FETCH_CONCURRENCY = 5;
const VACANCY_FETCH_TIMEOUT_MS = 15000;
const BRIEF_GENERATION_CONCURRENCY = 2;
const MAX_CONTINUATION_ATTEMPTS = 3;
const COMPLETION_MARKER = '<!-- BRIEF_COMPLETE -->';
const UKRAINIAN_MONTHS = [
  'Січень',
  'Лютий',
  'Березень',
  'Квітень',
  'Травень',
  'Червень',
  'Липень',
  'Серпень',
  'Вересень',
  'Жовтень',
  'Листопад',
  'Грудень',
];
const ASHBY_JOB_POSTING_QUERY = `query ApiJobPosting($organizationHostedJobsPageName: String!, $jobPostingId: String!) {
  jobPosting(
    organizationHostedJobsPageName: $organizationHostedJobsPageName
    jobPostingId: $jobPostingId
  ) {
    id
    title
    departmentName
    departmentExternalName
    locationName
    locationAddress
    workplaceType
    employmentType
    descriptionHtml
    isListed
    isConfidential
    teamNames
    secondaryLocationNames
    compensationTierSummary
  }
}`;
const BRIEF_GENERATION_GUARDRAILS = `Критичні правила, які мають вищий пріоритет за стилістичні побажання:

1. Назви вакансій з вхідного тексту треба зберігати дослівно.
   - Не перекладай назви.
   - Не скорочуй назви.
   - Не перефразовуй назви.
   - Не додавай нові слова до назв.
   - Якщо назва подана як Markdown heading, прибери тільки службові символи Markdown (#, **), але залиш саму назву без зміни.

2. Відповідь повинна бути читабельним Markdown:
   - Не використовуй code fence.
   - Використовуй тільки заголовки #, ## та ###.
   - Кожну вакансію починай з: # [точна назва вакансії]
   - Дотримуйся формату з Концептом 1, Концептом 2, Концептом 3 і Концептом 4.
   - Став порожній рядок між секціями, концептами та варіаціями.
   - Використовуй дефіс із пробілом для bullet lists.
   - Не використовуй горизонтальні лінії, emoji в заголовках концептів і варіацій, цитати або таблиці.

3. Для кожної вакансії створи рівно 4 концепти у структурі з системного промпту.
   - Концепт 1 має мати рівно 3 варіації.
   - Концепт 2 має мати рівно 3 варіації.
   - Концепт 3 має мати рівно 2 варіації.
   - Концепт 4 має мати рівно 3 варіації.
   - Не додавай візуальні ідеї, бриф для дизайнера, video/motion або додаткові концепції.
   - Не роби 4 концепти на весь пакет вакансій.
   - Не об'єднуй кілька вакансій в один блок.

4. Ротуй підзаголовки в межах однієї вакансії.
   - У Концепті 1 кожна з 3 варіацій має мати різний підзаголовок.
   - У Концепті 3 кожна з 2 варіацій має мати різний підзаголовок.
   - У Концепті 4 кожна з 3 варіацій має мати різний підзаголовок.
   - Один і той самий підзаголовок не може повторюватися двічі в межах однієї вакансії.

5. Якщо у вхідному тексті є кілька вакансій, збережи всі вакансії в тому самому порядку.`;

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

type OpenRouterMessage = {
  role: 'system' | 'user' | 'assistant';
  content: string;
};

type OpenRouterCompletion = {
  content: string;
  finishReason: string | null;
};

type AshbyJobPosting = {
  id?: string;
  title?: string;
  departmentName?: string | null;
  departmentExternalName?: string | null;
  locationName?: string | null;
  locationAddress?: string | null;
  workplaceType?: string | null;
  employmentType?: string | null;
  descriptionHtml?: string | null;
  isListed?: boolean | null;
  isConfidential?: boolean | null;
  teamNames?: string[] | null;
  secondaryLocationNames?: string[] | null;
  compensationTierSummary?: string | null;
};

type AshbyJobPostingResponse = {
  data?: {
    jobPosting?: AshbyJobPosting | null;
  };
  errors?: Array<{
    message?: string;
  }>;
};

type ParsedAshbyUrl = {
  endpointUrl: string;
  jobPostingId: string;
  organizationHostedJobsPageName: string;
  sourceUrl: string;
};

type ResolvedVacancy = {
  departmentName?: string;
  employmentType?: string;
  locationAddress?: string;
  locationName?: string;
  sourceUrl: string;
  title: string;
  description: string;
  teamNames: string[];
  secondaryLocationNames: string[];
  workplaceType?: string;
  compensationTierSummary?: string;
};

type VacancyInput = {
  id: string;
  title: string;
  sourceUrl?: string;
  content: string;
};

type ResolvedVacancyInput = {
  resolvedUrlCount: number;
  vacanciesForModel: string;
  vacancyInputs: VacancyInput[];
};

type GeneratedVacancyBrief = {
  brief: string;
  finishReason: string | null;
  id: string;
  sourceUrl?: string;
  title: string;
  continuationAttempts: number;
};

const HTML_ENTITIES: Record<string, string> = {
  amp: '&',
  apos: "'",
  gt: '>',
  lt: '<',
  nbsp: ' ',
  quot: '"',
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

function getMaxTokens() {
  return getPositiveIntegerEnvValue('OPENROUTER_MAX_TOKENS', DEFAULT_MAX_TOKENS);
}

function getOpenRouterTimeoutMs() {
  return getPositiveIntegerEnvValue('OPENROUTER_TIMEOUT_MS', DEFAULT_OPENROUTER_TIMEOUT_MS);
}

function getPositiveIntegerEnvValue(name: string, fallbackValue: number) {
  const configuredValue = Number.parseInt(process.env[name] ?? '', 10);

  return Number.isFinite(configuredValue) && configuredValue > 0
    ? configuredValue
    : fallbackValue;
}

function getFinishReason(choice: OpenRouterChoice | undefined) {
  return choice?.finish_reason ?? choice?.native_finish_reason ?? null;
}

function isTokenLimitFinishReason(finishReason: string | null) {
  if (!finishReason) {
    return false;
  }

  return ['length', 'max_tokens', 'model_length'].includes(finishReason);
}

function stripCompletionMarker(brief: string) {
  return brief.split(COMPLETION_MARKER).join('').trim();
}

function uniqueValues(values: string[]) {
  return Array.from(new Set(values));
}

function cleanUrlMatch(value: string) {
  return value.replace(/[),.;\]]+$/g, '');
}

function cleanMarkdownTitle(value: string) {
  return value
    .replace(/^#+\s*/, '')
    .replace(/\*\*/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function deriveTitleFromVacancyText(value: string) {
  const firstMeaningfulLine = value
    .split('\n')
    .map(cleanMarkdownTitle)
    .find((line) => line && !/^https?:\/\//i.test(line));

  if (!firstMeaningfulLine) {
    return 'Промо вакансія';
  }

  return firstMeaningfulLine.length > 90
    ? `${firstMeaningfulLine.slice(0, 90)}...`
    : firstMeaningfulLine;
}

function buildDefaultTaskTitle(vacancyCount: number, firstVacancyTitle: string) {
  if (vacancyCount <= 1) {
    return firstVacancyTitle || 'Промо вакансія';
  }

  const now = new Date();
  return `Промо вакансій ${UKRAINIAN_MONTHS[now.getMonth()]} ${now.getFullYear()}`;
}

function extractUrls(value: string) {
  const matches = value.match(/https?:\/\/[^\s<>"']+/g) ?? [];

  return uniqueValues(matches.map(cleanUrlMatch).filter(Boolean));
}

function parseAshbyUrl(value: string): ParsedAshbyUrl | null {
  try {
    const url = new URL(value);
    const pathParts = url.pathname.split('/').filter(Boolean);
    const [organizationHostedJobsPageName, jobPostingId] = pathParts;

    if (
      url.hostname !== 'jobs.ashbyhq.com' ||
      !organizationHostedJobsPageName ||
      !jobPostingId
    ) {
      return null;
    }

    return {
      endpointUrl: `${url.origin}/api/non-user-graphql?op=ApiJobPosting`,
      jobPostingId,
      organizationHostedJobsPageName,
      sourceUrl: url.toString(),
    };
  } catch {
    return null;
  }
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

function getNetworkErrorMessage(error: unknown, serviceName: string, timeoutMs: number) {
  if (error instanceof DOMException && error.name === 'AbortError') {
    return `${serviceName} не відповів за ${Math.round(timeoutMs / 1000)} секунд. Спробуйте ще раз або зменшіть кількість вакансій.`;
  }

  if (error instanceof Error) {
    return `${serviceName} недоступний: ${error.message}`;
  }

  return `${serviceName} недоступний через невідому мережеву помилку.`;
}

async function parseJsonResponse<T>(response: Response, serviceName: string): Promise<T> {
  const responseText = await response.text();

  if (!responseText.trim()) {
    return {} as T;
  }

  try {
    return JSON.parse(responseText) as T;
  } catch {
    throw new Error(`${serviceName} повернув відповідь у неочікуваному форматі.`);
  }
}

function decodeHtmlEntities(value: string) {
  return value.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (match, entity: string) => {
    const normalizedEntity = entity.toLowerCase();

    if (normalizedEntity.startsWith('#x')) {
      const codePoint = Number.parseInt(normalizedEntity.slice(2), 16);
      return Number.isFinite(codePoint) ? String.fromCodePoint(codePoint) : match;
    }

    if (normalizedEntity.startsWith('#')) {
      const codePoint = Number.parseInt(normalizedEntity.slice(1), 10);
      return Number.isFinite(codePoint) ? String.fromCodePoint(codePoint) : match;
    }

    return HTML_ENTITIES[normalizedEntity] ?? match;
  });
}

function htmlToPlainText(html: string) {
  return decodeHtmlEntities(
    html
      .replace(/<\s*(script|style)[^>]*>[\s\S]*?<\s*\/\s*\1\s*>/gi, '')
      .replace(/<\s*br\s*\/?>/gi, '\n')
      .replace(/<\s*li[^>]*>/gi, '\n- ')
      .replace(/<\s*\/\s*(p|div|section|article|h[1-6]|ul|ol|li)\s*>/gi, '\n')
      .replace(/<[^>]+>/g, ''),
  )
    .replace(/\u00a0/g, ' ')
    .split('\n')
    .map((line) => line.replace(/[ \t]+/g, ' ').trim())
    .filter(Boolean)
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function optionalText(value: string | null | undefined) {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function optionalTextList(value: string[] | null | undefined) {
  return Array.isArray(value)
    ? value.filter((item) => typeof item === 'string' && item.trim()).map((item) => item.trim())
    : [];
}

async function fetchAshbyVacancy(parsedUrl: ParsedAshbyUrl): Promise<ResolvedVacancy> {
  const response = await fetchWithTimeout(
    parsedUrl.endpointUrl,
    {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        Referer: parsedUrl.sourceUrl,
      },
      body: JSON.stringify({
        operationName: 'ApiJobPosting',
        query: ASHBY_JOB_POSTING_QUERY,
        variables: {
          jobPostingId: parsedUrl.jobPostingId,
          organizationHostedJobsPageName: parsedUrl.organizationHostedJobsPageName,
        },
      }),
    },
    VACANCY_FETCH_TIMEOUT_MS,
  ).catch((error: unknown) => {
    throw new Error(getNetworkErrorMessage(error, 'Ashby', VACANCY_FETCH_TIMEOUT_MS));
  });

  const data = await parseJsonResponse<AshbyJobPostingResponse>(response, 'Ashby');

  if (!response.ok) {
    throw new Error(
      data.errors?.[0]?.message ??
        `Ashby повернув помилку ${response.status} для ${parsedUrl.sourceUrl}.`,
    );
  }

  const jobPosting = data.data?.jobPosting;

  if (!jobPosting) {
    throw new Error(
      `Не вдалося відкрити вакансію ${parsedUrl.sourceUrl}. Можливо, вона закрита, unpublished або лінка не публічна.`,
    );
  }

  const title = optionalText(jobPosting.title);
  const description = jobPosting.descriptionHtml
    ? htmlToPlainText(jobPosting.descriptionHtml)
    : '';

  if (!title || !description) {
    throw new Error(
      `Ashby не повернув повний опис вакансії для ${parsedUrl.sourceUrl}.`,
    );
  }

  return {
    compensationTierSummary: optionalText(jobPosting.compensationTierSummary),
    departmentName: optionalText(jobPosting.departmentExternalName ?? jobPosting.departmentName),
    description,
    employmentType: optionalText(jobPosting.employmentType),
    locationAddress: optionalText(jobPosting.locationAddress),
    locationName: optionalText(jobPosting.locationName),
    secondaryLocationNames: optionalTextList(jobPosting.secondaryLocationNames),
    sourceUrl: parsedUrl.sourceUrl,
    teamNames: optionalTextList(jobPosting.teamNames),
    title,
    workplaceType: optionalText(jobPosting.workplaceType),
  };
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

function formatResolvedVacancy(vacancy: ResolvedVacancy) {
  const metaLines = [
    `**Лінк:** ${vacancy.sourceUrl}`,
    vacancy.departmentName ? `**Команда / департамент:** ${vacancy.departmentName}` : '',
    vacancy.teamNames.length ? `**Команди:** ${vacancy.teamNames.join(', ')}` : '',
    vacancy.locationName ? `**Локація:** ${vacancy.locationName}` : '',
    vacancy.secondaryLocationNames.length
      ? `**Додаткові локації:** ${vacancy.secondaryLocationNames.join(', ')}`
      : '',
    vacancy.locationAddress ? `**Адреса:** ${vacancy.locationAddress}` : '',
    vacancy.workplaceType ? `**Формат роботи:** ${vacancy.workplaceType}` : '',
    vacancy.employmentType ? `**Тип зайнятості:** ${vacancy.employmentType}` : '',
    vacancy.compensationTierSummary
      ? `**Компенсація:** ${vacancy.compensationTierSummary}`
      : '',
  ].filter(Boolean);

  return `### **${vacancy.title}**

${metaLines.join('\n')}

**Опис вакансії з Ashby:**
${vacancy.description}`;
}

function buildVacanciesForModel(originalVacancies: string, resolvedVacancies: ResolvedVacancy[]) {
  if (!resolvedVacancies.length) {
    return originalVacancies;
  }

  return `Оригінальний інпут рекрутера:
${originalVacancies.trim()}

Витягнуті описи вакансій з лінків:
${resolvedVacancies.map(formatResolvedVacancy).join('\n\n---\n\n')}`;
}

function buildSingleVacancyForModel(originalVacancies: string, vacancy: ResolvedVacancy) {
  return `Оригінальний інпут рекрутера може містити кілька вакансій. Використовуй його тільки як контекст:
${originalVacancies.trim()}

Конкретна вакансія для цього брифу:
${formatResolvedVacancy(vacancy)}`;
}

function buildCombinedBrief(vacancyBriefs: GeneratedVacancyBrief[]) {
  return vacancyBriefs
    .map((vacancyBrief) => vacancyBrief.brief.trim())
    .filter(Boolean)
    .join('\n\n---\n\n');
}

async function resolveVacancyInput(vacancies: string): Promise<ResolvedVacancyInput> {
  const urls = extractUrls(vacancies);
  const fallbackVacancyInput = {
    id: 'vacancy-1',
    title: deriveTitleFromVacancyText(vacancies),
    content: vacancies,
  };

  if (!urls.length) {
    return {
      resolvedUrlCount: 0,
      vacanciesForModel: vacancies,
      vacancyInputs: [fallbackVacancyInput],
    };
  }

  const ashbyUrls = urls.map(parseAshbyUrl).filter((url): url is ParsedAshbyUrl => Boolean(url));

  if (!ashbyUrls.length) {
    return {
      resolvedUrlCount: 0,
      vacanciesForModel: vacancies,
      vacancyInputs: [fallbackVacancyInput],
    };
  }

  if (ashbyUrls.length > MAX_VACANCY_URLS) {
    throw new Error(
      `Зараз можна обробити максимум ${MAX_VACANCY_URLS} Ashby-вакансій за один запит.`,
    );
  }

  const resolvedVacancies = await mapWithConcurrency(
    ashbyUrls,
    VACANCY_FETCH_CONCURRENCY,
    fetchAshbyVacancy,
  );

  return {
    resolvedUrlCount: resolvedVacancies.length,
    vacanciesForModel: buildVacanciesForModel(vacancies, resolvedVacancies),
    vacancyInputs: resolvedVacancies.map((vacancy, index) => ({
      id: `vacancy-${index + 1}`,
      title: vacancy.title,
      sourceUrl: vacancy.sourceUrl,
      content: buildSingleVacancyForModel(vacancies, vacancy),
    })),
  };
}

function createContinuationPrompt(finishReason: string | null) {
  const reason = finishReason
    ? `Причина зупинки попередньої відповіді: ${finishReason}.`
    : 'Попередня відповідь не містить технічного маркера завершення.';

  return `${reason}

Продовж бриф рівно з наступного символа після останнього символа попередньої відповіді.
Не повторюй уже написаний текст.
Якщо останнє слово було обірване, почни з решти цього слова.
Коли повний бриф буде завершений, додай окремим останнім рядком ${COMPLETION_MARKER}.`;
}

async function requestBriefCompletion(
  headers: Record<string, string>,
  messages: OpenRouterMessage[],
): Promise<OpenRouterCompletion> {
  const timeoutMs = getOpenRouterTimeoutMs();
  const response = await fetchWithTimeout(
    OPENROUTER_API_URL,
    {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model: process.env.OPENROUTER_MODEL ?? DEFAULT_OPENROUTER_MODEL,
        max_tokens: getMaxTokens(),
        temperature: 0.7,
        messages,
      }),
    },
    timeoutMs,
  ).catch((error: unknown) => {
    throw new Error(getNetworkErrorMessage(error, 'OpenRouter API', timeoutMs));
  });

  const data = await parseJsonResponse<OpenRouterResponse>(response, 'OpenRouter API');

  if (!response.ok) {
    throw new Error(
      data.error?.message ?? `OpenRouter API повернув помилку ${response.status}.`,
    );
  }

  const choice = data.choices?.[0];
  const content = choice?.message?.content ?? '';

  if (!content) {
    throw new Error('OpenRouter API не повернув текст брифу.');
  }

  return {
    content,
    finishReason: getFinishReason(choice),
  };
}

async function generateBriefForVacancy(
  headers: Record<string, string>,
  systemPrompt: string,
  vacancyInput: VacancyInput,
): Promise<GeneratedVacancyBrief> {
  const baseMessages: OpenRouterMessage[] = [
    {
      role: 'system',
      content: `${systemPrompt}

${BRIEF_GENERATION_GUARDRAILS}

Цей запит стосується рівно однієї конкретної вакансії.
Не додавай у відповідь інші вакансії з оригінального інпуту, навіть якщо вони там є.
Назву вакансії використовуй дослівно: ${vacancyInput.title}

Якщо інпут містить блок "Конкретна вакансія для цього брифу", використовуй його як основне джерело фактів про роль.

Технічне правило завершення: коли повний бриф готовий, додай окремим останнім рядком ${COMPLETION_MARKER}.`,
    },
    {
      role: 'user',
      content: `Ось вакансія:\n\n${vacancyInput.content}\n\nЗгенеруй тексти для статичних рекламних креативів тільки для цієї вакансії.`,
    },
  ];
  let brief = '';
  let finishReason: string | null = null;
  let continuationAttempts = 0;

  for (let attempt = 0; attempt <= MAX_CONTINUATION_ATTEMPTS; attempt += 1) {
    const messages =
      attempt === 0
        ? baseMessages
        : [
            ...baseMessages,
            {
              role: 'assistant' as const,
              content: brief,
            },
            {
              role: 'user' as const,
              content: createContinuationPrompt(finishReason),
            },
          ];
    const completion = await requestBriefCompletion(headers, messages);

    brief += completion.content;
    finishReason = completion.finishReason;

    if (brief.includes(COMPLETION_MARKER)) {
      break;
    }

    if (attempt < MAX_CONTINUATION_ATTEMPTS) {
      continuationAttempts += 1;
    }
  }

  const isComplete = brief.includes(COMPLETION_MARKER);

  if (!isComplete) {
    const reason = isTokenLimitFinishReason(finishReason)
      ? 'Модель досягла ліміту довжини відповіді.'
      : 'Модель не підтвердила завершення брифу.';

    throw new Error(
      `${reason} Спробуйте ще раз або зменшіть кількість вакансій в одному запиті.`,
    );
  }

  return {
    brief: stripCompletionMarker(brief),
    continuationAttempts,
    finishReason,
    id: vacancyInput.id,
    sourceUrl: vacancyInput.sourceUrl,
    title: vacancyInput.title,
  };
}

export async function POST(req: Request) {
  const startedAt = Date.now();

  try {
    if (!process.env.OPENROUTER_API_KEY || process.env.OPENROUTER_API_KEY === 'your_key_here') {
      const durationMs = Date.now() - startedAt;

      console.warn('[generate-brief] missing OPENROUTER_API_KEY', { durationMs });

      return NextResponse.json(
        {
          durationMs,
          error: 'OPENROUTER_API_KEY не налаштовано в .env.local або Railway variables.',
        },
        { status: 500 },
      );
    }

    const { vacancies } = await req.json();

    if (!vacancies) {
      const durationMs = Date.now() - startedAt;

      console.warn('[generate-brief] missing request fields', { durationMs });

      return NextResponse.json(
        { durationMs, error: 'Передайте vacancies.' },
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

    const { resolvedUrlCount, vacancyInputs } = await resolveVacancyInput(vacancies);
    const vacancyBriefs = await mapWithConcurrency(
      vacancyInputs,
      BRIEF_GENERATION_CONCURRENCY,
      (vacancyInput) => generateBriefForVacancy(headers, DEFAULT_PROMPT, vacancyInput),
    );
    const continuationAttempts = vacancyBriefs.reduce(
      (total, vacancyBrief) => total + vacancyBrief.continuationAttempts,
      0,
    );
    const finishReason = vacancyBriefs.at(-1)?.finishReason ?? null;
    const cleanBrief = buildCombinedBrief(vacancyBriefs);
    const parentTitle = buildDefaultTaskTitle(vacancyBriefs.length, vacancyBriefs[0]?.title ?? '');
    const durationMs = Date.now() - startedAt;
    const responsePayload = {
      brief: cleanBrief,
      continuationAttempts,
      finishReason,
      parentTitle,
      resolvedUrlCount,
      vacancyBriefs: vacancyBriefs.map((vacancyBrief) => ({
        brief: vacancyBrief.brief,
        id: vacancyBrief.id,
        sourceUrl: vacancyBrief.sourceUrl,
        title: vacancyBrief.title,
      })),
    };

    await saveGenerationHistorySafely({
      durationMs,
      input: {
        vacancies,
      },
      output: responsePayload,
      title: parentTitle,
      tool: 'brief',
    });

    console.info('[generate-brief] completed', {
      durationMs,
      continuationAttempts,
      finishReason,
      resolvedUrlCount,
      vacancyBriefCount: vacancyBriefs.length,
    });

    return NextResponse.json({
      ...responsePayload,
      durationMs,
    });
  } catch (error) {
    const durationMs = Date.now() - startedAt;
    const message =
      error instanceof Error ? error.message : 'OpenRouter API повернув невідому помилку.';

    console.error('[generate-brief] failed', { durationMs, error: message });

    return NextResponse.json(
      {
        durationMs,
        error: message,
      },
      { status: 500 },
    );
  }
}

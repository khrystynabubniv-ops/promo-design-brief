import { NextResponse } from 'next/server';
import {
  BRAND_DESIGN_HUB_DATABASE_ID,
  BRAND_DESIGN_HUB_VIEW_ID,
  DATA_SOURCE_ID,
  FORMAT_PROPERTY_NAME,
  NOTION_TASK_TEMPLATE_ID,
  OWNER_ID,
} from '@/lib/constants';

const NOTION_API_VERSION = '2026-03-11';
const NOTION_PAGES_API_URL = 'https://api.notion.com/v1/pages';
const NOTION_BLOCKS_API_URL = 'https://api.notion.com/v1/blocks';
const RICH_TEXT_CONTENT_LIMIT = 2000;
const RICH_TEXT_ARRAY_LIMIT = 100;
const APPEND_CHILDREN_BATCH_SIZE = 80;
const DESCRIPTION_BRIEF_LOCATION_MESSAGE =
  'Повний бриф додано нижче в тілі задачі.';
const PARENT_ITEM_PROPERTY_NAME = 'Parent item';

type NotionCreatePageResponse = {
  id?: string;
  url?: string;
  object?: string;
  message?: string;
};

type NotionApiResponse = {
  message?: string;
};

type NotionPageProperties = Record<string, unknown>;
type NotionHeaders = Record<string, string>;
type NotionRichText = { text: { content: string } };
type NotionBlock = Record<string, unknown>;

type IncomingVacancyBrief = {
  brief: string;
  id: string;
  sourceUrl?: string;
  title: string;
};

type CreateTaskPageOptions = {
  body: Record<string, unknown>;
  brief: string;
  formatProperty?: unknown;
  headers: NotionHeaders;
  kind: 'single' | 'parent' | 'child';
  name: string;
  parentTaskId?: string;
};

type CreatedTaskPage = {
  appendedBriefBlockCount: number;
  descriptionTooLong: boolean;
  fallbackUrl: string;
  id: string;
  kind: 'single' | 'parent' | 'child';
  name: string;
  url: string;
  warning?: string;
};

function normalizeNotionId(id: string) {
  const compact = id.replaceAll('-', '').trim();

  if (!/^[0-9a-fA-F]{32}$/.test(compact)) {
    return id;
  }

  return [
    compact.slice(0, 8),
    compact.slice(8, 12),
    compact.slice(12, 16),
    compact.slice(16, 20),
    compact.slice(20),
  ].join('-');
}

function splitContentIntoChunks(content: string, chunkSize = RICH_TEXT_CONTENT_LIMIT) {
  const chunks: string[] = [];

  for (let index = 0; index < content.length; index += chunkSize) {
    chunks.push(content.slice(index, index + chunkSize));
  }

  return chunks.length ? chunks : [''];
}

function splitRichTextContent(content: string, maxChunks = RICH_TEXT_ARRAY_LIMIT): NotionRichText[] {
  return splitContentIntoChunks(content)
    .slice(0, maxChunks)
    .map((chunk) => ({ text: { content: chunk } }));
}

function buildDescriptionRichText() {
  return {
    richText: splitRichTextContent(DESCRIPTION_BRIEF_LOCATION_MESSAGE),
    tooLong: false,
  };
}

function buildFullBriefBlocks(content: string): NotionBlock[] {
  const normalizedContent = content.replace(/\r\n/g, '\n').trim();
  const paragraphs = normalizedContent
    ? normalizedContent.split(/\n{2,}/).map((paragraph) => paragraph.trim()).filter(Boolean)
    : [''];
  const blocks: NotionBlock[] = [
    {
      object: 'block',
      type: 'divider',
      divider: {},
    },
    {
      object: 'block',
      type: 'heading_2',
      heading_2: {
        rich_text: [{ text: { content: 'Full design brief' } }],
      },
    },
  ];

  paragraphs.forEach((paragraph) => {
    splitContentIntoChunks(paragraph).forEach((chunk) => {
      blocks.push({
        object: 'block',
        type: 'paragraph',
        paragraph: {
          rich_text: [{ text: { content: chunk } }],
        },
      });
    });
  });

  return blocks;
}

function chunkArray<T>(items: T[], chunkSize: number) {
  const chunks: T[][] = [];

  for (let index = 0; index < items.length; index += chunkSize) {
    chunks.push(items.slice(index, index + chunkSize));
  }

  return chunks;
}

function wait(ms: number) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function readNotionJson(response: Response): Promise<NotionApiResponse> {
  try {
    return (await response.json()) as NotionApiResponse;
  } catch {
    return {};
  }
}

async function appendBriefBlockBatch(pageId: string, children: NotionBlock[], headers: NotionHeaders) {
  const url = `${NOTION_BLOCKS_API_URL}/${normalizeNotionId(pageId)}/children`;

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const response = await fetch(url, {
      method: 'PATCH',
      headers,
      body: JSON.stringify({ children }),
    });
    const data = await readNotionJson(response);

    if (response.ok) {
      return;
    }

    if (response.status === 429 && attempt < 2) {
      const retryAfterSeconds = Number(response.headers.get('Retry-After') ?? '1');

      await wait(Math.max(1, retryAfterSeconds) * 1000);
      continue;
    }

    throw new Error(data.message ?? `Notion API повернув помилку ${response.status} під час додавання брифу.`);
  }
}

async function appendFullBriefToPage(pageId: string, brief: string, headers: NotionHeaders) {
  const blocks = buildFullBriefBlocks(brief);

  for (const blockBatch of chunkArray(blocks, APPEND_CHILDREN_BATCH_SIZE)) {
    await appendBriefBlockBatch(pageId, blockBatch, headers);
  }

  return blocks.length;
}

function normalizeFormat(value: unknown) {
  if (Array.isArray(value)) {
    return value.find(
      (format): format is string => typeof format === 'string' && format.trim().length > 0,
    )?.trim() ?? '';
  }

  return typeof value === 'string' ? value.trim() : '';
}

function normalizeString(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeVacancyBriefs(body: Record<string, unknown>): IncomingVacancyBrief[] {
  if (Array.isArray(body.vacancyBriefs)) {
    const vacancyBriefs = body.vacancyBriefs
      .map((item, index): IncomingVacancyBrief | null => {
        if (!item || typeof item !== 'object') {
          return null;
        }

        const candidate = item as Record<string, unknown>;
        const brief = normalizeString(candidate.brief);

        if (!brief) {
          return null;
        }

        return {
          brief,
          id: normalizeString(candidate.id) || `vacancy-${index + 1}`,
          sourceUrl: normalizeString(candidate.sourceUrl) || undefined,
          title: normalizeString(candidate.title) || `Вакансія ${index + 1}`,
        };
      })
      .filter((item): item is IncomingVacancyBrief => Boolean(item));

    if (vacancyBriefs.length) {
      return vacancyBriefs;
    }
  }

  const brief = normalizeString(body.brief);

  if (!brief) {
    return [];
  }

  return [
    {
      brief,
      id: 'vacancy-1',
      title: normalizeString(body.name) || 'Промо вакансія',
    },
  ];
}

function buildParentBrief(parentName: string, vacancyBriefs: IncomingVacancyBrief[]) {
  const vacancyLines = vacancyBriefs.map((vacancyBrief, index) => {
    const sourceUrl = vacancyBrief.sourceUrl ? ` — ${vacancyBrief.sourceUrl}` : '';

    return `${index + 1}. ${vacancyBrief.title}${sourceUrl}`;
  });

  return `Пакет задач: ${parentName}

Кількість вакансій: ${vacancyBriefs.length}

Окремі child-задачі створені для кожної вакансії. Повний бриф по кожній ролі знаходиться в її child page.

Вакансії:
${vacancyLines.join('\n')}`;
}

function getTaskName(value: unknown, fallback: string) {
  return normalizeString(value) || fallback;
}

function toCompactId(id: string) {
  return id.replaceAll('-', '');
}

function buildBrandDesignTaskUrl(pageId: string) {
  return `https://www.notion.so/${toCompactId(BRAND_DESIGN_HUB_DATABASE_ID)}?v=${toCompactId(
    BRAND_DESIGN_HUB_VIEW_ID,
  )}&p=${toCompactId(pageId)}&pm=s`;
}

function buildTaskProperties({
  body,
  formatProperty,
  name,
  parentTaskId,
}: Pick<CreateTaskPageOptions, 'body' | 'formatProperty' | 'name' | 'parentTaskId'>) {
  const description = buildDescriptionRichText();
  const properties: NotionPageProperties = {
    Name: { title: [{ text: { content: name } }] },
    Team: { select: { name: 'Brand Design' } },
    Status: { status: { name: 'To do' } },
    Priority: { select: { name: body.priority } },
    Owner: {
      people: [{ object: 'user', id: OWNER_ID }],
    },
    Deadline: { date: { start: body.deadline } },
    ...(body.platform ? { Platform: { select: { name: body.platform } } } : {}),
    ...(formatProperty ? { [FORMAT_PROPERTY_NAME]: formatProperty } : {}),
    ...(parentTaskId
      ? {
          [PARENT_ITEM_PROPERTY_NAME]: {
            relation: [{ id: normalizeNotionId(parentTaskId) }],
          },
        }
      : {}),
    'Task Type': {
      relation: [{ id: normalizeNotionId(String(body.taskTypeId)) }],
    },
    'Design needed': { checkbox: true },
    'Design Briefed': { checkbox: true },
    Description: {
      rich_text: description.richText,
    },
  };

  return {
    description,
    properties,
  };
}

async function createTaskPage({
  body,
  brief,
  formatProperty,
  headers,
  kind,
  name,
  parentTaskId,
}: CreateTaskPageOptions): Promise<CreatedTaskPage> {
  const { description, properties } = buildTaskProperties({
    body,
    formatProperty,
    name,
    parentTaskId,
  });
  const response = await fetch(NOTION_PAGES_API_URL, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      parent: {
        type: 'data_source_id',
        data_source_id: DATA_SOURCE_ID,
      },
      properties,
      template: {
        type: 'template_id',
        template_id: NOTION_TASK_TEMPLATE_ID,
      },
    }),
  });
  const data = (await response.json()) as NotionCreatePageResponse;

  if (!response.ok) {
    console.error('[create-notion-task] Notion rejected request', {
      kind,
      name,
      status: response.status,
      message: data.message,
      hasParentTask: Boolean(parentTaskId),
      formatPropertyType: formatProperty ? 'select' : 'omitted',
    });

    throw new Error(data.message ?? `Notion API повернув помилку ${response.status}.`);
  }

  if (!data.id) {
    throw new Error('Notion API не повернув ID створеної задачі.');
  }

  let appendedBriefBlockCount = 0;
  let appendWarning = '';

  try {
    appendedBriefBlockCount = await appendFullBriefToPage(data.id, brief, headers);
  } catch (appendError) {
    appendWarning =
      appendError instanceof Error
        ? appendError.message
        : 'Не вдалося додати повний бриф у тіло задачі.';

    console.error('[create-notion-task] failed to append full brief', {
      taskId: data.id,
      kind,
      error: appendWarning,
    });
  }

  return {
    appendedBriefBlockCount,
    descriptionTooLong: description.tooLong,
    fallbackUrl: data.url ?? '',
    id: data.id,
    kind,
    name,
    url: buildBrandDesignTaskUrl(data.id),
    warning: appendWarning || undefined,
  };
}

export async function POST(req: Request) {
  const startedAt = Date.now();

  try {
    if (!process.env.NOTION_TOKEN || process.env.NOTION_TOKEN === 'your_notion_integration_token') {
      const durationMs = Date.now() - startedAt;

      console.warn('[create-notion-task] missing NOTION_TOKEN', { durationMs });

      return NextResponse.json(
        { durationMs, error: 'NOTION_TOKEN не налаштовано в .env.local.' },
        { status: 500 },
      );
    }

    const body = (await req.json()) as Record<string, unknown>;
    const requiredFields = ['name', 'deadline', 'priority', 'taskTypeId'];
    const missingField = requiredFields.find((field) => !body[field]);

    if (missingField) {
      const durationMs = Date.now() - startedAt;

      console.warn('[create-notion-task] missing request field', { durationMs, missingField });

      return NextResponse.json(
        { durationMs, error: `Поле ${missingField} є обов'язковим.` },
        { status: 400 },
      );
    }

    const vacancyBriefs = normalizeVacancyBriefs(body);

    if (!vacancyBriefs.length) {
      const durationMs = Date.now() - startedAt;

      console.warn('[create-notion-task] missing vacancy briefs', { durationMs });

      return NextResponse.json(
        { durationMs, error: 'Передайте brief або vacancyBriefs.' },
        { status: 400 },
      );
    }

    const format = normalizeFormat(body.format ?? body.formats);
    const formatProperty = format ? { select: { name: format } } : undefined;

    console.info('[create-notion-task] prepared Notion properties', {
      format,
      formatPropertyType: formatProperty ? 'select' : 'omitted',
      formatPropertyKey: formatProperty ? FORMAT_PROPERTY_NAME : null,
      receivedLegacyFormats: Array.isArray(body.formats),
      vacancyBriefCount: vacancyBriefs.length,
    });

    const notionHeaders = {
      Authorization: `Bearer ${process.env.NOTION_TOKEN}`,
      'Content-Type': 'application/json',
      'Notion-Version': NOTION_API_VERSION,
    };
    const createdTasks: CreatedTaskPage[] = [];

    if (vacancyBriefs.length === 1) {
      const vacancyBrief = vacancyBriefs[0];
      const task = await createTaskPage({
        body,
        brief: vacancyBrief.brief,
        formatProperty,
        headers: notionHeaders,
        kind: 'single',
        name: getTaskName(body.name, vacancyBrief.title),
      });

      createdTasks.push(task);
    } else {
      const parentName = getTaskName(body.name, 'Промо вакансій');
      const parentTask = await createTaskPage({
        body,
        brief: buildParentBrief(parentName, vacancyBriefs),
        formatProperty,
        headers: notionHeaders,
        kind: 'parent',
        name: parentName,
      });

      createdTasks.push(parentTask);

      for (const [index, vacancyBrief] of vacancyBriefs.entries()) {
        const childTask = await createTaskPage({
          body,
          brief: vacancyBrief.brief,
          formatProperty,
          headers: notionHeaders,
          kind: 'child',
          name: getTaskName(vacancyBrief.title, `Вакансія ${index + 1}`),
          parentTaskId: parentTask.id,
        });

        createdTasks.push(childTask);
      }
    }

    const mainTask = createdTasks[0];
    const childTasks = createdTasks.filter((task) => task.kind === 'child');
    const warnings = createdTasks.map((task) => task.warning).filter(Boolean);
    const durationMs = Date.now() - startedAt;

    console.info('[create-notion-task] completed', {
      childTaskCount: childTasks.length,
      createdTaskCount: createdTasks.length,
      durationMs,
      taskId: mainTask.id,
      taskMode: mainTask.kind,
    });

    return NextResponse.json({
      appendedBriefBlockCount: createdTasks.reduce(
        (total, task) => total + task.appendedBriefBlockCount,
        0,
      ),
      childTaskCount: childTasks.length,
      descriptionTooLong: createdTasks.some((task) => task.descriptionTooLong),
      durationMs,
      warning: warnings.length ? warnings.join(' ') : undefined,
      url: mainTask.url,
      fallbackUrl: mainTask.fallbackUrl,
      id: mainTask.id,
      tasks: createdTasks.map((task) => ({
        fallbackUrl: task.fallbackUrl,
        id: task.id,
        kind: task.kind,
        name: task.name,
        url: task.url,
      })),
    });
  } catch (error) {
    const durationMs = Date.now() - startedAt;
    const message =
      error instanceof Error
        ? error.message
        : 'Notion API повернув невідому помилку.';

    console.error('[create-notion-task] failed', { durationMs, error: message });

    return NextResponse.json(
      {
        durationMs,
        error: message,
      },
      { status: 500 },
    );
  }
}

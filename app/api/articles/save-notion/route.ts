import { NextResponse } from 'next/server';
import {
  BRAND_DESIGN_HUB_DATABASE_ID,
  BRAND_DESIGN_HUB_VIEW_ID,
  DATA_SOURCE_ID,
} from '@/lib/constants';
import { markdownToNotionBlocks, type NotionBlock } from '@/lib/markdownToNotionBlocks';
import { articleBriefSchema } from '@/features/articles/lib/schema';

export const runtime = 'nodejs';

const NOTION_API_VERSION = '2026-03-11';
const NOTION_PAGES_API_URL = 'https://api.notion.com/v1/pages';
const NOTION_BLOCKS_API_URL = 'https://api.notion.com/v1/blocks';
const APPEND_CHILDREN_BATCH_SIZE = 80;

type NotionCreatePageResponse = {
  id?: string;
  message?: string;
  url?: string;
};

type NotionApiResponse = {
  message?: string;
};

const formatLabels = {
  article: 'Стаття',
  column: 'Колонка',
  comment: 'Коментар',
  oped: 'Опед',
  press_release: 'Прес-реліз',
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

function toCompactId(id: string) {
  return id.replaceAll('-', '');
}

function buildBrandDesignPageUrl(pageId: string) {
  return `https://www.notion.so/${toCompactId(BRAND_DESIGN_HUB_DATABASE_ID)}?v=${toCompactId(
    BRAND_DESIGN_HUB_VIEW_ID,
  )}&p=${toCompactId(pageId)}&pm=s`;
}

function chunkArray<T>(items: T[], chunkSize: number) {
  const chunks: T[][] = [];

  for (let index = 0; index < items.length; index += chunkSize) {
    chunks.push(items.slice(index, index + chunkSize));
  }

  return chunks;
}

async function readNotionJson(response: Response): Promise<NotionApiResponse> {
  try {
    return (await response.json()) as NotionApiResponse;
  } catch {
    return {};
  }
}

async function appendBlockBatch(pageId: string, children: NotionBlock[], headers: Record<string, string>) {
  const response = await fetch(`${NOTION_BLOCKS_API_URL}/${normalizeNotionId(pageId)}/children`, {
    method: 'PATCH',
    headers,
    body: JSON.stringify({ children }),
  });
  const data = await readNotionJson(response);

  if (!response.ok) {
    throw new Error(data.message ?? `Notion API повернув помилку ${response.status} під час додавання тексту.`);
  }
}

async function appendBlocks(pageId: string, blocks: NotionBlock[], headers: Record<string, string>) {
  for (const batch of chunkArray(blocks, APPEND_CHILDREN_BATCH_SIZE)) {
    await appendBlockBatch(pageId, batch, headers);
  }
}

function normalizeContent(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

function getTitle(topic: string, format: keyof typeof formatLabels) {
  const cleanTopic = topic.trim();

  if (cleanTopic) {
    return `${formatLabels[format]}: ${cleanTopic}`;
  }

  return `${formatLabels[format]}: чернетка`;
}

function buildMetadataMarkdown(params: {
  brief: ReturnType<typeof articleBriefSchema.parse>;
  content: string;
  manualEdits: number;
  versionLabel: string;
}) {
  const { brief, content, manualEdits, versionLabel } = params;
  const lines = [
    `# ${getTitle(brief.topic, brief.format)}`,
    '',
    '## Метадані',
    `- Формат: ${formatLabels[brief.format]}`,
    brief.variant ? `- Версія: ${brief.variant === 'full' ? 'Розширена' : 'Скорочена'}` : '',
    brief.speakerId ? `- Speaker ID: ${brief.speakerId}` : '',
    brief.targetMedia ? `- Цільове медіа: ${brief.targetMedia}` : '',
    brief.lengthHint ? `- Довжина: ${brief.lengthHint}` : '',
    versionLabel ? `- Версія чернетки: ${versionLabel}` : '',
    `- Ручні правки: ${manualEdits}`,
    '',
    brief.thesis.length ? '## Тези' : '',
    ...brief.thesis.map((item) => `- ${item}`),
    '',
    brief.mustIncludeFacts.length ? '## Обовʼязкові факти' : '',
    ...brief.mustIncludeFacts.map((fact) => `- ${fact.label}: ${fact.value}`),
    '',
    brief.links?.length ? '## Посилання' : '',
    ...(brief.links ?? []).map((link) => `- ${link}`),
    '',
    '## Чернетка',
    content,
  ];

  return lines.filter((line, index, array) => {
    if (line) {
      return true;
    }

    return array[index - 1] && array[index + 1];
  }).join('\n');
}

export async function POST(req: Request) {
  const startedAt = Date.now();

  try {
    if (!process.env.NOTION_TOKEN || process.env.NOTION_TOKEN === 'your_notion_integration_token') {
      const durationMs = Date.now() - startedAt;

      return NextResponse.json(
        { durationMs, error: 'NOTION_TOKEN не налаштовано в .env.local або Railway variables.' },
        { status: 500 },
      );
    }

    const body = (await req.json()) as Record<string, unknown>;
    const briefResult = articleBriefSchema.safeParse(body.brief);
    const content = normalizeContent(body.content);

    if (!briefResult.success) {
      const durationMs = Date.now() - startedAt;

      return NextResponse.json(
        { durationMs, error: 'Бриф має невалідну структуру.' },
        { status: 400 },
      );
    }

    if (!content) {
      const durationMs = Date.now() - startedAt;

      return NextResponse.json(
        { durationMs, error: 'Немає тексту чернетки для збереження.' },
        { status: 400 },
      );
    }

    const manualEdits = Number.isFinite(Number(body.manualEdits)) ? Number(body.manualEdits) : 0;
    const versionLabel = normalizeContent(body.versionLabel);
    const brief = briefResult.data;
    const title = getTitle(brief.topic, brief.format);
    const headers = {
      Authorization: `Bearer ${process.env.NOTION_TOKEN}`,
      'Content-Type': 'application/json',
      'Notion-Version': NOTION_API_VERSION,
    };
    const createResponse = await fetch(NOTION_PAGES_API_URL, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        parent: {
          type: 'data_source_id',
          data_source_id: DATA_SOURCE_ID,
        },
        properties: {
          Name: {
            title: [{ text: { content: title } }],
          },
        },
      }),
    });
    const page = (await createResponse.json()) as NotionCreatePageResponse;

    if (!createResponse.ok || !page.id) {
      throw new Error(page.message ?? `Notion API повернув помилку ${createResponse.status}.`);
    }

    const markdown = buildMetadataMarkdown({
      brief,
      content,
      manualEdits,
      versionLabel,
    });
    const blocks = markdownToNotionBlocks(markdown);

    await appendBlocks(page.id, blocks, headers);

    const durationMs = Date.now() - startedAt;

    return NextResponse.json({
      appendedBlockCount: blocks.length,
      durationMs,
      fallbackUrl: page.url,
      id: page.id,
      url: page.url || buildBrandDesignPageUrl(page.id),
    });
  } catch (error) {
    const durationMs = Date.now() - startedAt;
    const message = error instanceof Error ? error.message : 'Не вдалося зберегти в Notion.';

    console.error('[articles/save-notion] failed', { durationMs, error: message });

    return NextResponse.json(
      {
        durationMs,
        error: message,
      },
      { status: 500 },
    );
  }
}

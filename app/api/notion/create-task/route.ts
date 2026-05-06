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

type NotionCreatePageResponse = {
  id?: string;
  url?: string;
  object?: string;
  message?: string;
};

type NotionPageProperties = Record<string, unknown>;

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

function splitRichTextContent(content: string) {
  const chunks = content.match(/[\s\S]{1,2000}/g) ?? [''];
  return chunks.slice(0, 50).map((chunk) => ({ text: { content: chunk } }));
}

function normalizeFormat(value: unknown) {
  if (Array.isArray(value)) {
    return value.find(
      (format): format is string => typeof format === 'string' && format.trim().length > 0,
    )?.trim() ?? '';
  }

  return typeof value === 'string' ? value.trim() : '';
}

function toCompactId(id: string) {
  return id.replaceAll('-', '');
}

function buildBrandDesignTaskUrl(pageId: string) {
  return `https://www.notion.so/${toCompactId(BRAND_DESIGN_HUB_DATABASE_ID)}?v=${toCompactId(
    BRAND_DESIGN_HUB_VIEW_ID,
  )}&p=${toCompactId(pageId)}&pm=s`;
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

    const body = await req.json();
    const requiredFields = ['name', 'deadline', 'priority', 'taskTypeId', 'brief'];
    const missingField = requiredFields.find((field) => !body[field]);

    if (missingField) {
      const durationMs = Date.now() - startedAt;

      console.warn('[create-notion-task] missing request field', { durationMs, missingField });

      return NextResponse.json(
        { durationMs, error: `Поле ${missingField} є обов'язковим.` },
        { status: 400 },
      );
    }

    const format = normalizeFormat(body.format ?? body.formats);
    const formatProperty = format ? { select: { name: format } } : undefined;
    const properties: NotionPageProperties = {
      Name: { title: [{ text: { content: body.name } }] },
      Team: { select: { name: 'Brand Design' } },
      Status: { status: { name: 'To do' } },
      Priority: { select: { name: body.priority } },
      Owner: {
        people: [{ object: 'user', id: OWNER_ID }],
      },
      Deadline: { date: { start: body.deadline } },
      ...(body.platform ? { Platform: { select: { name: body.platform } } } : {}),
      ...(formatProperty ? { [FORMAT_PROPERTY_NAME]: formatProperty } : {}),
      'Task Type': {
        relation: [{ id: normalizeNotionId(body.taskTypeId) }],
      },
      'Design needed': { checkbox: true },
      'Design Briefed': { checkbox: true },
      Description: {
        rich_text: splitRichTextContent(String(body.brief)),
      },
    };

    console.info('[create-notion-task] prepared Notion properties', {
      format,
      formatPropertyType: formatProperty ? 'select' : 'omitted',
      formatPropertyKey: formatProperty ? FORMAT_PROPERTY_NAME : null,
      receivedLegacyFormats: Array.isArray(body.formats),
    });

    const response = await fetch(NOTION_PAGES_API_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.NOTION_TOKEN}`,
        'Content-Type': 'application/json',
        'Notion-Version': NOTION_API_VERSION,
      },
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
        status: response.status,
        message: data.message,
        formatPropertyType: formatProperty ? 'select' : 'omitted',
      });

      throw new Error(data.message ?? `Notion API повернув помилку ${response.status}.`);
    }

    if (!data.id) {
      throw new Error('Notion API не повернув ID створеної задачі.');
    }

    const durationMs = Date.now() - startedAt;

    console.info('[create-notion-task] completed', { durationMs, taskId: data.id });

    return NextResponse.json({
      durationMs,
      url: buildBrandDesignTaskUrl(data.id),
      fallbackUrl: data.url ?? '',
      id: data.id,
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

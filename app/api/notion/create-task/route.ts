import { Client } from '@notionhq/client';
import { NextResponse } from 'next/server';
import { DATABASE_ID, OWNER_ID } from '@/lib/constants';

const notion = new Client({ auth: process.env.NOTION_TOKEN });

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

export async function POST(req: Request) {
  try {
    if (!process.env.NOTION_TOKEN || process.env.NOTION_TOKEN === 'your_notion_integration_token') {
      return NextResponse.json(
        { error: 'NOTION_TOKEN не налаштовано в .env.local.' },
        { status: 500 },
      );
    }

    const body = await req.json();
    const requiredFields = ['name', 'deadline', 'priority', 'taskTypeId', 'brief'];
    const missingField = requiredFields.find((field) => !body[field]);

    if (missingField) {
      return NextResponse.json(
        { error: `Поле ${missingField} є обов'язковим.` },
        { status: 400 },
      );
    }

    const response = await notion.pages.create({
      parent: { database_id: DATABASE_ID },
      properties: {
        Name: { title: [{ text: { content: body.name } }] },
        Team: { select: { name: 'Brand Design' } },
        Status: { status: { name: 'To do' } },
        Priority: { select: { name: body.priority } },
        Owner: {
          people: [{ object: 'user', id: OWNER_ID }],
        },
        Deadline: { date: { start: body.deadline } },
        ...(body.platform ? { Platform: { select: { name: body.platform } } } : {}),
        ...(body.format ? { Format: { select: { name: body.format } } } : {}),
        'Task Type': {
          relation: [{ id: normalizeNotionId(body.taskTypeId) }],
        },
        'Design needed': { checkbox: true },
        'Design Briefed': { checkbox: true },
        Description: {
          rich_text: splitRichTextContent(String(body.brief)),
        },
      },
    });

    return NextResponse.json({
      url: 'url' in response ? response.url : '',
      id: response.id,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : 'Notion API повернув невідому помилку.',
      },
      { status: 500 },
    );
  }
}

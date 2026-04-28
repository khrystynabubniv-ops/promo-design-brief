import Anthropic from '@anthropic-ai/sdk';
import { NextResponse } from 'next/server';

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

export async function POST(req: Request) {
  try {
    if (!process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_API_KEY === 'your_key_here') {
      return NextResponse.json(
        { error: 'ANTHROPIC_API_KEY не налаштовано в .env.local.' },
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

    const message = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 4000,
      system: systemPrompt,
      messages: [
        {
          role: 'user',
          content: `Ось список вакансій:\n\n${vacancies}\n\nНапиши бриф на дизайнера.`,
        },
      ],
    });

    const brief = message.content
      .filter((block) => block.type === 'text')
      .map((block) => block.text)
      .join('\n\n');

    return NextResponse.json({ brief });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : 'Anthropic API повернув невідому помилку.',
      },
      { status: 500 },
    );
  }
}

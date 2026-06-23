import { randomUUID } from 'crypto';
import { requestOpenRouterTextCompletion } from '@/lib/openrouter';
import { articleHouseCard, companyPrCard, forbiddenGlobal, pressReleaseForbiddenGlobal } from '../config/styleCards';
import { getFewshotForFormat } from '../config/fewshot';
import { assembleSystemPrompt } from './assemblePrompt';
import { getForbiddenForBrief } from './forbidden';
import { lint } from './lint';
import { postProcessDraft } from './postProcess';
import type { Brief, Draft, SpeakerCard } from '../types';

const ARTICLE_TEMPERATURE = 0.55;

function findSpeaker(speakers: SpeakerCard[], speakerId?: string | null) {
  if (!speakerId) {
    return undefined;
  }

  return speakers.find((speaker) => speaker.id === speakerId);
}

function buildFewshotBlock(brief: Brief) {
  const examples = getFewshotForFormat(brief.format);

  if (!examples.length) {
    return 'Few-shot еталони для цього формату не налаштовані.';
  }

  return examples
    .map((example, index) => [
      `ЕТАЛОН ${index + 1}: ${example.title}`,
      example.content,
    ].join('\n'))
    .join('\n\n---\n\n');
}

function buildQuoteSpeakerBlock(brief: Brief, speakers: SpeakerCard[]) {
  const quotes = brief.quotes ?? [];

  if (!quotes.length) {
    return '';
  }

  return quotes
    .map((quote) => {
      const speaker = findSpeaker(speakers, quote.speakerId);

      return [
        `quoteId: ${quote.id}`,
        `intent: ${quote.intent}`,
        speaker ? `speaker: ${speaker.name}, ${speaker.role}` : `speakerId: ${quote.speakerId}`,
        speaker?.tone?.length ? `tone: ${speaker.tone.join(', ')}` : '',
        speaker?.sentenceStyle ? `sentenceStyle: ${speaker.sentenceStyle}` : '',
      ].filter(Boolean).join('\n');
    })
    .join('\n\n');
}

function buildUserMessage(brief: Brief, speakers: SpeakerCard[]) {
  return [
    'Структурований бриф:',
    JSON.stringify(brief, null, 2),
    '',
    'Картки спікерів для цитат:',
    buildQuoteSpeakerBlock(brief, speakers) || 'Немає цитат.',
    '',
    'Few-shot еталони:',
    buildFewshotBlock(brief),
  ].join('\n');
}

function createDraft(brief: Brief, content: string): Draft {
  const versionId = randomUUID();

  return {
    id: randomUUID(),
    brief,
    activeVersionId: versionId,
    versions: [
      {
        id: versionId,
        createdAt: new Date().toISOString(),
        content,
        manualEdits: 0,
      },
    ],
  };
}

export async function generateArticleDraft(brief: Brief, speakers: SpeakerCard[]) {
  const speaker = findSpeaker(speakers, brief.speakerId);
  const system = assembleSystemPrompt(
    brief,
    {
      bylineFormat: articleHouseCard,
      institutional: companyPrCard,
      speaker,
    },
    brief.format === 'press_release' ? pressReleaseForbiddenGlobal : forbiddenGlobal,
  );
  const rawContent = await requestOpenRouterTextCompletion({
    maxTokens: brief.lengthHint === 'longread' ? 7000 : brief.format === 'comment' ? 1200 : 4500,
    messages: [
      {
        role: 'system',
        content: system,
      },
      {
        role: 'user',
        content: buildUserMessage(brief, speakers),
      },
    ],
    temperature: ARTICLE_TEMPERATURE,
  });
  const content = postProcessDraft(rawContent, brief, {
    institutional: companyPrCard,
    speakers,
  });

  return {
    content,
    draft: createDraft(brief, content),
    lint: lint(content, getForbiddenForBrief(brief, speaker)),
  };
}

export async function regenerateArticleParagraph(params: {
  brief: Brief;
  content: string;
  paragraph: string;
  paragraphIndex: number;
  speakers: SpeakerCard[];
}) {
  const speaker = findSpeaker(params.speakers, params.brief.speakerId);
  const paragraphs = params.content.split(/\n{2,}/);
  const before = paragraphs[params.paragraphIndex - 1] ?? '';
  const after = paragraphs[params.paragraphIndex + 1] ?? '';
  const system = assembleSystemPrompt(
    params.brief,
    {
      bylineFormat: articleHouseCard,
      institutional: companyPrCard,
      speaker,
    },
    params.brief.format === 'press_release' ? pressReleaseForbiddenGlobal : forbiddenGlobal,
  );

  return requestOpenRouterTextCompletion({
    maxTokens: 900,
    messages: [
      {
        role: 'system',
        content: system,
      },
      {
        role: 'user',
        content: [
          'Перепиши лише цільовий абзац. Поверни тільки новий абзац, без пояснень і без сусідніх абзаців.',
          '',
          `Попередній абзац:\n${before || 'Немає'}`,
          '',
          `Цільовий абзац:\n${params.paragraph}`,
          '',
          `Наступний абзац:\n${after || 'Немає'}`,
          '',
          'Факти й точні формулювання з брифа не змінюй.',
        ].join('\n'),
      },
    ],
    temperature: ARTICLE_TEMPERATURE,
  });
}

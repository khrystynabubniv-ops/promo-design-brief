import { z } from 'zod';
import { requestOpenRouterTextCompletion } from '@/lib/openrouter';
import { deriveLowConfidence, slugifySpeakerName } from './speakerRules';
import type { SpeakerCard } from '../types';

const extractedSpeakerSchema = z.object({
  archetype: z.string().trim().optional(),
  addressForm: z.string().trim().optional(),
  anglicisms: z.string().trim().optional(),
  sentenceStyle: z.string().trim().optional(),
  tone: z.array(z.string().trim().min(1)).optional(),
  signatureMoves: z.array(z.string().trim().min(1)).optional(),
  lexiconYes: z.array(z.string().trim().min(1)).optional(),
  lexiconNo: z.array(z.string().trim().min(1)).optional(),
  emoji: z.string().trim().optional(),
  humor: z.string().trim().optional(),
  topics: z.array(z.string().trim().min(1)).optional(),
  selfReference: z.string().trim().optional(),
  formats: z.array(z.string().trim().min(1)).optional(),
  notes: z.string().trim().optional(),
}).strip();

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
  const lastBraceIndex = strippedValue.lastIndexOf('}');

  if (firstBraceIndex === -1 || lastBraceIndex === -1 || lastBraceIndex <= firstBraceIndex) {
    return strippedValue;
  }

  return strippedValue.slice(firstBraceIndex, lastBraceIndex + 1);
}

function normalizeExtractedKeys(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return value;
  }

  const rawValue = value as Record<string, unknown>;

  return {
    ...rawValue,
    addressForm: rawValue.addressForm ?? rawValue.address_form,
    sentenceStyle: rawValue.sentenceStyle ?? rawValue.sentence_style,
    signatureMoves: rawValue.signatureMoves ?? rawValue.signature_moves,
    lexiconYes: rawValue.lexiconYes ?? rawValue.lexicon_yes,
    lexiconNo: rawValue.lexiconNo ?? rawValue.lexicon_no,
    selfReference: rawValue.selfReference ?? rawValue.self_reference,
  };
}

function parseExtractedSpeakerCard(content: string) {
  let parsed: unknown;

  try {
    parsed = JSON.parse(extractJsonObject(content));
  } catch {
    throw new Error('Модель повернула невалідний JSON для картки спікера.');
  }

  const result = extractedSpeakerSchema.safeParse(normalizeExtractedKeys(parsed));

  if (!result.success) {
    throw new Error('JSON картки спікера не відповідає очікуваній схемі.');
  }

  return result.data;
}

function buildExtractionPrompt(params: {
  description: string;
  name: string;
  role: string;
  texts: string[];
}) {
  return [
    'Ти — аналітик стилю. На основі наданого опису TOV та/або зразків текстів спікера заповни картку голосу.',
    'Повертай ТІЛЬКИ валідний JSON без пояснень і без ```.',
    'Поля name, role, id НЕ заповнюй — їх задає код з вводу користувача.',
    '',
    'Описові поля (tone, signatureMoves, sentenceStyle) — стислі, конкретні, у твоїх словах, на основі ТІЛЬКИ наданого матеріалу.',
    'Нічого не вигадуй: якщо ознаки немає — лиши поле порожнім.',
    '',
    'Схема JSON:',
    '{ archetype, language, addressForm, anglicisms, sentenceStyle, tone[], signatureMoves[], lexiconYes[], lexiconNo[], emoji, humor, topics[], selfReference, formats[], notes }',
    '',
    `Імʼя: ${params.name}`,
    `Посада: ${params.role}`,
    '--- ОПИС TOV ---',
    params.description || 'Немає',
    '',
    '--- ЗРАЗКИ ТЕКСТІВ (опційно) ---',
    params.texts.length
      ? params.texts.map((text, index) => `Текст ${index + 1}:\n${text}`).join('\n\n')
      : 'Немає',
  ].join('\n');
}

export async function extractStyle(params: {
  description: string;
  name: string;
  role: string;
  texts: string[];
}): Promise<SpeakerCard> {
  const cleanTexts = params.texts.map((text) => text.trim()).filter(Boolean).slice(0, 3);
  const content = await requestOpenRouterTextCompletion({
    maxTokens: 1600,
    messages: [
      {
        role: 'system',
        content: 'Ти редактор, який витягує voice profile зі стилю письма. Повертаєш тільки JSON.',
      },
      {
        role: 'user',
        content: buildExtractionPrompt({
          ...params,
          texts: cleanTexts,
        }),
      },
    ],
    temperature: 0.2,
  });
  const extracted = parseExtractedSpeakerCard(content);

  return {
    ...extracted,
    id: slugifySpeakerName(params.name),
    name: params.name.trim(),
    role: params.role.trim(),
    language: 'uk',
    lowConfidence: deriveLowConfidence(extracted, cleanTexts.length),
    source: 'user',
  };
}

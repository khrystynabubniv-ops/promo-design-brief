import { z } from 'zod';

const trimmedString = z.string().trim();
const requiredString = trimmedString.min(1);

export const articleFormatSchema = z.enum(['press_release', 'article', 'column', 'oped', 'comment']);

export const articleFactRowSchema = z.object({
  id: requiredString,
  label: requiredString,
  value: requiredString,
});

export const articleQuoteBriefSchema = z.object({
  id: requiredString,
  speakerId: requiredString,
  intent: requiredString,
});

export const articleBriefSchema = z.object({
  format: articleFormatSchema,
  variant: z.enum(['full', 'short']).optional(),
  speakerId: trimmedString.nullable().optional(),
  topic: requiredString,
  thesis: z.array(requiredString).default([]),
  mustIncludeFacts: z.array(articleFactRowSchema).default([]),
  quotes: z.array(articleQuoteBriefSchema).optional().default([]),
  targetMedia: trimmedString.optional().default(''),
  lengthHint: z.enum(['short', 'standard', 'longread']).optional(),
  links: z.array(requiredString).optional().default([]),
});

export const speakerCardSchema = z.object({
  id: requiredString,
  name: requiredString,
  role: requiredString,
  archetype: trimmedString.optional(),
  language: z.literal('uk'),
  addressForm: trimmedString.optional(),
  anglicisms: trimmedString.optional(),
  sentenceStyle: trimmedString.optional(),
  tone: z.array(requiredString).optional(),
  signatureMoves: z.array(requiredString).optional(),
  lexiconYes: z.array(requiredString).optional(),
  lexiconNo: z.array(requiredString).optional(),
  emoji: trimmedString.optional(),
  humor: trimmedString.optional(),
  topics: z.array(requiredString).optional(),
  selfReference: trimmedString.optional(),
  formats: z.array(requiredString).optional(),
  notes: trimmedString.optional(),
  lowConfidence: z.boolean().optional(),
  source: z.enum(['seed', 'user']),
});

export const generateArticleRequestSchema = z.object({
  brief: articleBriefSchema,
  speakers: z.array(speakerCardSchema).default([]),
});

export const extractStyleRequestSchema = z.object({
  description: trimmedString.optional().default(''),
  name: requiredString,
  role: requiredString,
  texts: z.array(trimmedString).max(3).default([]),
});

export const regenerateParagraphRequestSchema = z.object({
  brief: articleBriefSchema,
  content: requiredString,
  paragraph: requiredString,
  paragraphIndex: z.coerce.number().int().min(0),
  speakers: z.array(speakerCardSchema).default([]),
});

export type ArticleBriefInput = z.infer<typeof articleBriefSchema>;
export type GenerateArticleRequest = z.infer<typeof generateArticleRequestSchema>;

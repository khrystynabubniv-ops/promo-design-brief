import { z } from 'zod';

const trimmedString = z.string().trim().min(1);

export const smmContentTypeSchema = z.enum(['expert', 'news']);
export const smmPlatformSchema = z.enum(['instagram', 'linkedin']);
export const smmFormatSchema = z.enum(['caption', 'carousel', 'both']);
export const smmAtomicFormatSchema = z.enum(['caption', 'carousel']);

export const smmGenerateRequestSchema = z.object({
  material: trimmedString,
  contentType: smmContentTypeSchema,
  platform: smmPlatformSchema,
  format: smmFormatSchema,
  speaker: z.string().trim().optional().default(''),
  ctaTopic: z.string().trim().optional().default(''),
  codeWord: z.string().trim().optional().default(''),
  variantsCount: z.coerce.number().pipe(z.union([z.literal(3), z.literal(5)])),
});

export const captionResultSchema = z.object({
  variants: z.array(
    z.object({
      angle: trimmedString,
      text: trimmedString,
      cta: trimmedString,
      hashtags: z.array(z.string().trim().min(1)).default([]),
    }),
  ).min(1),
});

export const carouselSlideSchema = z.object({
  n: z.coerce.number().int().positive(),
  role: trimmedString,
  headline: trimmedString,
  body: trimmedString,
  visualHierarchy: trimmedString,
});

export const carouselVariantSchema = z.object({
  angle: trimmedString,
  idea: trimmedString,
  audience: trimmedString,
  slides: z.array(carouselSlideSchema).min(1),
  caption: trimmedString,
  ctas: z.array(trimmedString).min(1),
  altHeadlines: z.array(trimmedString).min(1),
});

const legacyCarouselResultSchema = z.object({
  idea: trimmedString,
  audience: trimmedString,
  slides: z.array(carouselSlideSchema).min(1),
  caption: trimmedString,
  ctas: z.array(trimmedString).min(1),
  altHeadlines: z.array(trimmedString).min(1),
}).transform((carousel) => ({
  variants: [
    {
      angle: 'Основний варіант',
      ...carousel,
    },
  ],
}));

export const carouselResultSchema = z.union([
  z.object({
    variants: z.array(carouselVariantSchema).min(1),
  }),
  legacyCarouselResultSchema,
]);

export const smmGenerationResultSchema = z.object({
  captions: captionResultSchema.optional(),
  carousel: carouselResultSchema.optional(),
}).refine((result) => result.captions || result.carousel, {
  message: 'Потрібен captions або carousel.',
});

export const merchIdeasRequestSchema = z.object({
  audience: trimmedString,
  occasion: trimmedString,
  direction: trimmedString,
  budget: z.string().trim().optional().default(''),
  quantity: z.string().trim().optional().default(''),
  referenceBrands: z.string().trim().optional().default(''),
  ideasCount: z.coerce.number().int().min(1).max(10).default(5),
});

export const merchIdeaSchema = z.object({
  title: trimmedString,
  company: trimmedString,
  case: trimmedString,
  why_fits: trimmedString,
  format_packaging: trimmedString,
  source_url: z.string().trim().optional().default(''),
});

export const merchIdeasResultSchema = z.object({
  ideas: z.array(merchIdeaSchema).min(1),
});

export type SmmContentType = z.infer<typeof smmContentTypeSchema>;
export type SmmPlatform = z.infer<typeof smmPlatformSchema>;
export type SmmFormat = z.infer<typeof smmFormatSchema>;
export type SmmAtomicFormat = z.infer<typeof smmAtomicFormatSchema>;
export type SmmGenerateRequest = z.infer<typeof smmGenerateRequestSchema>;
export type CaptionResult = z.infer<typeof captionResultSchema>;
export type CarouselVariant = z.infer<typeof carouselVariantSchema>;
export type CarouselResult = z.infer<typeof carouselResultSchema>;
export type SmmGenerationResult = z.infer<typeof smmGenerationResultSchema>;
export type MerchIdeasRequest = z.infer<typeof merchIdeasRequestSchema>;
export type MerchIdea = z.infer<typeof merchIdeaSchema>;
export type MerchIdeasResult = z.infer<typeof merchIdeasResultSchema>;

export const CAPTION_SCHEMA_INSTRUCTION = `{
  "variants": [
    {
      "angle": "короткий опис кута (3-5 слів)",
      "text": "повний текст поста з абзацами",
      "cta": "заклик до дії",
      "hashtags": ["#приклад"]
    }
  ]
}`;

export const CAROUSEL_SCHEMA_INSTRUCTION = `{
  "variants": [
    {
      "angle": "короткий опис кута варіанту (3-5 слів)",
      "idea": "загальна ідея цієї каруселі: про що пост і яку думку забере людина",
      "audience": "кому цей пост найцікавіший",
      "slides": [
        {
          "n": 1,
          "role": "роль слайду (Зачепити / Контекст / Головна думка / Конкретика / Висновок / CTA)",
          "headline": "заголовок слайду",
          "body": "основний текст слайду",
          "visualHierarchy": "що найбільше, що другорядне, що винести в цифру/цитату, де лишити повітря"
        }
      ],
      "caption": "підпис до посту в TOV Universe",
      "ctas": ["варіант 1", "варіант 2", "варіант 3"],
      "altHeadlines": ["хедлайн 1", "хедлайн 2", "хедлайн 3", "хедлайн 4", "хедлайн 5"]
    }
  ]
}`;

export function getSmmSchemaInstruction(format: SmmAtomicFormat) {
  return format === 'caption' ? CAPTION_SCHEMA_INSTRUCTION : CAROUSEL_SCHEMA_INSTRUCTION;
}

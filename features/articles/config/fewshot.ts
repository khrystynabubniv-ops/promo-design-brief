import type { Format } from '../types';

export type FewshotExample = {
  title: string;
  source: string;
  content: string;
};

export const fewshotByFormat: Record<Format, FewshotExample[]> = {
  press_release: [
    {
      title: 'PDF Guru press release, short',
      source: 'placeholder',
      content:
        'Потрібен дослівний скорочений еталон із розділу 4 специфікації codex-prompt-articles-writer.md.',
    },
    {
      title: 'PDF Guru press release, full',
      source: 'placeholder',
      content:
        'Потрібен дослівний розширений еталон із розділу 4 специфікації codex-prompt-articles-writer.md.',
    },
  ],
  article: [
    {
      title: 'Надивленість… (Юлія Слаква)',
      source: 'placeholder',
      content: 'Потрібен дослівний article few-shot «Надивленість…» із розділу 4 специфікації.',
    },
    {
      title: 'Як розробникам будувати карʼєру… (Антон Пінкевич)',
      source: 'placeholder',
      content:
        'Потрібен дослівний article few-shot «Як розробникам будувати карʼєру…» із розділу 4 специфікації.',
    },
  ],
  column: [],
  oped: [],
  comment: [],
};

export function getFewshotForFormat(format: Format) {
  return fewshotByFormat[format].filter((example) => example.source !== 'placeholder');
}

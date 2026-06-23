export type Format = 'press_release' | 'article' | 'column' | 'oped' | 'comment';

export type FactRow = {
  id: string;
  label: string;
  value: string;
};

export type QuoteBrief = {
  id: string;
  speakerId: string;
  intent: string;
};

export type Brief = {
  format: Format;
  variant?: 'full' | 'short';
  speakerId?: string | null;
  topic: string;
  thesis: string[];
  mustIncludeFacts: FactRow[];
  quotes?: QuoteBrief[];
  targetMedia?: string;
  lengthHint?: 'short' | 'standard' | 'longread';
  links?: string[];
};

export type SpeakerCard = {
  id: string;
  name: string;
  role: string;
  archetype?: string;
  language: 'uk';
  addressForm?: string;
  anglicisms?: string;
  sentenceStyle?: string;
  tone?: string[];
  signatureMoves?: string[];
  lexiconYes?: string[];
  lexiconNo?: string[];
  emoji?: string;
  humor?: string;
  topics?: string[];
  selfReference?: string;
  formats?: string[];
  notes?: string;
  lowConfidence?: boolean;
  source: 'seed' | 'user';
};

export type InstitutionalCard = {
  id: 'company_pr';
  name: string;
  register?: string;
  language: 'uk';
  voicePrinciples: string[];
  tone: string[];
  structure: string[];
  sentenceStyle?: string;
  quoteRules?: string;
  lexiconYes: string[];
  lexiconNo: string[];
  forbidden: string[];
  quoteAttributionSuffix: string;
  boilerplate_uk: string;
  variants?: string[];
  factsOwnedByCode?: string[];
  notes?: string;
};

export type BylineFormatCard = {
  id: 'article_house';
  name: string;
  language: 'uk';
  leadPatterns?: string[];
  voicePrinciples: string[];
  structure: string[];
  devices?: string[];
  aiScope?: string;
  tone: string[];
  lexiconYes: string[];
  lexiconNo: string[];
  forbidden: string[];
  notes?: string;
};

export type DraftVersion = {
  id: string;
  createdAt: string;
  content: string;
  manualEdits: number;
};

export type Draft = {
  id: string;
  brief: Brief;
  versions: DraftVersion[];
  activeVersionId: string;
};

export type SpeakerCardVersion = {
  id: string;
  createdAt: string;
  card: SpeakerCard;
};

export type StoredSpeakerCard = SpeakerCard & {
  versions: SpeakerCardVersion[];
};

export type GenerateArticleResult = {
  draft: Draft;
  content: string;
  lint: Array<{
    start: number;
    end: number;
    term: string;
    reason: string;
  }>;
};

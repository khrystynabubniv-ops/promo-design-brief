import type { SpeakerCard } from '../types';

function createId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export function slugifySpeakerName(name: string) {
  const normalized = name
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9а-яіїєґ]+/giu, '-')
    .replace(/^-+|-+$/g, '');

  return normalized || `speaker-${createId()}`;
}

export function deriveLowConfidence(card: Pick<SpeakerCard, 'sentenceStyle' | 'tone'>, sampleCount = 2) {
  return !card.sentenceStyle?.trim() || !card.tone?.length || sampleCount <= 1;
}

export function canUseSpeakerForGeneration(card: SpeakerCard) {
  return Boolean(
    card.name.trim() &&
    card.role.trim() &&
    card.addressForm?.trim() &&
    card.sentenceStyle?.trim() &&
    card.tone?.length,
  );
}

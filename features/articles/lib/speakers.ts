'use client';

import { getSeedSpeakerCardVersions } from '../config/styleCards';
import {
  canUseSpeakerForGeneration,
  deriveLowConfidence,
  slugifySpeakerName,
} from './speakerRules';
import type { SpeakerCard, StoredSpeakerCard } from '../types';

export const SPEAKERS_STORAGE_KEY = 'articles_speaker_cards';

function createId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}
export { canUseSpeakerForGeneration, deriveLowConfidence, slugifySpeakerName };

function normalizeStoredCard(card: StoredSpeakerCard): StoredSpeakerCard {
  const normalizedCard: SpeakerCard = {
    ...card,
    language: 'uk',
    lowConfidence: deriveLowConfidence(card, 2) || card.lowConfidence,
  };

  return {
    ...normalizedCard,
    versions: Array.isArray(card.versions) && card.versions.length
      ? card.versions
      : [
          {
            id: createId(),
            createdAt: new Date().toISOString(),
            card: normalizedCard,
          },
        ],
  };
}

function readUserCards() {
  if (typeof window === 'undefined') {
    return [];
  }

  try {
    const rawValue = window.localStorage.getItem(SPEAKERS_STORAGE_KEY);

    if (!rawValue) {
      return [];
    }

    const parsed: unknown = JSON.parse(rawValue);

    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed
      .filter((item): item is StoredSpeakerCard => Boolean(
        item &&
        typeof item === 'object' &&
        typeof (item as Partial<StoredSpeakerCard>).id === 'string' &&
        typeof (item as Partial<StoredSpeakerCard>).name === 'string' &&
        typeof (item as Partial<StoredSpeakerCard>).role === 'string',
      ))
      .map(normalizeStoredCard);
  } catch {
    return [];
  }
}

function writeUserCards(cards: StoredSpeakerCard[]) {
  if (typeof window === 'undefined') {
    return;
  }

  window.localStorage.setItem(
    SPEAKERS_STORAGE_KEY,
    JSON.stringify(cards.filter((card) => card.source === 'user')),
  );
}

export function listSpeakerCards(): StoredSpeakerCard[] {
  const userCards = readUserCards();
  const byId = new Map<string, StoredSpeakerCard>();

  getSeedSpeakerCardVersions().forEach((card) => {
    byId.set(card.id, normalizeStoredCard(card));
  });
  userCards.forEach((card) => {
    byId.set(card.id, normalizeStoredCard(card));
  });

  return Array.from(byId.values()).sort((left, right) => left.name.localeCompare(right.name, 'uk'));
}

export function createSpeakerCard(card: Omit<SpeakerCard, 'id' | 'language' | 'source'> & {
  id?: string;
  lowConfidence?: boolean;
  sampleCount?: number;
}): StoredSpeakerCard {
  const baseCard: SpeakerCard = {
    ...card,
    id: card.id?.trim() || slugifySpeakerName(card.name),
    language: 'uk',
    lowConfidence: card.lowConfidence ?? deriveLowConfidence(card, card.sampleCount ?? 2),
    source: 'user',
  };
  const storedCard: StoredSpeakerCard = {
    ...baseCard,
    versions: [
      {
        id: createId(),
        createdAt: new Date().toISOString(),
        card: baseCard,
      },
    ],
  };
  const nextCards = [
    storedCard,
    ...readUserCards().filter((item) => item.id !== storedCard.id),
  ];

  writeUserCards(nextCards);

  return storedCard;
}

export function updateSpeakerCard(id: string, patch: Partial<SpeakerCard>): StoredSpeakerCard | null {
  const currentCards = listSpeakerCards();
  const currentCard = currentCards.find((card) => card.id === id);

  if (!currentCard) {
    return null;
  }

  const updatedCard: SpeakerCard = {
    ...currentCard,
    ...patch,
    id: currentCard.id,
    language: 'uk',
    source: currentCard.source,
  };
  updatedCard.lowConfidence = deriveLowConfidence(updatedCard, 2) || updatedCard.lowConfidence;

  const storedCard: StoredSpeakerCard = {
    ...updatedCard,
    versions: [
      ...currentCard.versions,
      {
        id: createId(),
        createdAt: new Date().toISOString(),
        card: updatedCard,
      },
    ],
  };
  const userCards = readUserCards();
  const nextCards = storedCard.source === 'user'
    ? [
        storedCard,
        ...userCards.filter((card) => card.id !== id),
      ]
    : [
        {
          ...storedCard,
          source: 'user' as const,
        },
        ...userCards.filter((card) => card.id !== id),
      ];

  writeUserCards(nextCards);

  return storedCard;
}

export function removeSpeakerCard(id: string) {
  writeUserCards(readUserCards().filter((card) => card.id !== id));
}

import type { Brief, InstitutionalCard, SpeakerCard } from '../types';

type PostProcessCards = {
  institutional: InstitutionalCard;
  speakers: SpeakerCard[];
};

function normalizeWhitespace(value: string) {
  return value.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}

function stripQuotePunctuation(value: string) {
  return value
    .replace(/^\s*["“”«]+/, '')
    .replace(/["“”»]+\s*$/, '')
    .trim();
}

function includesExactValue(text: string, value: string) {
  return text.includes(value.trim());
}

function appendSection(content: string, title: string, lines: string[]) {
  const cleanLines = lines.map((line) => line.trim()).filter(Boolean);

  if (!cleanLines.length) {
    return content;
  }

  return normalizeWhitespace([
    content,
    `${title}\n${cleanLines.join('\n')}`,
  ].filter(Boolean).join('\n\n'));
}

function canonicalizeQuoteLines(content: string, brief: Brief, speakers: SpeakerCard[], suffix: string) {
  const quotes = brief.quotes ?? [];

  if (!quotes.length) {
    return content;
  }

  return quotes.reduce((currentContent, quote) => {
    const speaker = speakers.find((card) => card.id === quote.speakerId);
    const markerPattern = new RegExp(`\\[QUOTE\\s+${quote.id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\]\\s*([^\\n]+)`, 'i');
    const match = currentContent.match(markerPattern);

    if (!speaker || !match) {
      return currentContent;
    }

    const quoteText = stripQuotePunctuation(match[1]);
    const attribution = `${speaker.name}, ${speaker.role} ${suffix}`.trim();

    return currentContent.replace(markerPattern, `«${quoteText}», — ${attribution}`);
  }, content);
}

function appendMissingFacts(content: string, brief: Brief) {
  const missingFacts = brief.mustIncludeFacts
    .filter((fact) => fact.value.trim() && !includesExactValue(content, fact.value))
    .map((fact) => `${fact.label}: ${fact.value}`);

  return appendSection(content, 'Факти для перевірки:', missingFacts);
}

function appendMissingLinks(content: string, brief: Brief) {
  const missingLinks = (brief.links ?? [])
    .map((link) => link.trim())
    .filter((link) => link && !includesExactValue(content, link));

  return appendSection(content, 'Посилання:', missingLinks);
}

function appendBoilerplate(content: string, institutional: InstitutionalCard) {
  const boilerplate = institutional.boilerplate_uk.trim();

  if (!boilerplate || content.includes(boilerplate)) {
    return content;
  }

  return appendSection(content, 'Про Universe Group:', [boilerplate]);
}

export function postProcessDraft(rawContent: string, brief: Brief, cards: PostProcessCards) {
  let content = normalizeWhitespace(rawContent);

  if (brief.format === 'press_release') {
    content = canonicalizeQuoteLines(
      content,
      brief,
      cards.speakers,
      cards.institutional.quoteAttributionSuffix,
    );
    content = appendMissingFacts(content, brief);
    content = appendMissingLinks(content, brief);
    content = appendBoilerplate(content, cards.institutional);
  }

  return normalizeWhitespace(content);
}

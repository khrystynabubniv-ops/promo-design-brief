import type { Brief, BylineFormatCard, InstitutionalCard, SpeakerCard } from '../types';

type PromptCards = {
  institutional: InstitutionalCard;
  bylineFormat: BylineFormatCard;
  speaker?: SpeakerCard;
};

function listItems(items: string[] | undefined, fallback = 'Немає') {
  const cleanItems = (items ?? []).map((item) => item.trim()).filter(Boolean);

  if (!cleanItems.length) {
    return fallback;
  }

  return cleanItems.map((item) => `- ${item}`).join('\n');
}

function formatFacts(brief: Brief) {
  const facts = brief.mustIncludeFacts
    .map((fact) => `${fact.label}: ${fact.value}`)
    .filter(Boolean);
  const thesis = brief.thesis.filter(Boolean).map((item) => `Теза: ${item}`);
  const links = (brief.links ?? []).filter(Boolean).map((link) => `Посилання: ${link}`);

  return [
    `Тема: ${brief.topic || 'не задано'}`,
    `Формат: ${brief.format}`,
    brief.variant ? `Версія прес-релізу: ${brief.variant}` : '',
    brief.targetMedia ? `Цільове медіа: ${brief.targetMedia}` : '',
    brief.lengthHint ? `Орієнтир довжини: ${brief.lengthHint}` : '',
    ...thesis,
    ...facts,
    ...links,
  ].filter(Boolean).join('\n');
}

function formatSpeaker(card: SpeakerCard) {
  return [
    `Імʼя: ${card.name}`,
    `Посада: ${card.role}`,
    card.archetype ? `Архетип: ${card.archetype}` : '',
    card.addressForm ? `Форма звертання: ${card.addressForm}` : '',
    card.sentenceStyle ? `Стиль речень: ${card.sentenceStyle}` : '',
    card.anglicisms ? `Англіцизми: ${card.anglicisms}` : '',
    card.tone?.length ? `Тон: ${card.tone.join(', ')}` : '',
    card.signatureMoves?.length ? `Фірмові прийоми: ${card.signatureMoves.join('; ')}` : '',
    card.lexiconYes?.length ? `Лексика так: ${card.lexiconYes.join(', ')}` : '',
    card.lexiconNo?.length ? `Лексика ні: ${card.lexiconNo.join(', ')}` : '',
    card.humor ? `Гумор: ${card.humor}` : '',
    card.selfReference ? `Самореференція: ${card.selfReference}` : '',
    card.notes ? `Нотатки: ${card.notes}` : '',
  ].filter(Boolean).join('\n');
}

function formatPressReleaseVoice(institutional: InstitutionalCard) {
  return [
    'Використовуй лише інституційний голос company_pr.',
    'HR-TOV або персональний голос автора для прес-релізу не застосовуй.',
    '',
    institutional.register ? `Регістр:\n${institutional.register}` : '',
    '',
    `Принципи:\n${listItems(institutional.voicePrinciples)}`,
    '',
    `Тон:\n${listItems(institutional.tone)}`,
    '',
    `Структура:\n${listItems(institutional.structure)}`,
    '',
    institutional.sentenceStyle ? `Стиль речень:\n${institutional.sentenceStyle}` : '',
    '',
    institutional.quoteRules ? `Правила цитат:\n${institutional.quoteRules}` : '',
    '',
    institutional.factsOwnedByCode?.length
      ? `Факти, якими володіє код:\n${listItems(institutional.factsOwnedByCode)}`
      : '',
    '',
    `Лексика так:\n${listItems(institutional.lexiconYes)}`,
    '',
    `Лексика ні:\n${listItems(institutional.lexiconNo)}`,
  ].filter(Boolean).join('\n');
}

function formatBylineVoice(bylineFormat: BylineFormatCard, speaker?: SpeakerCard) {
  const parts = [
    'Використовуй хаус-формат article_house і голос спікера.',
    '',
    `Lead patterns:\n${listItems(bylineFormat.leadPatterns)}`,
    '',
    `Хаус-принципи:\n${listItems(bylineFormat.voicePrinciples)}`,
    '',
    `Хаус-структура:\n${listItems(bylineFormat.structure)}`,
    '',
    `Прийоми:\n${listItems(bylineFormat.devices)}`,
    '',
    bylineFormat.aiScope ? `AI scope:\n${bylineFormat.aiScope}` : '',
    '',
    `Хаус-тон:\n${listItems(bylineFormat.tone)}`,
  ].filter(Boolean);

  if (speaker) {
    parts.push('', `Картка спікера:\n${formatSpeaker(speaker)}`);
  }

  if (speaker?.lowConfidence) {
    parts.push(
      '',
      'LOW CONFIDENCE FALLBACK: даних про голос спікера мало. Не обіцяй точного voice match; тримайся хаус-формату, ролі, форми звертання, стилю речень і заданого tone. Не вигадуй біографічні деталі.',
    );
  }

  return parts.join('\n');
}

function formatCommentVoice(speaker?: SpeakerCard) {
  if (!speaker) {
    return 'Використовуй короткий експертний коментар без персональних деталей, яких немає в брифі.';
  }

  return [
    'Використовуй голос спікера. Формат короткий: 1-3 абзаци або одна компактна відповідь.',
    '',
    `Картка спікера:\n${formatSpeaker(speaker)}`,
    speaker.lowConfidence
      ? '\nLOW CONFIDENCE FALLBACK: даних мало, тож спирайся на роль, форму звертання й базовий тон без імітації точного голосу.'
      : '',
  ].filter(Boolean).join('\n');
}

function formatQuotesTask(brief: Brief) {
  const quotes = brief.quotes ?? [];

  if (brief.format !== 'press_release' || !quotes.length) {
    return '';
  }

  return [
    'Цитати:',
    'Для кожної цитати напиши ТІЛЬКИ прозу цитати після маркера. Не додавай attribution, посаду, компанію або лапки; це зробить код.',
    ...quotes.map((quote) => `- [QUOTE ${quote.id}] speakerId=${quote.speakerId}; intent=${quote.intent}`),
  ].join('\n');
}

export function assembleSystemPrompt(
  brief: Brief,
  cards: PromptCards,
  forbiddenGlobal: string[],
): string {
  const voiceLayer = brief.format === 'press_release'
    ? formatPressReleaseVoice(cards.institutional)
    : brief.format === 'comment'
      ? formatCommentVoice(cards.speaker)
      : formatBylineVoice(cards.bylineFormat, cards.speaker);
  const forbidden = [
    ...forbiddenGlobal,
    ...(brief.format === 'press_release' ? cards.institutional.forbidden : []),
    ...(brief.format === 'article' || brief.format === 'column' || brief.format === 'oped'
      ? cards.bylineFormat.forbidden
      : []),
    ...(cards.speaker?.lexiconNo ?? []),
  ];

  return [
    'РОЛЬ',
    'Ти редактор PR-команди Universe Group. Твоє завдання — написати український текст у заданому форматі.',
    'AI відповідає тільки за прозу. Не вигадуй цифри, назви, посади, посилання, факти або boilerplate. Якщо факту немає у брифі, не додавай його.',
    '',
    'ШАР ГОЛОСУ',
    voiceLayer,
    '',
    'ЗАБОРОНЕНІ ФОРМУЛЮВАННЯ',
    listItems(forbidden),
    '',
    'ФАКТИ',
    formatFacts(brief),
    '',
    'ЗАВДАННЯ',
    'Напиши чернетку. Використовуй лише факти з блоку ФАКТИ. Не змінюй написання назв, цифр і посилань.',
    brief.format === 'press_release'
      ? 'Не генеруй boilerplate компанії. Не додавай attribution до цитат. Якщо потрібна цитата, використовуй маркер [QUOTE id].'
      : 'Не додавай прес-релізний boilerplate.',
    formatQuotesTask(brief),
  ].filter(Boolean).join('\n');
}

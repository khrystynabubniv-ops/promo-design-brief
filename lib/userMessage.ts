import { referenceExamples } from './referenceExamples';
import {
  CAROUSEL_VARIANT_SCHEMA_INSTRUCTION,
  getSmmSchemaInstruction,
  type SmmAtomicFormat,
  type SmmGenerateRequest,
} from './schema';

const CONTENT_TYPE_LABELS: Record<SmmGenerateRequest['contentType'], string> = {
  expert: 'Експертний',
  news: 'Інфопривід',
};

const PLATFORM_LABELS: Record<SmmGenerateRequest['platform'], string> = {
  instagram: 'Instagram',
  linkedin: 'LinkedIn',
};

const FORMAT_LABELS: Record<SmmAtomicFormat, string> = {
  caption: 'текст поста',
  carousel: 'структура каруселі',
};

function buildReferenceExamplesSection(contentType: SmmGenerateRequest['contentType']) {
  const examples = referenceExamples[contentType].filter((example) => example.text.trim());

  if (!examples.length) {
    return '';
  }

  return `Еталонні пости цього типу:
${examples
  .map((example, index) => `Приклад ${index + 1}
URL: ${example.url}
Текст:
${example.text.trim()}`)
  .join('\n\n')}`;
}

function buildLearningRulesSection(learningRules: string[] = []) {
  const normalizedRules = learningRules
    .map((rule) => rule.trim())
    .filter(Boolean);

  if (!normalizedRules.length) {
    return '';
  }

  return `Редакторська памʼять з попередніх правок:
${normalizedRules.map((rule, index) => `${index + 1}. ${rule}`).join('\n')}

Як використовувати памʼять:
- Враховуй ці правила як стилістичні та структурні вподобання редактора.
- Не копіюй із них факти, імена, назви компаній, продуктів або теми минулих постів.
- Якщо правило не релевантне цьому матеріалу, не натягуй його штучно.
- Системний TOV Universe і конкретний матеріал завжди важливіші за памʼять.`;
}

export function buildSmmUserMessage(
  params: SmmGenerateRequest,
  format: SmmAtomicFormat,
  learningRules: string[] = [],
) {
  const optionalLines = [
    params.speaker ? `Спікер: ${params.speaker}` : '',
    params.ctaTopic ? `Тематика для CTA: ${params.ctaTopic}` : '',
    params.codeWord ? `Кодове слово для CTA: ${params.codeWord}` : '',
  ].filter(Boolean);
  const examplesSection = buildReferenceExamplesSection(params.contentType);
  const learningRulesSection = buildLearningRulesSection(learningRules);

  return [
    `Тип контенту: ${CONTENT_TYPE_LABELS[params.contentType]} (${params.contentType})`,
    `Майданчик: ${PLATFORM_LABELS[params.platform]} (${params.platform})`,
    `Потрібний формат: ${FORMAT_LABELS[format]} (${format})`,
    `Кількість варіантів: ${params.variantsCount}`,
    optionalLines.join('\n'),
    `Матеріал / бриф / тема:
${params.material.trim()}`,
    learningRulesSection,
    examplesSection,
    `Поверни JSON рівно за цією схемою:
${getSmmSchemaInstruction(format)}

Додаткові технічні правила:
- Не додавай markdown, бектики або пояснення поза JSON.
- Якщо формат caption, згенеруй рівно ${params.variantsCount} варіанти у масиві variants.
- Якщо формат carousel, згенеруй рівно ${params.variantsCount} різні повні варіанти каруселі у масиві variants.
- Кожен carousel variant — це один цілісний пост-карусель, а не окремий слайд. Всередині кожного variant обовʼязково опиши кожен слайд у slides.
- Якщо формат carousel і тип expert, у кожному variant зроби слайд 1 із заголовком та іменем спікера, якщо імʼя спікера передано; слайд 7 має бути CTA.
- Якщо формат carousel і тип news, у кожному variant добери природну кількість слайдів, зазвичай 5-8.`,
  ].filter(Boolean).join('\n\n');
}

export function buildSmmCarouselVariantUserMessage(
  params: SmmGenerateRequest,
  variantIndex: number,
  learningRules: string[] = [],
) {
  const optionalLines = [
    params.speaker ? `Спікер: ${params.speaker}` : '',
    params.ctaTopic ? `Тематика для CTA: ${params.ctaTopic}` : '',
    params.codeWord ? `Кодове слово для CTA: ${params.codeWord}` : '',
  ].filter(Boolean);
  const examplesSection = buildReferenceExamplesSection(params.contentType);
  const learningRulesSection = buildLearningRulesSection(learningRules);

  return [
    `Тип контенту: ${CONTENT_TYPE_LABELS[params.contentType]} (${params.contentType})`,
    `Майданчик: ${PLATFORM_LABELS[params.platform]} (${params.platform})`,
    `Потрібний формат: один повний варіант структури каруселі`,
    `Номер варіанту: ${variantIndex} із ${params.variantsCount}`,
    optionalLines.join('\n'),
    `Матеріал / бриф / тема:
${params.material.trim()}`,
    learningRulesSection,
    examplesSection,
    `Поверни JSON рівно за цією схемою:
${CAROUSEL_VARIANT_SCHEMA_INSTRUCTION}

Додаткові технічні правила:
- Не додавай markdown, бектики або пояснення поза JSON.
- Поверни ОДИН JSON-обʼєкт, без wrapper-поля variants.
- Це має бути повний варіант каруселі, а не один слайд.
- Обовʼязково опиши кожен слайд у slides.
- Зроби цей варіант змістовно відмінним від інших можливих варіантів: інший angle, інший перший слайд, інший рух думки.
- Якщо тип expert, зроби слайд 1 із заголовком та іменем спікера, якщо імʼя спікера передано; слайд 7 має бути CTA.
- Якщо тип news, добери природну кількість слайдів, зазвичай 5-8.`,
  ].filter(Boolean).join('\n\n');
}

export function buildSmmRevisionUserMessage(
  params: SmmGenerateRequest,
  format: SmmAtomicFormat,
  currentResult: unknown,
  instruction: string,
  learningRules: string[] = [],
) {
  const optionalLines = [
    params.speaker ? `Спікер: ${params.speaker}` : '',
    params.ctaTopic ? `Тематика для CTA: ${params.ctaTopic}` : '',
    params.codeWord ? `Кодове слово для CTA: ${params.codeWord}` : '',
  ].filter(Boolean);
  const learningRulesSection = buildLearningRulesSection(learningRules);

  return [
    `Тип контенту: ${CONTENT_TYPE_LABELS[params.contentType]} (${params.contentType})`,
    `Майданчик: ${PLATFORM_LABELS[params.platform]} (${params.platform})`,
    `Потрібний формат: ${FORMAT_LABELS[format]} (${format})`,
    optionalLines.join('\n'),
    `Початковий матеріал / бриф / тема:
${params.material.trim()}`,
    learningRulesSection,
    `Поточний JSON-результат, який треба доопрацювати:
${JSON.stringify(currentResult, null, 2)}`,
    `Правка користувача:
${instruction.trim()}`,
    `Завдання:
- ДООПРАЦЮЙ поточний результат за правкою користувача, а не генеруй новий варіант з нуля.
- Збережи всі сильні частини, які користувач прямо не просив змінювати.
- Не вигадуй нові факти, цифри, ролі, назви продуктів або цитати, якщо їх немає в початковому матеріалі.
- Збережи кількість варіантів і структуру відповіді для цього формату.
- Якщо правка суперечить TOV Universe або системним правилам, адаптуй її без порушення TOV.

Поверни JSON рівно за цією схемою:
${getSmmSchemaInstruction(format)}

Додаткові технічні правила:
- Не додавай markdown, бектики або пояснення поза JSON.
- Поверни лише валідний JSON-обʼєкт у схемі формату ${format}.`,
  ].filter(Boolean).join('\n\n');
}

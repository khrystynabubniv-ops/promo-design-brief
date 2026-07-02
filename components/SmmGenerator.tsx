'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  Clipboard,
  FileText,
  History,
  Inbox,
  Layers3,
  Loader2,
  PencilLine,
  Plus,
  RefreshCw,
  WandSparkles,
} from 'lucide-react';
import { fetchGenerationHistory, isRecord } from '@/lib/historyClient';
import type {
  CaptionResult,
  CarouselVariant,
  SmmContentType,
  SmmFormat,
  SmmGenerateRequest,
  SmmGenerationResult,
  SmmPlatform,
} from '@/lib/schema';
import type { ActionStatus, GenerationHistoryItem } from '@/lib/types';

const SMM_HISTORY_STORAGE_KEY = 'smm_generation_history';
const MAX_SMM_HISTORY_ITEMS = 150;

const contentTypeOptions: Array<{ label: string; value: SmmContentType }> = [
  { label: 'Експертний', value: 'expert' },
  { label: 'Інфопривід', value: 'news' },
];

const platformOptions: Array<{ label: string; value: SmmPlatform }> = [
  { label: 'Instagram', value: 'instagram' },
  { label: 'LinkedIn', value: 'linkedin' },
];

const formatOptions: Array<{ label: string; value: SmmFormat }> = [
  { label: 'Текст', value: 'caption' },
  { label: 'Карусель', value: 'carousel' },
  { label: 'Обидва', value: 'both' },
];

const variantOptions = [3, 5] as const;

type SmmGeneratorProps = {
  onBackToHub: () => void;
};

type SmmGenerationHistoryItem = {
  id: string;
  createdAt: string;
  title: string;
  form: SmmGenerateRequest;
  result: SmmGenerationResult;
  durationMs?: number;
};

type GenerateSmmResponse = {
  durationMs?: number;
  error?: string;
  historyItem?: GenerationHistoryItem | null;
  result?: SmmGenerationResult;
};

type ReviseSmmResponse = GenerateSmmResponse;

const initialStatus: ActionStatus = { kind: 'idle' };

const initialForm: SmmGenerateRequest = {
  material: '',
  contentType: 'expert',
  platform: 'instagram',
  format: 'caption',
  speaker: '',
  ctaTopic: '',
  codeWord: '',
  variantsCount: 3,
};

async function readApiJson<T>(response: Response): Promise<T> {
  const responseText = await response.text();

  if (!responseText.trim()) {
    return {} as T;
  }

  try {
    return JSON.parse(responseText) as T;
  } catch {
    return {} as T;
  }
}

function createHistoryId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function formatDuration(value?: number) {
  if (!value) {
    return '';
  }

  return value < 1000 ? `${Math.round(value)} ms` : `${(value / 1000).toFixed(1)} s`;
}

function formatHistoryDate(value: string) {
  return new Intl.DateTimeFormat('uk-UA', {
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    month: 'short',
  }).format(new Date(value));
}

function deriveTitle(material: string) {
  const firstLine = material
    .split('\n')
    .map((line) => line.replace(/^#+\s*/, '').replaceAll('*', '').trim())
    .find(Boolean);

  if (!firstLine) {
    return 'Генерація без назви';
  }

  return firstLine.length > 76 ? `${firstLine.slice(0, 76)}...` : firstLine;
}

function trimPreview(value: string) {
  const normalized = value.replace(/\s+/g, ' ').trim();
  return normalized.length > 96 ? `${normalized.slice(0, 96)}...` : normalized;
}

function parseHistoryItems(rawHistory: string | null): SmmGenerationHistoryItem[] {
  if (!rawHistory) {
    return [];
  }

  try {
    const parsed: unknown = JSON.parse(rawHistory);

    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed
      .filter((item): item is SmmGenerationHistoryItem => {
        if (!item || typeof item !== 'object') {
          return false;
        }

        const candidate = item as Partial<SmmGenerationHistoryItem>;

        return Boolean(
          typeof candidate.id === 'string' &&
          typeof candidate.createdAt === 'string' &&
          typeof candidate.title === 'string' &&
          candidate.form &&
          candidate.result,
        );
      })
      .slice(0, MAX_SMM_HISTORY_ITEMS);
  } catch {
    return [];
  }
}

function isSmmContentType(value: unknown): value is SmmContentType {
  return value === 'expert' || value === 'news';
}

function isSmmPlatform(value: unknown): value is SmmPlatform {
  return value === 'instagram' || value === 'linkedin';
}

function isSmmFormat(value: unknown): value is SmmFormat {
  return value === 'caption' || value === 'carousel' || value === 'both';
}

function normalizeVariantsCount(value: unknown): 3 | 5 {
  return value === 5 ? 5 : 3;
}

function parseServerForm(value: unknown): SmmGenerateRequest | null {
  if (!isRecord(value) || typeof value.material !== 'string' || !value.material.trim()) {
    return null;
  }

  return {
    codeWord: typeof value.codeWord === 'string' ? value.codeWord : '',
    contentType: isSmmContentType(value.contentType) ? value.contentType : 'expert',
    ctaTopic: typeof value.ctaTopic === 'string' ? value.ctaTopic : '',
    format: isSmmFormat(value.format) ? value.format : 'caption',
    material: value.material,
    platform: isSmmPlatform(value.platform) ? value.platform : 'instagram',
    speaker: typeof value.speaker === 'string' ? value.speaker : '',
    variantsCount: normalizeVariantsCount(value.variantsCount),
  };
}

function parseServerResult(value: unknown): SmmGenerationResult | null {
  if (!isRecord(value) || (!value.captions && !value.carousel)) {
    return null;
  }

  return value as SmmGenerationResult;
}

function mapServerHistoryItem(item: GenerationHistoryItem): SmmGenerationHistoryItem | null {
  if (item.tool !== 'smm') {
    return null;
  }

  const form = parseServerForm(item.input);
  const result = parseServerResult(item.output);

  if (!form || !result) {
    return null;
  }

  return {
    createdAt: item.createdAt,
    durationMs: item.durationMs,
    form,
    id: item.id,
    result,
    title: item.title || deriveTitle(form.material),
  };
}

function mergeHistoryItems(items: SmmGenerationHistoryItem[]) {
  const deduped = new Map<string, SmmGenerationHistoryItem>();

  items.forEach((item) => {
    if (!deduped.has(item.id)) {
      deduped.set(item.id, item);
    }
  });

  return Array.from(deduped.values())
    .sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime())
    .slice(0, MAX_SMM_HISTORY_ITEMS);
}

function formatCaptionVariantForCopy(variant: CaptionResult['variants'][number]) {
  return [
    variant.text,
    variant.cta,
    variant.hashtags.length ? variant.hashtags.join(' ') : '',
  ].filter(Boolean).join('\n\n');
}

function formatCarouselVariantForCopy(variant: CarouselVariant) {
  return [
    `Кут: ${variant.angle}`,
    `Ідея: ${variant.idea}`,
    `Аудиторія: ${variant.audience}`,
    variant.slides
      .map((slide) => [
        `Слайд ${slide.n}: ${slide.role}`,
        slide.headline,
        slide.body,
        `Візуальна ієрархія: ${slide.visualHierarchy}`,
      ].join('\n'))
      .join('\n\n'),
    `Підпис:
${variant.caption}`,
    `CTA:
${variant.ctas.map((cta) => `- ${cta}`).join('\n')}`,
    `Альтернативні заголовки:
${variant.altHeadlines.map((headline) => `- ${headline}`).join('\n')}`,
  ].join('\n\n');
}

function isCarouselVariantLike(value: unknown): value is CarouselVariant {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const candidate = value as Partial<CarouselVariant>;

  return Boolean(
    typeof candidate.idea === 'string' &&
    typeof candidate.audience === 'string' &&
    Array.isArray(candidate.slides) &&
    typeof candidate.caption === 'string' &&
    Array.isArray(candidate.ctas) &&
    Array.isArray(candidate.altHeadlines),
  );
}

function getCarouselVariants(carousel: SmmGenerationResult['carousel']) {
  if (!carousel) {
    return [];
  }

  const candidate = carousel as unknown as {
    variants?: unknown;
  };

  if (Array.isArray(candidate.variants)) {
    return candidate.variants
      .filter(isCarouselVariantLike)
      .map((variant) => ({
        ...variant,
        angle: variant.angle || 'Варіант каруселі',
      }));
  }

  if (isCarouselVariantLike(carousel)) {
    return [
      {
        ...carousel,
        angle: 'Основний варіант',
      },
    ];
  }

  return [];
}

function buildFormPayload(form: SmmGenerateRequest): SmmGenerateRequest {
  return {
    ...form,
    material: form.material.trim(),
    speaker: form.speaker?.trim() ?? '',
    ctaTopic: form.ctaTopic?.trim() ?? '',
    codeWord: form.codeWord?.trim() ?? '',
  };
}

export function SmmGenerator({ onBackToHub }: SmmGeneratorProps) {
  const [form, setForm] = useState<SmmGenerateRequest>(initialForm);
  const [status, setStatus] = useState<ActionStatus>(initialStatus);
  const [result, setResult] = useState<SmmGenerationResult | null>(null);
  const [historyItems, setHistoryItems] = useState<SmmGenerationHistoryItem[]>([]);
  const [activeHistoryId, setActiveHistoryId] = useState('');
  const [lastSubmittedForm, setLastSubmittedForm] = useState<SmmGenerateRequest | null>(null);
  const [copiedKey, setCopiedKey] = useState('');
  const [revisionInstruction, setRevisionInstruction] = useState('');

  const canGenerate = Boolean(form.material.trim()) && status.kind !== 'loading';
  const isLoading = status.kind === 'loading';
  const isRevisionLoading = status.kind === 'loading' && status.message === 'Доопрацьовуємо результат...';
  const canRevise = Boolean(result && revisionInstruction.trim()) && !isLoading;

  const selectedHistoryItem = useMemo(
    () => historyItems.find((item) => item.id === activeHistoryId) ?? null,
    [activeHistoryId, historyItems],
  );

  useEffect(() => {
    const savedHistory = parseHistoryItems(window.localStorage.getItem(SMM_HISTORY_STORAGE_KEY));
    let cancelled = false;

    setHistoryItems(savedHistory);
    setActiveHistoryId(savedHistory[0]?.id ?? '');

    async function loadServerHistory() {
      try {
        const serverHistory = (await fetchGenerationHistory('smm'))
          .map(mapServerHistoryItem)
          .filter((item): item is SmmGenerationHistoryItem => Boolean(item));

        if (cancelled) {
          return;
        }

        setHistoryItems((current) => mergeHistoryItems([...serverHistory, ...current]));
        setActiveHistoryId((current) => current || serverHistory[0]?.id || savedHistory[0]?.id || '');
      } catch (error) {
        console.warn('[SMM Generator] failed to load server history', error);
      }
    }

    void loadServerHistory();

    return () => {
      cancelled = true;
    };
  }, []);

  function updateForm(patch: Partial<SmmGenerateRequest>) {
    setForm((current) => ({ ...current, ...patch }));
    setStatus(initialStatus);
  }

  function saveHistoryItem(item: SmmGenerationHistoryItem) {
    setHistoryItems((current) => mergeHistoryItems([
      item,
      ...current.filter((historyItem) => historyItem.id !== item.id),
    ]));
    setActiveHistoryId(item.id);
  }

  async function copyText(value: string, key: string) {
    await navigator.clipboard.writeText(value);
    setCopiedKey(key);
    window.setTimeout(() => setCopiedKey(''), 1600);
  }

  async function submitGeneration(nextForm: SmmGenerateRequest) {
    const payload = buildFormPayload(nextForm);
    const requestStartedAt = performance.now();

    if (!payload.material) {
      setStatus({ kind: 'error', message: 'Додайте матеріал, бриф або тему.' });
      return;
    }

    setForm(payload);
    setLastSubmittedForm(payload);
    setStatus({ kind: 'loading', message: 'Генеруємо текст...' });

    try {
      const response = await fetch('/api/generate-smm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await readApiJson<GenerateSmmResponse>(response);

      if (!response.ok || !data.result) {
        throw new Error(data.error ?? `Не вдалося згенерувати текст. Сервер повернув ${response.status}.`);
      }

      const durationMs = Math.round(performance.now() - requestStartedAt);
      const serverHistoryItem = data.historyItem
        ? mapServerHistoryItem(data.historyItem)
        : null;
      const historyItem: SmmGenerationHistoryItem = serverHistoryItem ?? {
        createdAt: new Date().toISOString(),
        durationMs,
        form: payload,
        id: createHistoryId(),
        result: data.result,
        title: deriveTitle(payload.material),
      };

      setResult(data.result);
      saveHistoryItem(historyItem);
      setRevisionInstruction('');
      setStatus({
        kind: 'success',
        message: `Готово за ${formatDuration(data.durationMs ?? durationMs)}.`,
      });
    } catch (error) {
      setStatus({
        kind: 'error',
        message: error instanceof Error ? error.message : 'Сталася помилка генерації.',
      });
    }
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void submitGeneration(form);
  }

  function handleMoreVariants() {
    if (!lastSubmittedForm) {
      return;
    }

    void submitGeneration(lastSubmittedForm);
  }

  function selectHistoryItem(item: SmmGenerationHistoryItem) {
    setActiveHistoryId(item.id);
    setForm(item.form);
    setResult(item.result);
    setLastSubmittedForm(item.form);
    setRevisionInstruction('');
    setStatus(initialStatus);
  }

  async function submitRevision() {
    const instruction = revisionInstruction.trim();

    if (!result || !instruction) {
      setStatus({ kind: 'error', message: 'Додайте правку до результату.' });
      return;
    }

    const sourceForm = selectedHistoryItem?.form ?? lastSubmittedForm ?? buildFormPayload(form);

    if (!sourceForm.material.trim()) {
      setStatus({ kind: 'error', message: 'Немає початкового матеріалу для доопрацювання.' });
      return;
    }

    const requestStartedAt = performance.now();

    setStatus({ kind: 'loading', message: 'Доопрацьовуємо результат...' });

    try {
      const response = await fetch('/api/generate-smm/revise', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          form: buildFormPayload(sourceForm),
          instruction,
          result,
        }),
      });
      const data = await readApiJson<ReviseSmmResponse>(response);

      if (!response.ok || !data.result) {
        throw new Error(data.error ?? `Не вдалося доопрацювати результат. Сервер повернув ${response.status}.`);
      }

      const durationMs = Math.round(performance.now() - requestStartedAt);
      const serverHistoryItem = data.historyItem
        ? mapServerHistoryItem(data.historyItem)
        : null;
      const revisedForm = buildFormPayload(sourceForm);
      const historyItem: SmmGenerationHistoryItem = serverHistoryItem ?? {
        createdAt: new Date().toISOString(),
        durationMs,
        form: revisedForm,
        id: createHistoryId(),
        result: data.result,
        title: `Доопрацювання: ${deriveTitle(revisedForm.material)}`,
      };

      setForm(revisedForm);
      setLastSubmittedForm(revisedForm);
      setResult(data.result);
      saveHistoryItem(historyItem);
      setRevisionInstruction('');
      setStatus({
        kind: 'success',
        message: `Доопрацьовано за ${formatDuration(data.durationMs ?? durationMs)}.`,
      });
    } catch (error) {
      setStatus({
        kind: 'error',
        message: error instanceof Error ? error.message : 'Сталася помилка доопрацювання.',
      });
    }
  }

  function createNewGeneration() {
    setForm(initialForm);
    setResult(null);
    setLastSubmittedForm(null);
    setRevisionInstruction('');
    setStatus(initialStatus);
    setActiveHistoryId('');
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <button
          className="ct-secondary-action ct-action-compact"
          onClick={onBackToHub}
          type="button"
        >
          <Layers3 className="h-4 w-4 text-[#1d4ed8]" aria-hidden="true" />
          До пулу тулів
        </button>

        <button
          className="ct-secondary-action ct-action-compact"
          onClick={createNewGeneration}
          type="button"
        >
          <Plus className="h-4 w-4 text-[#1d4ed8]" aria-hidden="true" />
          Нова генерація
        </button>
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="space-y-6">
          <form className="space-y-5" onSubmit={handleSubmit}>
            <section className="ct-app-panel p-5">
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div className="md:col-span-2">
                  <label className="ct-app-label" htmlFor="smmMaterial">
                    Матеріал / бриф / тема *
                  </label>
                  <textarea
                    className="ct-app-field min-h-64 w-full p-4 leading-6"
                    id="smmMaterial"
                    placeholder="Вставте статтю, інтервʼю, тези або коротко опишіть тему..."
                    value={form.material}
                    onChange={(event) => updateForm({ material: event.target.value })}
                  />
                </div>

                <div>
                  <label className="ct-app-label" htmlFor="contentType">
                    Тип контенту
                  </label>
                  <select
                    className="ct-app-field h-11 w-full px-3"
                    id="contentType"
                    value={form.contentType}
                    onChange={(event) => updateForm({ contentType: event.target.value as SmmContentType })}
                  >
                    {contentTypeOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="ct-app-label" htmlFor="platform">
                    Майданчик
                  </label>
                  <select
                    className="ct-app-field h-11 w-full px-3"
                    id="platform"
                    value={form.platform}
                    onChange={(event) => updateForm({ platform: event.target.value as SmmPlatform })}
                  >
                    {platformOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>

                <fieldset className="md:col-span-2">
                  <legend className="ct-app-label">Формат</legend>
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                    {formatOptions.map((option) => {
                      const selected = form.format === option.value;

                      return (
                        <button
                          aria-pressed={selected}
                          className={[
                            'ct-choice-card min-h-11 px-3 py-2 text-left text-sm font-bold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1d4ed8] focus-visible:ring-offset-2',
                            selected ? 'ct-choice-card-active' : '',
                          ].join(' ')}
                          key={option.value}
                          onClick={() => updateForm({ format: option.value })}
                          type="button"
                        >
                          {option.label}
                        </button>
                      );
                    })}
                  </div>
                </fieldset>

                <div>
                  <label className="ct-app-label" htmlFor="speaker">
                    Спікер
                  </label>
                  <input
                    className="ct-app-field h-11 w-full px-3"
                    id="speaker"
                    placeholder="Імʼя для експертної каруселі"
                    value={form.speaker}
                    onChange={(event) => updateForm({ speaker: event.target.value })}
                  />
                </div>

                <div>
                  <label className="ct-app-label" htmlFor="variantsCount">
                    Кількість варіантів
                  </label>
                  <select
                    className="ct-app-field h-11 w-full px-3"
                    id="variantsCount"
                    value={form.variantsCount}
                    onChange={(event) => updateForm({ variantsCount: Number(event.target.value) as 3 | 5 })}
                  >
                    {variantOptions.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="ct-app-label" htmlFor="ctaTopic">
                    Тематика для CTA
                  </label>
                  <input
                    className="ct-app-field h-11 w-full px-3"
                    id="ctaTopic"
                    placeholder="які будують HR-комунікації"
                    value={form.ctaTopic}
                    onChange={(event) => updateForm({ ctaTopic: event.target.value })}
                  />
                </div>

                <div>
                  <label className="ct-app-label" htmlFor="codeWord">
                    Кодове слово
                  </label>
                  <input
                    className="ct-app-field h-11 w-full px-3"
                    id="codeWord"
                    placeholder="СТАТТЯ"
                    value={form.codeWord}
                    onChange={(event) => updateForm({ codeWord: event.target.value })}
                  />
                </div>
              </div>
            </section>

            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-3">
                <button
                  className="ct-primary-action"
                  disabled={!canGenerate}
                  type="submit"
                >
                  {isLoading ? (
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                  ) : (
                    <WandSparkles className="h-4 w-4" aria-hidden="true" />
                  )}
                  Згенерувати
                </button>

                <button
                  className="ct-secondary-action"
                  disabled={!lastSubmittedForm || isLoading}
                  onClick={handleMoreVariants}
                  type="button"
                >
                  <RefreshCw className="h-4 w-4" aria-hidden="true" />
                  Ще варіанти
                </button>
              </div>

              {status.message ? (
                <span
                  className={[
                    'ct-status-pill',
                    status.kind === 'error'
                      ? 'ct-status-pill-error'
                      : status.kind === 'success'
                        ? 'ct-status-pill-success'
                        : 'ct-status-pill-info',
                  ].join(' ')}
                >
                  {status.message}
                </span>
              ) : null}
            </div>
          </form>

          <SmmResults
            canRevise={canRevise}
            copiedKey={copiedKey}
            isRevisionLoading={isRevisionLoading}
            revisionInstruction={revisionInstruction}
            result={result}
            onCopy={copyText}
            onRevise={submitRevision}
            onRevisionInstructionChange={setRevisionInstruction}
          />
        </div>

        <aside className="ct-app-panel overflow-hidden">
          <div className="flex items-center justify-between gap-3 border-b border-[#e7e9ee] px-4 py-4">
            <div className="flex items-center gap-3">
              <span className="ct-accent-icon">
                <History className="h-4 w-4" aria-hidden="true" />
              </span>
              <div>
                <h2 className="text-sm font-bold text-[#181b22]">Історія</h2>
                <p className="text-xs font-medium text-[#7b8392]">{historyItems.length} записів</p>
              </div>
            </div>
          </div>

          {historyItems.length ? (
            <div className="max-h-[760px] overflow-y-auto">
              {historyItems.map((item) => {
                const selected = selectedHistoryItem?.id === item.id;

                return (
                  <div
                    className={[
                      'border-b border-[#e7e9ee] last:border-b-0',
                      selected ? 'bg-[#f7f9ff] text-[#181b22]' : 'bg-white text-[#181b22]',
                    ].join(' ')}
                    key={item.id}
                  >
                    <button
                      className="block w-full px-4 py-4 text-left transition hover:bg-[#fafbfc]"
                      onClick={() => selectHistoryItem(item)}
                      type="button"
                    >
                      <span className="block text-sm font-semibold leading-5">{item.title}</span>
                      <span className={selected ? 'mt-2 block text-xs font-semibold text-[#1d4ed8]' : 'mt-2 block text-xs text-[#7b8392]'}>
                        {formatHistoryDate(item.createdAt)}
                      </span>
                      <span className={selected ? 'mt-3 block text-xs text-[#5b6472]' : 'mt-3 block text-xs text-[#7b8392]'}>
                        {trimPreview(item.form.material)}
                      </span>
                      {item.durationMs ? (
                        <span className={selected ? 'mt-3 block text-xs font-bold text-[#1d4ed8]' : 'mt-3 block text-xs font-bold text-[#181b22]'}>
                          {formatDuration(item.durationMs)}
                        </span>
                      ) : null}
                    </button>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="flex min-h-48 flex-col items-center justify-center px-5 py-10 text-center">
              <Inbox className="h-8 w-8 text-[#a4abb6]" aria-hidden="true" />
              <p className="mt-3 text-sm font-bold text-[#181b22]">Історія поки порожня</p>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}

type SmmResultsProps = {
  canRevise: boolean;
  copiedKey: string;
  isRevisionLoading: boolean;
  revisionInstruction: string;
  result: SmmGenerationResult | null;
  onCopy: (value: string, key: string) => void;
  onRevise: () => void;
  onRevisionInstructionChange: (value: string) => void;
};

function SmmResults({
  canRevise,
  copiedKey,
  isRevisionLoading,
  revisionInstruction,
  result,
  onCopy,
  onRevise,
  onRevisionInstructionChange,
}: SmmResultsProps) {
  if (!result) {
    return (
      <section className="ct-empty-state p-8 text-center">
        <FileText className="mx-auto h-8 w-8 text-[#a4abb6]" aria-hidden="true" />
        <h2 className="mt-3 text-base font-bold text-[#181b22]">Результати зʼявляться тут</h2>
        <p className="mt-2 text-sm leading-6 text-[#7b8392]">
          Можна генерувати текст поста, структуру каруселі або обидва формати одразу.
        </p>
      </section>
    );
  }

  const carouselVariants = getCarouselVariants(result.carousel);

  return (
    <div className="space-y-6">
      <section className="ct-app-panel p-5">
        <div className="flex items-start gap-3">
          <span className="ct-accent-icon mt-0.5">
            <PencilLine className="h-4 w-4" aria-hidden="true" />
          </span>
          <div className="min-w-0 flex-1">
            <label className="ct-app-label" htmlFor="smmRevisionInstruction">
              Правки до результату
            </label>
            <textarea
              className="ct-app-field min-h-28 w-full p-4 leading-6"
              disabled={isRevisionLoading}
              id="smmRevisionInstruction"
              placeholder="Наприклад: зроби менш пафосно, скороти CTA, перший слайд має бути конкретнішим..."
              value={revisionInstruction}
              onChange={(event) => onRevisionInstructionChange(event.target.value)}
            />
            <div className="mt-3 flex justify-end">
              <button
                className="ct-primary-action"
                disabled={!canRevise}
                onClick={onRevise}
                type="button"
              >
                {isRevisionLoading ? (
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                ) : (
                  <PencilLine className="h-4 w-4" aria-hidden="true" />
                )}
                Доопрацювати
              </button>
            </div>
          </div>
        </div>
      </section>

      {result.captions ? (
        <section className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-lg font-bold tracking-normal text-[#181b22]">Тексти поста</h2>
          </div>
          {result.captions.variants.map((variant, index) => {
            const copyKey = `caption-${index}`;

            return (
              <article
                className="ct-app-panel p-5"
                key={`${variant.angle}-${index}`}
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-xs font-bold uppercase tracking-normal text-[#939bab]">
                      Варіант {index + 1}
                    </p>
                    <h3 className="mt-1 text-base font-bold text-[#181b22]">{variant.angle}</h3>
                  </div>
                  <CopyButton
                    copied={copiedKey === copyKey}
                    onClick={() => onCopy(formatCaptionVariantForCopy(variant), copyKey)}
                  />
                </div>

                <p className="mt-4 whitespace-pre-wrap text-sm leading-6 text-[#2a3038]">{variant.text}</p>
                <div className="ct-app-panel-subtle mt-4 p-3">
                  <p className="text-xs font-bold uppercase tracking-normal text-[#939bab]">CTA</p>
                  <p className="mt-1 text-sm font-bold text-[#181b22]">{variant.cta}</p>
                </div>
                {variant.hashtags.length ? (
                  <p className="mt-3 text-sm font-medium leading-6 text-[#7b8392]">
                    {variant.hashtags.join(' ')}
                  </p>
                ) : null}
              </article>
            );
          })}
        </section>
      ) : null}

      {carouselVariants.length ? (
        <section className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-lg font-bold tracking-normal text-[#181b22]">
              Карусельні варіанти
            </h2>
            <p className="text-sm font-medium text-[#7b8392]">
              {carouselVariants.length} варіанти
            </p>
          </div>

          {carouselVariants.map((variant, variantIndex) => {
            const copyKey = `carousel-${variantIndex}`;

            return (
              <article
                className="ct-app-panel p-5"
                key={`${variant.angle}-${variantIndex}`}
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-xs font-bold uppercase tracking-normal text-[#939bab]">
                      Варіант {variantIndex + 1}
                    </p>
                    <h3 className="mt-1 text-base font-bold text-[#181b22]">{variant.angle}</h3>
                    <p className="mt-2 max-w-3xl text-sm leading-6 text-[#2a3038]">{variant.idea}</p>
                    <p className="mt-1 max-w-3xl text-sm leading-6 text-[#7b8392]">{variant.audience}</p>
                  </div>
                  <CopyButton
                    copied={copiedKey === copyKey}
                    onClick={() => onCopy(formatCarouselVariantForCopy(variant), copyKey)}
                  />
                </div>

                <div className="mt-5 overflow-hidden rounded-[12px] border border-[#e7e9ee]">
                  {variant.slides.map((slide) => (
                    <div
                      className="grid grid-cols-1 gap-3 border-b border-[#e7e9ee] bg-[#fafbfc] p-4 last:border-b-0 md:grid-cols-[112px_1fr]"
                      key={slide.n}
                    >
                      <div>
                        <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-[#1d4ed8] text-xs font-bold text-white">
                          {slide.n}
                        </span>
                        <p className="mt-2 text-xs font-bold uppercase tracking-normal text-[#939bab]">
                          {slide.role}
                        </p>
                      </div>
                      <div>
                        <h4 className="text-sm font-bold leading-6 text-[#181b22]">{slide.headline}</h4>
                        <p className="mt-1 whitespace-pre-wrap text-sm leading-6 text-[#2a3038]">{slide.body}</p>
                        <p className="mt-3 text-xs font-medium leading-5 text-[#7b8392]">
                          {slide.visualHierarchy}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="mt-5 grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_280px]">
                  <div className="ct-app-panel-subtle p-4">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-xs font-bold uppercase tracking-normal text-[#939bab]">Підпис</p>
                      <CopyButton
                        copied={copiedKey === `carousel-caption-${variantIndex}`}
                        onClick={() => onCopy(variant.caption, `carousel-caption-${variantIndex}`)}
                      />
                    </div>
                    <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-[#2a3038]">
                      {variant.caption}
                    </p>
                  </div>

                  <div className="space-y-4">
                    <div className="ct-app-panel-subtle p-4">
                      <p className="text-xs font-bold uppercase tracking-normal text-[#939bab]">CTA</p>
                      <ul className="mt-2 space-y-2 text-sm leading-6 text-[#2a3038]">
                        {variant.ctas.map((cta) => (
                          <li key={cta}>{cta}</li>
                        ))}
                      </ul>
                    </div>
                    <div className="ct-app-panel-subtle p-4">
                      <p className="text-xs font-bold uppercase tracking-normal text-[#939bab]">
                        Альт. заголовки
                      </p>
                      <ul className="mt-2 space-y-2 text-sm leading-6 text-[#2a3038]">
                        {variant.altHeadlines.map((headline) => (
                          <li key={headline}>{headline}</li>
                        ))}
                      </ul>
                    </div>
                  </div>
                </div>
              </article>
            );
          })}
        </section>
      ) : null}
    </div>
  );
}

type CopyButtonProps = {
  copied: boolean;
  onClick: () => void;
};

function CopyButton({ copied, onClick }: CopyButtonProps) {
  return (
    <button
      className="ct-secondary-action ct-action-small"
      onClick={onClick}
      type="button"
    >
      <Clipboard className="h-3.5 w-3.5 text-[#1d4ed8]" aria-hidden="true" />
      {copied ? 'Скопійовано' : 'Копіювати'}
    </button>
  );
}

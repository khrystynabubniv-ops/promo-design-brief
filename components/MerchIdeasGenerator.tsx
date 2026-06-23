'use client';

import {
  ExternalLink,
  Gift,
  History,
  Inbox,
  Layers3,
  Loader2,
  PackageCheck,
  Plus,
  Search,
  WandSparkles,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { fetchGenerationHistory, getStringField, isRecord } from '@/lib/historyClient';
import type { MerchIdea, MerchIdeasRequest, MerchIdeasResult } from '@/lib/schema';
import type { ActionStatus, GenerationHistoryItem } from '@/lib/types';

const referenceBrandsPlaceholder = 'Jacquemus, Balenciaga, Cursor, Apple WWDC, Red Bull, Gisou, Supreme, Carhartt WIP, Figma, Anthropic';

const initialStatus: ActionStatus = { kind: 'idle' };

const initialForm: MerchIdeasRequest = {
  audience: '',
  occasion: '',
  direction: '',
  budget: '',
  quantity: '',
  referenceBrands: '',
  ideasCount: 3,
};

type MerchIdeasGeneratorProps = {
  onBackToHub: () => void;
};

type GenerateMerchIdeasResponse = {
  durationMs?: number;
  error?: string;
  historyItem?: GenerationHistoryItem | null;
  result?: MerchIdeasResult;
};

type MerchIdeasHistoryItem = {
  id: string;
  createdAt: string;
  title: string;
  form: MerchIdeasRequest;
  result: MerchIdeasResult;
  durationMs?: number;
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

function trimPreview(value: string) {
  const normalized = value.replace(/\s+/g, ' ').trim();

  return normalized.length > 110 ? `${normalized.slice(0, 110)}...` : normalized;
}

function normalizeIdeasCount(value: number) {
  if (!Number.isFinite(value)) {
    return 3;
  }

  return Math.min(5, Math.max(1, Math.round(value)));
}

function buildFormPayload(form: MerchIdeasRequest): MerchIdeasRequest {
  return {
    audience: form.audience.trim(),
    occasion: form.occasion.trim(),
    direction: form.direction.trim(),
    budget: form.budget.trim(),
    quantity: form.quantity.trim(),
    referenceBrands: form.referenceBrands.trim(),
    ideasCount: normalizeIdeasCount(form.ideasCount),
  };
}

function deriveHistoryTitle(occasion: string, firstIdeaTitle?: string) {
  const title = firstIdeaTitle?.trim() || occasion.trim() || 'Ідеї для мерчу';

  return title.length > 76 ? `${title.slice(0, 76)}...` : title;
}

function parseServerForm(value: unknown): MerchIdeasRequest | null {
  if (!isRecord(value)) {
    return null;
  }

  const audience = getStringField(value, 'audience');
  const occasion = getStringField(value, 'occasion');
  const direction = getStringField(value, 'direction');

  if (!audience || !occasion || !direction) {
    return null;
  }

  return {
    audience,
    budget: getStringField(value, 'budget'),
    direction,
    ideasCount: normalizeIdeasCount(Number(value.ideasCount ?? 3)),
    occasion,
    quantity: getStringField(value, 'quantity'),
    referenceBrands: getStringField(value, 'referenceBrands'),
  };
}

function parseServerResult(value: unknown): MerchIdeasResult | null {
  if (!isRecord(value) || !Array.isArray(value.ideas) || !value.ideas.length) {
    return null;
  }

  return value as MerchIdeasResult;
}

function mapServerHistoryItem(item: GenerationHistoryItem): MerchIdeasHistoryItem | null {
  if (item.tool !== 'merch') {
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
    title: item.title || deriveHistoryTitle(form.occasion, result.ideas[0]?.title),
  };
}

function mergeHistoryItems(items: MerchIdeasHistoryItem[]) {
  const deduped = new Map<string, MerchIdeasHistoryItem>();

  items.forEach((item) => {
    if (!deduped.has(item.id)) {
      deduped.set(item.id, item);
    }
  });

  return Array.from(deduped.values())
    .sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime())
    .slice(0, 150);
}

function isHttpUrl(value: string) {
  try {
    const url = new URL(value);
    return ['http:', 'https:'].includes(url.protocol);
  } catch {
    return false;
  }
}

export function MerchIdeasGenerator({ onBackToHub }: MerchIdeasGeneratorProps) {
  const [form, setForm] = useState<MerchIdeasRequest>(initialForm);
  const [status, setStatus] = useState<ActionStatus>(initialStatus);
  const [result, setResult] = useState<MerchIdeasResult | null>(null);
  const [historyItems, setHistoryItems] = useState<MerchIdeasHistoryItem[]>([]);
  const [activeHistoryId, setActiveHistoryId] = useState('');

  const isLoading = status.kind === 'loading';
  const canGenerate = Boolean(form.audience.trim() && form.occasion.trim() && form.direction.trim()) && !isLoading;

  useEffect(() => {
    let cancelled = false;

    async function loadServerHistory() {
      try {
        const serverHistory = (await fetchGenerationHistory('merch'))
          .map(mapServerHistoryItem)
          .filter((item): item is MerchIdeasHistoryItem => Boolean(item));

        if (cancelled) {
          return;
        }

        setHistoryItems(serverHistory);
        setActiveHistoryId(serverHistory[0]?.id ?? '');
      } catch (error) {
        console.warn('[Merch Ideas] failed to load server history', error);
      }
    }

    void loadServerHistory();

    return () => {
      cancelled = true;
    };
  }, []);

  function updateForm(patch: Partial<MerchIdeasRequest>) {
    setForm((current) => ({ ...current, ...patch }));
    setStatus(initialStatus);
  }

  function saveHistoryItem(item: MerchIdeasHistoryItem) {
    setHistoryItems((current) => mergeHistoryItems([
      item,
      ...current.filter((historyItem) => historyItem.id !== item.id),
    ]));
    setActiveHistoryId(item.id);
  }

  function selectHistoryItem(item: MerchIdeasHistoryItem) {
    setActiveHistoryId(item.id);
    setForm(item.form);
    setResult(item.result);
    setStatus(initialStatus);
  }

  function createNewGeneration() {
    setForm(initialForm);
    setResult(null);
    setStatus(initialStatus);
    setActiveHistoryId('');
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const payload = buildFormPayload(form);
    const requestStartedAt = performance.now();

    if (!payload.audience || !payload.occasion || !payload.direction) {
      setStatus({ kind: 'error', message: 'Заповніть аудиторію, привід і напрямок.' });
      return;
    }

    setForm(payload);
    setStatus({ kind: 'loading', message: 'Шукаємо реальні кейси й генеруємо ідеї...' });

    try {
      const response = await fetch('/api/generate-merch-ideas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await readApiJson<GenerateMerchIdeasResponse>(response);

      if (!response.ok || !data.result) {
        throw new Error(data.error ?? `Не вдалося згенерувати ідеї. Сервер повернув ${response.status}.`);
      }

      const durationMs = Math.round(performance.now() - requestStartedAt);
      const serverHistoryItem = data.historyItem
        ? mapServerHistoryItem(data.historyItem)
        : null;
      const historyItem = serverHistoryItem ?? {
        createdAt: new Date().toISOString(),
        durationMs,
        form: payload,
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
        result: data.result,
        title: deriveHistoryTitle(payload.occasion, data.result.ideas[0]?.title),
      };

      setResult(data.result);
      saveHistoryItem(historyItem);
      setStatus({
        kind: 'success',
        message: `Готово за ${formatDuration(data.durationMs ?? durationMs)}.`,
      });
    } catch (error) {
      setStatus({
        kind: 'error',
        message: error instanceof Error ? error.message : 'Сталася помилка генерації ідей.',
      });
    }
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

      <form className="space-y-5" onSubmit={handleSubmit}>
        <section className="ct-app-panel p-5">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div>
              <label className="ct-app-label" htmlFor="merchAudience">
                Аудиторія *
              </label>
              <input
                className="ct-app-field h-11 w-full px-3"
                id="merchAudience"
                placeholder="чоловіки 30-40, маркетологи IT-компаній"
                value={form.audience}
                onChange={(event) => updateForm({ audience: event.target.value })}
              />
            </div>

            <div>
              <label className="ct-app-label" htmlFor="merchOccasion">
                Привід / тематика *
              </label>
              <input
                className="ct-app-field h-11 w-full px-3"
                id="merchOccasion"
                placeholder="івент, запуск продукту, welcome pack"
                value={form.occasion}
                onChange={(event) => updateForm({ occasion: event.target.value })}
              />
            </div>

            <div className="md:col-span-2">
              <label className="ct-app-label" htmlFor="merchDirection">
                Напрямок / формат *
              </label>
              <textarea
                className="ct-app-field min-h-28 w-full p-4 leading-6"
                id="merchDirection"
                placeholder="щось їстивне брендоване в нестандартному пакуванні"
                value={form.direction}
                onChange={(event) => updateForm({ direction: event.target.value })}
              />
            </div>

            <div>
              <label className="ct-app-label" htmlFor="merchBudget">
                Бюджет
              </label>
              <input
                className="ct-app-field h-11 w-full px-3"
                id="merchBudget"
                placeholder="$20 за одиницю або $3000 total"
                value={form.budget}
                onChange={(event) => updateForm({ budget: event.target.value })}
              />
            </div>

            <div>
              <label className="ct-app-label" htmlFor="merchQuantity">
                Кількість одиниць
              </label>
              <input
                className="ct-app-field h-11 w-full px-3"
                id="merchQuantity"
                placeholder="100, 500, 1000"
                value={form.quantity}
                onChange={(event) => updateForm({ quantity: event.target.value })}
              />
            </div>

            <div className="md:col-span-2">
              <label className="ct-app-label" htmlFor="merchReferences">
                Бренди-референси
              </label>
              <input
                className="ct-app-field h-11 w-full px-3"
                id="merchReferences"
                placeholder={referenceBrandsPlaceholder}
                value={form.referenceBrands}
                onChange={(event) => updateForm({ referenceBrands: event.target.value })}
              />
            </div>

            <div>
              <label className="ct-app-label" htmlFor="merchIdeasCount">
                Кількість ідей
              </label>
              <input
                className="ct-app-field h-11 w-full px-3"
                id="merchIdeasCount"
                max={5}
                min={1}
                type="number"
                value={form.ideasCount}
                onChange={(event) => updateForm({ ideasCount: normalizeIdeasCount(Number(event.target.value)) })}
              />
            </div>
          </div>
        </section>

        <div className="flex flex-wrap items-center justify-between gap-3">
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
            Згенерувати ідеї
          </button>

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

      <MerchIdeasResults result={result} />

      <MerchIdeasHistory
        activeId={activeHistoryId}
        items={historyItems}
        onSelect={selectHistoryItem}
      />
    </div>
  );
}

type MerchIdeasResultsProps = {
  result: MerchIdeasResult | null;
};

type MerchIdeasHistoryProps = {
  activeId: string;
  items: MerchIdeasHistoryItem[];
  onSelect: (item: MerchIdeasHistoryItem) => void;
};

function MerchIdeasHistory({ activeId, items, onSelect }: MerchIdeasHistoryProps) {
  return (
    <section className="ct-app-panel overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#e7e9ee] px-5 py-4">
        <div className="flex items-center gap-3">
          <span className="ct-accent-icon">
            <History className="h-4 w-4" aria-hidden="true" />
          </span>
          <div>
            <h2 className="text-base font-bold text-[#181b22]">Історія ідей</h2>
            <p className="text-xs font-medium text-[#7b8392]">{items.length} записів за 30 днів</p>
          </div>
        </div>
      </div>

      {items.length ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3">
          {items.map((item) => {
            const selected = activeId === item.id;
            const firstIdea = item.result.ideas[0];

            return (
              <button
                className={[
                  'border-b border-[#e7e9ee] px-5 py-4 text-left transition md:border-r xl:[&:nth-child(3n)]:border-r-0',
                  selected ? 'bg-[#f7f9ff] text-[#181b22]' : 'bg-white text-[#181b22] hover:bg-[#fafbfc]',
                ].join(' ')}
                key={item.id}
                onClick={() => onSelect(item)}
                type="button"
              >
                <span className="block text-sm font-semibold leading-5">{item.title}</span>
                <span className={selected ? 'mt-2 block text-xs font-semibold text-[#1d4ed8]' : 'mt-2 block text-xs text-[#7b8392]'}>
                  {formatHistoryDate(item.createdAt)}
                </span>
                <span className={selected ? 'mt-3 block text-xs text-[#5b6472]' : 'mt-3 block text-xs text-[#7b8392]'}>
                  {trimPreview([
                    item.form.audience,
                    item.form.occasion,
                    item.form.direction,
                  ].filter(Boolean).join(' · '))}
                </span>
                <span className={selected ? 'mt-3 block text-xs font-bold text-[#1d4ed8]' : 'mt-3 block text-xs font-bold text-[#181b22]'}>
                  {item.result.ideas.length} ідей{item.durationMs ? ` · ${formatDuration(item.durationMs)}` : ''}
                </span>
                {firstIdea ? (
                  <span className={selected ? 'mt-2 block text-xs text-[#5b6472]' : 'mt-2 block text-xs text-[#7b8392]'}>
                    {firstIdea.company}
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>
      ) : (
        <div className="flex min-h-40 flex-col items-center justify-center px-5 py-10 text-center">
          <Inbox className="h-8 w-8 text-[#a4abb6]" aria-hidden="true" />
          <p className="mt-3 text-sm font-bold text-[#181b22]">Історія поки порожня</p>
        </div>
      )}
    </section>
  );
}

function MerchIdeasResults({ result }: MerchIdeasResultsProps) {
  if (!result) {
    return (
      <section className="ct-empty-state p-8 text-center">
        <Search className="mx-auto h-8 w-8 text-[#a4abb6]" aria-hidden="true" />
        <h2 className="mt-3 text-base font-bold text-[#181b22]">Ідеї зʼявляться тут</h2>
        <p className="mt-2 text-sm leading-6 text-[#7b8392]">
          Кожна картка матиме референс компанії, пояснення й формат пакування.
        </p>
      </section>
    );
  }

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-bold tracking-normal text-[#181b22]">Ідеї для мерчу та подарунків</h2>
        <p className="text-sm font-medium text-[#7b8392]">{result.ideas.length} ідей</p>
      </div>

      <div className="grid grid-cols-1 gap-4">
        {result.ideas.map((idea, index) => (
          <MerchIdeaCard idea={idea} index={index} key={`${idea.title}-${index}`} />
        ))}
      </div>
    </section>
  );
}

type MerchIdeaCardProps = {
  idea: MerchIdea;
  index: number;
};

function MerchIdeaCard({ idea, index }: MerchIdeaCardProps) {
  const sourceUrl = idea.source_url.trim();

  return (
    <article className="ct-app-panel p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-xs font-bold uppercase tracking-normal text-[#939bab]">
            Ідея {index + 1}
          </p>
          <h3 className="mt-1 text-lg font-bold leading-7 text-[#181b22]">{idea.title}</h3>
          <p className="mt-2 inline-flex items-center gap-2 rounded-[9px] border border-[#dbe4ff] bg-[#f7f9ff] px-3 py-1 text-sm font-bold text-[#1d4ed8]">
            <Gift className="h-4 w-4" aria-hidden="true" />
            {idea.company}
          </p>
        </div>

        {sourceUrl && isHttpUrl(sourceUrl) ? (
          <a
            className="ct-secondary-action ct-action-small"
            href={sourceUrl}
            rel="noreferrer"
            target="_blank"
          >
            Джерело
            <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
          </a>
        ) : null}
      </div>

      <div className="mt-5 grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(280px,0.8fr)]">
        <div className="ct-app-panel-subtle p-4">
          <p className="text-xs font-bold uppercase tracking-normal text-[#939bab]">Що зробила компанія</p>
          <p className="mt-2 text-sm leading-6 text-[#2a3038]">{idea.case}</p>
        </div>

        <div className="ct-app-panel-subtle p-4">
          <p className="text-xs font-bold uppercase tracking-normal text-[#939bab]">Чому пасує</p>
          <p className="mt-2 text-sm leading-6 text-[#2a3038]">{idea.why_fits}</p>
        </div>

        <div className="ct-app-panel-subtle p-4 lg:col-span-2">
          <div className="flex items-center gap-2">
            <PackageCheck className="h-4 w-4 text-[#1d4ed8]" aria-hidden="true" />
            <p className="text-xs font-bold uppercase tracking-normal text-[#939bab]">
              Формат / пакування
            </p>
          </div>
          <p className="mt-2 text-sm leading-6 text-[#2a3038]">{idea.format_packaging}</p>
        </div>
      </div>
    </article>
  );
}

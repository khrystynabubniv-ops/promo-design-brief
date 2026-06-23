'use client';

import { Clock, FileText, History, Inbox, Layers3, Loader2, RefreshCw } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import type { GenerationHistoryItem, GenerationHistoryTool } from '@/lib/types';

type GenerationHistoryProps = {
  onBackToHub: () => void;
};

type HistoryResponse = {
  durationMs?: number;
  error?: string;
  items?: GenerationHistoryItem[];
  retentionDays?: number;
  storageConfigured?: boolean;
};

const toolLabels: Record<GenerationHistoryTool, string> = {
  brief: 'Promo Brief',
  merch: 'Merch Ideas',
  smm: 'SMM Universe',
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function getStringField(value: unknown, key: string) {
  if (!isRecord(value)) {
    return '';
  }

  const field = value[key];

  return typeof field === 'string' ? field : '';
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat('uk-UA', {
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    month: 'short',
  }).format(new Date(value));
}

function formatDuration(value?: number) {
  if (!value) {
    return '—';
  }

  return value < 1000 ? `${Math.round(value)} ms` : `${(value / 1000).toFixed(1)} s`;
}

function trimPreview(value: string) {
  const normalized = value.replace(/\s+/g, ' ').trim();

  return normalized.length > 120 ? `${normalized.slice(0, 120)}...` : normalized;
}

function stringifyUnknown(value: unknown) {
  if (typeof value === 'string') {
    return value;
  }

  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function formatInput(item: GenerationHistoryItem) {
  if (item.tool === 'brief') {
    return getStringField(item.input, 'vacancies') || stringifyUnknown(item.input);
  }

  if (item.tool === 'smm') {
    const material = getStringField(item.input, 'material');
    const platform = getStringField(item.input, 'platform');
    const format = getStringField(item.input, 'format');

    return [
      platform || format ? `Параметри: ${[platform, format].filter(Boolean).join(' / ')}` : '',
      material,
    ].filter(Boolean).join('\n\n') || stringifyUnknown(item.input);
  }

  const audience = getStringField(item.input, 'audience');
  const occasion = getStringField(item.input, 'occasion');
  const direction = getStringField(item.input, 'direction');
  const budget = getStringField(item.input, 'budget');
  const quantity = getStringField(item.input, 'quantity');
  const referenceBrands = getStringField(item.input, 'referenceBrands');

  return [
    audience ? `Аудиторія: ${audience}` : '',
    occasion ? `Привід: ${occasion}` : '',
    direction ? `Напрямок: ${direction}` : '',
    budget ? `Бюджет: ${budget}` : '',
    quantity ? `Кількість: ${quantity}` : '',
    referenceBrands ? `Референси: ${referenceBrands}` : '',
  ].filter(Boolean).join('\n') || stringifyUnknown(item.input);
}

function formatOutput(item: GenerationHistoryItem) {
  if (item.tool === 'brief') {
    return getStringField(item.output, 'brief') || stringifyUnknown(item.output);
  }

  if (item.tool === 'merch' && isRecord(item.output) && Array.isArray(item.output.ideas)) {
    return item.output.ideas
      .map((idea, index) => {
        if (!isRecord(idea)) {
          return '';
        }

        return [
          `${index + 1}. ${getStringField(idea, 'title')}`,
          getStringField(idea, 'company') ? `Компанія: ${getStringField(idea, 'company')}` : '',
          getStringField(idea, 'case') ? `Кейс: ${getStringField(idea, 'case')}` : '',
          getStringField(idea, 'why_fits') ? `Чому пасує: ${getStringField(idea, 'why_fits')}` : '',
          getStringField(idea, 'format_packaging') ? `Формат: ${getStringField(idea, 'format_packaging')}` : '',
          getStringField(idea, 'source_url') ? `Джерело: ${getStringField(idea, 'source_url')}` : '',
        ].filter(Boolean).join('\n');
      })
      .filter(Boolean)
      .join('\n\n');
  }

  return stringifyUnknown(item.output);
}

export function GenerationHistory({ onBackToHub }: GenerationHistoryProps) {
  const [items, setItems] = useState<GenerationHistoryItem[]>([]);
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [message, setMessage] = useState('');
  const [selectedId, setSelectedId] = useState('');

  const selectedItem = useMemo(
    () => items.find((item) => item.id === selectedId) ?? items[0] ?? null,
    [items, selectedId],
  );

  async function loadHistory() {
    setStatus('loading');
    setMessage('');

    try {
      const response = await fetch('/api/history?limit=150', {
        cache: 'no-store',
      });
      const data = await response.json() as HistoryResponse;

      if (!response.ok) {
        throw new Error(data.error ?? 'Не вдалося завантажити історію.');
      }

      setItems(data.items ?? []);
      setSelectedId((current) => current || data.items?.[0]?.id || '');
      setStatus('success');
      setMessage(data.storageConfigured === false ? 'Серверне сховище історії ще не налаштоване.' : '');
    } catch (error) {
      setStatus('error');
      setMessage(error instanceof Error ? error.message : 'Не вдалося завантажити історію.');
    }
  }

  useEffect(() => {
    void loadHistory();
  }, []);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <button
          className="inline-flex h-10 items-center gap-2 rounded-md border border-neutral-300 bg-white px-4 text-sm font-semibold text-neutral-900 transition hover:border-neutral-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-950 focus-visible:ring-offset-2"
          onClick={onBackToHub}
          type="button"
        >
          <Layers3 className="h-4 w-4" aria-hidden="true" />
          До пулу тулів
        </button>

        <button
          className="inline-flex h-10 items-center gap-2 rounded-md border border-neutral-300 bg-white px-4 text-sm font-semibold text-neutral-900 transition hover:border-neutral-950 disabled:cursor-not-allowed disabled:border-neutral-200 disabled:text-neutral-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-950 focus-visible:ring-offset-2"
          disabled={status === 'loading'}
          onClick={() => void loadHistory()}
          type="button"
        >
          {status === 'loading' ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          ) : (
            <RefreshCw className="h-4 w-4" aria-hidden="true" />
          )}
          Оновити
        </button>
      </div>

      <section className="rounded-lg border border-neutral-200 bg-white shadow-soft">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-neutral-200 px-5 py-4">
          <div className="flex items-center gap-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-md bg-neutral-950 text-white">
              <History className="h-4 w-4" aria-hidden="true" />
            </span>
            <div>
              <h2 className="text-base font-semibold text-neutral-950">Історія за 30 днів</h2>
              <p className="text-xs font-medium text-neutral-500">{items.length} записів</p>
            </div>
          </div>

          {message ? (
            <span
              className={[
                'rounded-full px-3 py-1 text-xs font-semibold',
                status === 'error'
                  ? 'bg-red-50 text-red-700 ring-1 ring-red-200'
                  : 'bg-neutral-100 text-neutral-700 ring-1 ring-neutral-200',
              ].join(' ')}
            >
              {message}
            </span>
          ) : null}
        </div>

        {status === 'loading' && !items.length ? (
          <div className="flex min-h-48 flex-col items-center justify-center px-5 py-10 text-center">
            <Loader2 className="h-8 w-8 animate-spin text-neutral-400" aria-hidden="true" />
            <p className="mt-3 text-sm font-semibold text-neutral-950">Завантажуємо історію</p>
          </div>
        ) : null}

        {status !== 'loading' && !items.length ? (
          <div className="flex min-h-48 flex-col items-center justify-center px-5 py-10 text-center">
            <Inbox className="h-8 w-8 text-neutral-400" aria-hidden="true" />
            <p className="mt-3 text-sm font-semibold text-neutral-950">Історія поки порожня</p>
          </div>
        ) : null}

        {items.length && selectedItem ? (
          <div className="grid grid-cols-1 lg:grid-cols-[340px_1fr]">
            <div className="max-h-[760px] overflow-y-auto border-b border-neutral-200 lg:border-b-0 lg:border-r">
              {items.map((item) => {
                const isSelected = item.id === selectedItem.id;

                return (
                  <button
                    className={[
                      'block w-full border-b border-neutral-200 px-5 py-4 text-left transition last:border-b-0',
                      isSelected ? 'bg-neutral-950 text-white' : 'bg-white text-neutral-900 hover:bg-neutral-50',
                    ].join(' ')}
                    key={item.id}
                    onClick={() => setSelectedId(item.id)}
                    type="button"
                  >
                    <span className={isSelected ? 'text-xs font-semibold uppercase tracking-[0.14em] text-neutral-300' : 'text-xs font-semibold uppercase tracking-[0.14em] text-neutral-500'}>
                      {toolLabels[item.tool]}
                    </span>
                    <span className="mt-2 block text-sm font-semibold leading-5">{item.title}</span>
                    <span className={isSelected ? 'mt-2 block text-xs text-neutral-300' : 'mt-2 block text-xs text-neutral-500'}>
                      {formatDate(item.createdAt)}
                    </span>
                    <span className={isSelected ? 'mt-3 block text-xs text-neutral-300' : 'mt-3 block text-xs text-neutral-500'}>
                      {trimPreview(formatInput(item))}
                    </span>
                  </button>
                );
              })}
            </div>

            <div className="space-y-5 p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-neutral-500">
                    {toolLabels[selectedItem.tool]}
                  </p>
                  <h3 className="mt-1 text-lg font-semibold tracking-normal text-neutral-950">
                    {selectedItem.title}
                  </h3>
                  <p className="mt-1 text-sm text-neutral-500">{formatDate(selectedItem.createdAt)}</p>
                </div>

                <div className="rounded-md border border-neutral-200 bg-neutral-50 px-4 py-3">
                  <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-neutral-500">
                    <Clock className="h-4 w-4" aria-hidden="true" />
                    Час
                  </div>
                  <p className="mt-1 text-sm font-semibold text-neutral-950">
                    {formatDuration(selectedItem.durationMs)}
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
                <div>
                  <label className="mb-2 flex items-center gap-2 text-sm font-semibold text-neutral-950" htmlFor="serverHistoryInput">
                    <Inbox className="h-4 w-4" aria-hidden="true" />
                    Інпут
                  </label>
                  <textarea
                    className="h-96 w-full rounded-md border border-neutral-300 bg-neutral-50 p-4 text-sm leading-6 text-neutral-900 outline-none"
                    id="serverHistoryInput"
                    readOnly
                    value={formatInput(selectedItem)}
                  />
                </div>

                <div>
                  <label className="mb-2 flex items-center gap-2 text-sm font-semibold text-neutral-950" htmlFor="serverHistoryOutput">
                    <FileText className="h-4 w-4" aria-hidden="true" />
                    Результат
                  </label>
                  <textarea
                    className="h-96 w-full rounded-md border border-neutral-300 bg-neutral-50 p-4 text-sm leading-6 text-neutral-900 outline-none"
                    id="serverHistoryOutput"
                    readOnly
                    value={formatOutput(selectedItem)}
                  />
                </div>
              </div>
            </div>
          </div>
        ) : null}
      </section>
    </div>
  );
}

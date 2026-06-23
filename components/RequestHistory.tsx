'use client';

import { Clock, ExternalLink, FileText, History, Inbox, Trash2 } from 'lucide-react';
import type { RequestHistoryItem } from '@/lib/types';

type RequestHistoryProps = {
  activeId: string;
  items: RequestHistoryItem[];
  onClear?: () => void;
  onSelect: (id: string) => void;
};

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

  if (value < 1000) {
    return `${Math.round(value)} ms`;
  }

  return `${(value / 1000).toFixed(1)} s`;
}

function trimPreview(value: string) {
  const normalized = value.replace(/\s+/g, ' ').trim();
  return normalized.length > 110 ? `${normalized.slice(0, 110)}...` : normalized;
}

export function RequestHistory({ activeId, items, onClear, onSelect }: RequestHistoryProps) {
  const selectedItem = items.find((item) => item.id === activeId) ?? items[0];
  const selectedChildTasks = selectedItem?.taskUrls?.filter((taskUrl) => taskUrl.kind === 'child') ?? [];

  return (
    <section className="rounded-lg border border-neutral-200 bg-white shadow-soft">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-neutral-200 px-5 py-4">
        <div className="flex items-center gap-3">
          <span className="flex h-9 w-9 items-center justify-center rounded-md bg-neutral-950 text-white">
            <History className="h-4 w-4" aria-hidden="true" />
          </span>
          <div>
            <h2 className="text-base font-semibold text-neutral-950">Історія запитів</h2>
            <p className="text-xs font-medium text-neutral-500">{items.length} записів</p>
          </div>
        </div>

        {items.length && onClear ? (
          <button
            className="inline-flex h-9 items-center gap-2 rounded-md border border-neutral-300 bg-white px-3 text-xs font-semibold text-neutral-700 transition hover:border-neutral-950 hover:text-neutral-950"
            onClick={onClear}
            type="button"
          >
            <Trash2 className="h-4 w-4" aria-hidden="true" />
            Очистити
          </button>
        ) : null}
      </div>

      {items.length && selectedItem ? (
        <div className="grid grid-cols-1 gap-0 lg:grid-cols-[320px_1fr]">
          <div className="max-h-[720px] overflow-y-auto border-b border-neutral-200 lg:border-b-0 lg:border-r">
            {items.map((item) => {
              const isSelected = item.id === selectedItem.id;

              return (
                <button
                  className={[
                    'block w-full border-b border-neutral-200 px-5 py-4 text-left transition last:border-b-0',
                    isSelected ? 'bg-neutral-950 text-white' : 'bg-white text-neutral-900 hover:bg-neutral-50',
                  ].join(' ')}
                  key={item.id}
                  onClick={() => onSelect(item.id)}
                  type="button"
                >
                  <span className="block text-sm font-semibold leading-5">{item.title}</span>
                  <span className={isSelected ? 'mt-2 block text-xs text-neutral-300' : 'mt-2 block text-xs text-neutral-500'}>
                    {formatDate(item.createdAt)}
                  </span>
                  <span className={isSelected ? 'mt-3 block text-xs text-neutral-300' : 'mt-3 block text-xs text-neutral-500'}>
                    {trimPreview(item.vacancies)}
                  </span>
                  {item.taskUrl ? (
                    <span className={isSelected ? 'mt-3 inline-flex text-xs font-semibold text-white' : 'mt-3 inline-flex text-xs font-semibold text-neutral-950'}>
                      {item.taskUrls?.length && item.taskUrls.length > 1
                        ? `${item.taskUrls.length} задачі в Notion`
                        : 'Є задача в Notion'}
                    </span>
                  ) : null}
                </button>
              );
            })}
          </div>

          <div className="space-y-5 p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h3 className="text-lg font-semibold tracking-normal text-neutral-950">
                  {selectedItem.title}
                </h3>
                <p className="mt-1 text-sm text-neutral-500">{formatDate(selectedItem.createdAt)}</p>
              </div>

              {selectedItem.taskUrl ? (
                <a
                  className="inline-flex h-10 items-center gap-2 rounded-md bg-neutral-950 px-4 text-sm font-semibold text-white transition hover:bg-neutral-800"
                  href={selectedItem.taskUrl}
                  rel="noreferrer"
                  target="_blank"
                >
                  <ExternalLink className="h-4 w-4" aria-hidden="true" />
                  Відкрити в Notion
                </a>
              ) : null}
            </div>

            {selectedChildTasks.length ? (
              <div>
                <p className="mb-2 text-sm font-semibold text-neutral-950">Child-задачі</p>
                <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                  {selectedChildTasks.map((taskUrl) => (
                    <a
                      className="inline-flex min-h-10 items-center justify-between gap-3 rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm font-semibold text-neutral-900 transition hover:border-neutral-950"
                      href={taskUrl.url}
                      key={taskUrl.id}
                      rel="noreferrer"
                      target="_blank"
                    >
                      <span className="min-w-0 truncate">{taskUrl.name}</span>
                      <ExternalLink className="h-4 w-4 shrink-0" aria-hidden="true" />
                    </a>
                  ))}
                </div>
              </div>
            ) : null}

            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <div className="rounded-md border border-neutral-200 bg-neutral-50 p-4">
                <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-neutral-500">
                  <Clock className="h-4 w-4" aria-hidden="true" />
                  Генерація
                </div>
                <p className="mt-2 text-lg font-semibold text-neutral-950">
                  {formatDuration(selectedItem.timings.generateBriefMs)}
                </p>
              </div>

              <div className="rounded-md border border-neutral-200 bg-neutral-50 p-4">
                <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-neutral-500">
                  <Clock className="h-4 w-4" aria-hidden="true" />
                  Notion
                </div>
                <p className="mt-2 text-lg font-semibold text-neutral-950">
                  {formatDuration(selectedItem.timings.createNotionTaskMs)}
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
              <div>
                <label className="mb-2 flex items-center gap-2 text-sm font-semibold text-neutral-950" htmlFor="historyInput">
                  <Inbox className="h-4 w-4" aria-hidden="true" />
                  Інпут вакансій
                </label>
                <textarea
                  className="h-72 w-full rounded-md border border-neutral-300 bg-neutral-50 p-4 text-sm leading-6 text-neutral-900 outline-none"
                  id="historyInput"
                  readOnly
                  value={selectedItem.vacancies}
                />
              </div>

              <div>
                <label className="mb-2 flex items-center gap-2 text-sm font-semibold text-neutral-950" htmlFor="historyOutput">
                  <FileText className="h-4 w-4" aria-hidden="true" />
                  Аутпут
                </label>
                <textarea
                  className="h-72 w-full rounded-md border border-neutral-300 bg-neutral-50 p-4 text-sm leading-6 text-neutral-900 outline-none"
                  id="historyOutput"
                  readOnly
                  value={selectedItem.brief}
                />
              </div>
            </div>

            {selectedItem.systemPrompt ? (
              <details className="rounded-md border border-neutral-200 bg-neutral-50">
                <summary className="cursor-pointer px-4 py-3 text-sm font-semibold text-neutral-950">
                  Системний промпт
                </summary>
                <div className="border-t border-neutral-200 p-4">
                  <textarea
                    className="h-60 w-full rounded-md border border-neutral-300 bg-white p-4 text-sm leading-6 text-neutral-900 outline-none"
                    readOnly
                    value={selectedItem.systemPrompt}
                  />
                </div>
              </details>
            ) : null}
          </div>
        </div>
      ) : (
        <div className="flex min-h-40 flex-col items-center justify-center px-5 py-10 text-center">
          <Inbox className="h-8 w-8 text-neutral-400" aria-hidden="true" />
          <p className="mt-3 text-sm font-semibold text-neutral-950">Історія поки порожня</p>
        </div>
      )}
    </section>
  );
}

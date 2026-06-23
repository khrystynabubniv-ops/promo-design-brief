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
    <section className="ct-app-panel overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#e7e9ee] px-5 py-4">
        <div className="flex items-center gap-3">
          <span className="ct-accent-icon">
            <History className="h-4 w-4" aria-hidden="true" />
          </span>
          <div>
            <h2 className="text-base font-bold text-[#181b22]">Історія запитів</h2>
            <p className="text-xs font-medium text-[#7b8392]">{items.length} записів</p>
          </div>
        </div>

        {items.length && onClear ? (
          <button
            className="ct-secondary-action ct-action-small"
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
          <div className="max-h-[720px] overflow-y-auto border-b border-[#e7e9ee] lg:border-b-0 lg:border-r">
            {items.map((item) => {
              const isSelected = item.id === selectedItem.id;

              return (
                <button
                  className={[
                    'block w-full border-b border-[#e7e9ee] px-5 py-4 text-left transition last:border-b-0',
                    isSelected ? 'bg-[#f7f9ff] text-[#181b22]' : 'bg-white text-[#181b22] hover:bg-[#fafbfc]',
                  ].join(' ')}
                  key={item.id}
                  onClick={() => onSelect(item.id)}
                  type="button"
                >
                  <span className="block text-sm font-semibold leading-5">{item.title}</span>
                  <span className={isSelected ? 'mt-2 block text-xs font-semibold text-[#1d4ed8]' : 'mt-2 block text-xs text-[#7b8392]'}>
                    {formatDate(item.createdAt)}
                  </span>
                  <span className={isSelected ? 'mt-3 block text-xs text-[#5b6472]' : 'mt-3 block text-xs text-[#7b8392]'}>
                    {trimPreview(item.vacancies)}
                  </span>
                  {item.taskUrl ? (
                    <span className={isSelected ? 'mt-3 inline-flex text-xs font-bold text-[#1d4ed8]' : 'mt-3 inline-flex text-xs font-bold text-[#181b22]'}>
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
                <h3 className="text-lg font-bold tracking-normal text-[#181b22]">
                  {selectedItem.title}
                </h3>
                <p className="mt-1 text-sm text-[#7b8392]">{formatDate(selectedItem.createdAt)}</p>
              </div>

              {selectedItem.taskUrl ? (
                <a
                  className="ct-primary-action ct-action-compact"
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
                <p className="ct-app-label">Child-задачі</p>
                <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                  {selectedChildTasks.map((taskUrl) => (
                    <a
                      className="inline-flex min-h-10 items-center justify-between gap-3 rounded-[10px] border border-[#e3e6ec] bg-white px-3 py-2 text-sm font-semibold text-[#2a3038] transition hover:bg-[#f5f6f8]"
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
              <div className="ct-app-panel-subtle p-4">
                <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-normal text-[#939bab]">
                  <Clock className="h-4 w-4" aria-hidden="true" />
                  Генерація
                </div>
                <p className="mt-2 text-lg font-bold text-[#181b22]">
                  {formatDuration(selectedItem.timings.generateBriefMs)}
                </p>
              </div>

              <div className="ct-app-panel-subtle p-4">
                <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-normal text-[#939bab]">
                  <Clock className="h-4 w-4" aria-hidden="true" />
                  Notion
                </div>
                <p className="mt-2 text-lg font-bold text-[#181b22]">
                  {formatDuration(selectedItem.timings.createNotionTaskMs)}
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
              <div>
                <label className="ct-app-label ct-app-label-inline gap-2" htmlFor="historyInput">
                  <Inbox className="h-4 w-4 text-[#1d4ed8]" aria-hidden="true" />
                  Інпут вакансій
                </label>
                <textarea
                  className="ct-app-field h-72 w-full p-4 leading-6"
                  id="historyInput"
                  readOnly
                  value={selectedItem.vacancies}
                />
              </div>

              <div>
                <label className="ct-app-label ct-app-label-inline gap-2" htmlFor="historyOutput">
                  <FileText className="h-4 w-4 text-[#1d4ed8]" aria-hidden="true" />
                  Аутпут
                </label>
                <textarea
                  className="ct-app-field h-72 w-full p-4 leading-6"
                  id="historyOutput"
                  readOnly
                  value={selectedItem.brief}
                />
              </div>
            </div>

            {selectedItem.systemPrompt ? (
              <details className="ct-app-panel-subtle">
                <summary className="cursor-pointer px-4 py-3 text-sm font-bold text-[#181b22]">
                  Системний промпт
                </summary>
                <div className="border-t border-[#e7e9ee] p-4">
                  <textarea
                    className="ct-app-field h-60 w-full bg-white p-4 leading-6"
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
          <Inbox className="h-8 w-8 text-[#a4abb6]" aria-hidden="true" />
          <p className="mt-3 text-sm font-bold text-[#181b22]">Історія поки порожня</p>
        </div>
      )}
    </section>
  );
}

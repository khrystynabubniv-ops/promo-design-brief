'use client';

import { ChevronDown, ChevronUp, Loader2, WandSparkles } from 'lucide-react';
import type { ActionStatus } from '@/lib/types';

type Step1VacanciesProps = {
  vacancies: string;
  systemPrompt: string;
  status: ActionStatus;
  onVacanciesChange: (value: string) => void;
  onSystemPromptChange: (value: string) => void;
  onGenerate: () => void;
};

export function Step1Vacancies({
  vacancies,
  systemPrompt,
  status,
  onVacanciesChange,
  onSystemPromptChange,
  onGenerate,
}: Step1VacanciesProps) {
  const isLoading = status.kind === 'loading';

  return (
    <div className="space-y-5">
      <details className="rounded-lg border border-neutral-200 bg-white shadow-soft">
        <summary className="group flex cursor-pointer list-none items-center justify-between px-5 py-4 text-sm font-semibold text-neutral-950">
          <span>Системний промпт</span>
          <ChevronDown className="h-4 w-4 group-open:hidden" aria-hidden="true" />
          <ChevronUp className="hidden h-4 w-4 group-open:block" aria-hidden="true" />
        </summary>
        <div className="border-t border-neutral-200 p-5">
          <textarea
            className="min-h-96 w-full rounded-md border border-neutral-300 bg-neutral-50 p-4 text-sm leading-6 text-neutral-900 outline-none transition focus:border-neutral-950 focus:bg-white"
            value={systemPrompt}
            onChange={(event) => onSystemPromptChange(event.target.value)}
          />
        </div>
      </details>

      <section className="rounded-lg border border-neutral-200 bg-white p-5 shadow-soft">
        <label className="mb-3 block text-sm font-semibold text-neutral-950" htmlFor="vacancies">
          Вакансії від рекрутера
        </label>
        <textarea
          className="min-h-80 w-full rounded-md border border-neutral-300 bg-neutral-50 p-4 text-sm leading-6 text-neutral-900 outline-none transition placeholder:text-neutral-400 focus:border-neutral-950 focus:bg-white"
          id="vacancies"
          placeholder="Вставте текст вакансій або публічні Ashby-лінки..."
          rows={12}
          value={vacancies}
          onChange={(event) => onVacanciesChange(event.target.value)}
        />
      </section>

      <div className="flex flex-wrap items-center gap-3">
        <button
          className="inline-flex h-11 items-center gap-2 rounded-md bg-neutral-950 px-5 text-sm font-semibold text-white transition hover:bg-neutral-800 disabled:cursor-not-allowed disabled:bg-neutral-300 disabled:text-neutral-500"
          disabled={isLoading || !vacancies.trim()}
          onClick={onGenerate}
          type="button"
        >
          {isLoading ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          ) : (
            <WandSparkles className="h-4 w-4" aria-hidden="true" />
          )}
          Згенерувати бриф
        </button>

        {status.message ? (
          <span
            className={[
              'rounded-full px-3 py-1 text-xs font-semibold',
              status.kind === 'error'
                ? 'bg-red-50 text-red-700 ring-1 ring-red-200'
                : 'bg-neutral-100 text-neutral-700 ring-1 ring-neutral-200',
            ].join(' ')}
          >
            {status.message}
          </span>
        ) : null}
      </div>
    </div>
  );
}

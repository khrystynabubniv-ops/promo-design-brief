'use client';

import { ChevronDown, ChevronUp, Loader2, WandSparkles } from 'lucide-react';
import type { ActionStatus } from '@/lib/types';

type Step1VacanciesProps = {
  vacancies: string;
  systemPrompt: string;
  status: ActionStatus;
  onVacanciesChange: (value: string) => void;
  onGenerate: () => void;
};

export function Step1Vacancies({
  vacancies,
  systemPrompt,
  status,
  onVacanciesChange,
  onGenerate,
}: Step1VacanciesProps) {
  const isLoading = status.kind === 'loading';

  return (
    <div className="space-y-5">
      <details className="ct-app-panel">
        <summary className="group flex cursor-pointer list-none items-center justify-between px-5 py-4 text-[14px] font-bold text-[#181b22]">
          <span>Системний промпт</span>
          <ChevronDown className="h-4 w-4 text-[#5b6472] group-open:hidden" aria-hidden="true" />
          <ChevronUp className="hidden h-4 w-4 text-[#1d4ed8] group-open:block" aria-hidden="true" />
        </summary>
        <div className="border-t border-[#e7e9ee] p-5">
          <textarea
            className="ct-app-field min-h-96 w-full p-4 leading-6"
            readOnly
            value={systemPrompt}
          />
        </div>
      </details>

      <section className="ct-app-panel p-5">
        <label className="ct-app-label" htmlFor="vacancies">
          Вакансії від рекрутера
        </label>
        <textarea
          className="ct-app-field min-h-80 w-full p-4 leading-6"
          id="vacancies"
          placeholder="Вставте текст вакансій або публічні Ashby-лінки..."
          rows={12}
          value={vacancies}
          onChange={(event) => onVacanciesChange(event.target.value)}
        />
      </section>

      <div className="flex flex-wrap items-center gap-3">
        <button
          className="ct-primary-action"
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
    </div>
  );
}

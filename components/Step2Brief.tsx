'use client';

import { ArrowLeft, ArrowRight, FileText } from 'lucide-react';
import type { VacancyBrief } from '@/lib/types';

type Step2BriefProps = {
  brief: string;
  vacancyBriefs: VacancyBrief[];
  onBriefChange: (value: string) => void;
  onVacancyBriefChange: (id: string, value: string) => void;
  onBack: () => void;
  onNext: () => void;
};

export function Step2Brief({
  brief,
  vacancyBriefs,
  onBriefChange,
  onVacancyBriefChange,
  onBack,
  onNext,
}: Step2BriefProps) {
  const hasSeparateBriefs = vacancyBriefs.length > 1;
  const canContinue = hasSeparateBriefs
    ? vacancyBriefs.every((vacancyBrief) => vacancyBrief.brief.trim())
    : brief.trim();

  return (
    <div className="space-y-5">
      {hasSeparateBriefs ? (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold tracking-normal text-neutral-950">
                Окремі брифи по вакансіях
              </h2>
              <p className="mt-1 text-sm text-neutral-500">
                {vacancyBriefs.length} child-задачі будуть створені в Notion.
              </p>
            </div>
          </div>

          {vacancyBriefs.map((vacancyBrief, index) => (
            <section
              className="rounded-lg border border-neutral-200 bg-white p-5 shadow-soft"
              key={vacancyBrief.id}
            >
              <label
                className="mb-3 flex items-start gap-2 text-sm font-semibold text-neutral-950"
                htmlFor={`brief-${vacancyBrief.id}`}
              >
                <FileText className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                <span>
                  <span className="block">Вакансія {index + 1}: {vacancyBrief.title}</span>
                  {vacancyBrief.sourceUrl ? (
                    <span className="mt-1 block break-all text-xs font-medium text-neutral-500">
                      {vacancyBrief.sourceUrl}
                    </span>
                  ) : null}
                </span>
              </label>
              <textarea
                className="min-h-[420px] w-full rounded-md border border-neutral-300 bg-neutral-50 p-4 text-sm leading-6 text-neutral-900 outline-none transition focus:border-neutral-950 focus:bg-white"
                id={`brief-${vacancyBrief.id}`}
                rows={18}
                value={vacancyBrief.brief}
                onChange={(event) => onVacancyBriefChange(vacancyBrief.id, event.target.value)}
              />
            </section>
          ))}
        </>
      ) : (
        <section className="rounded-lg border border-neutral-200 bg-white p-5 shadow-soft">
          <label className="mb-3 block text-sm font-semibold text-neutral-950" htmlFor="brief">
            Бриф — редагуйте перед відправкою
          </label>
          <textarea
            className="min-h-[520px] w-full rounded-md border border-neutral-300 bg-neutral-50 p-4 text-sm leading-6 text-neutral-900 outline-none transition focus:border-neutral-950 focus:bg-white"
            id="brief"
            rows={22}
            value={brief}
            onChange={(event) => onBriefChange(event.target.value)}
          />
        </section>
      )}

      <div className="flex items-center justify-between">
        <button
          className="inline-flex h-11 items-center gap-2 rounded-md border border-neutral-300 bg-white px-5 text-sm font-semibold text-neutral-900 transition hover:border-neutral-950"
          onClick={onBack}
          type="button"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          Назад
        </button>
        <button
          className="inline-flex h-11 items-center gap-2 rounded-md bg-neutral-950 px-5 text-sm font-semibold text-white transition hover:bg-neutral-800 disabled:cursor-not-allowed disabled:bg-neutral-300 disabled:text-neutral-500"
          disabled={!canContinue}
          onClick={onNext}
          type="button"
        >
          Далі
          <ArrowRight className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}

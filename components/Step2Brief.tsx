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
              <h2 className="text-lg font-bold tracking-normal text-[#181b22]">
                Окремі брифи по вакансіях
              </h2>
              <p className="mt-1 text-sm text-[#7b8392]">
                {vacancyBriefs.length} child-задачі будуть створені в Notion.
              </p>
            </div>
          </div>

          {vacancyBriefs.map((vacancyBrief, index) => (
            <section
              className="ct-app-panel p-5"
              key={vacancyBrief.id}
            >
              <label
                className="mb-3 flex items-start gap-2 text-sm font-bold text-[#181b22]"
                htmlFor={`brief-${vacancyBrief.id}`}
              >
                <FileText className="mt-0.5 h-4 w-4 shrink-0 text-[#1d4ed8]" aria-hidden="true" />
                <span>
                  <span className="block">Вакансія {index + 1}: {vacancyBrief.title}</span>
                  {vacancyBrief.sourceUrl ? (
                    <span className="mt-1 block break-all text-xs font-medium text-[#7b8392]">
                      {vacancyBrief.sourceUrl}
                    </span>
                  ) : null}
                </span>
              </label>
              <textarea
                className="ct-app-field min-h-[420px] w-full p-4 leading-6"
                id={`brief-${vacancyBrief.id}`}
                rows={18}
                value={vacancyBrief.brief}
                onChange={(event) => onVacancyBriefChange(vacancyBrief.id, event.target.value)}
              />
            </section>
          ))}
        </>
      ) : (
        <section className="ct-app-panel p-5">
          <label className="ct-app-label" htmlFor="brief">
            Бриф — редагуйте перед відправкою
          </label>
          <textarea
            className="ct-app-field min-h-[520px] w-full p-4 leading-6"
            id="brief"
            rows={22}
            value={brief}
            onChange={(event) => onBriefChange(event.target.value)}
          />
        </section>
      )}

      <div className="flex items-center justify-between">
        <button
          className="ct-secondary-action"
          onClick={onBack}
          type="button"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          Назад
        </button>
        <button
          className="ct-primary-action"
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

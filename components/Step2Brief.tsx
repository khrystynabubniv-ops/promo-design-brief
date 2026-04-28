'use client';

import { ArrowLeft, ArrowRight } from 'lucide-react';

type Step2BriefProps = {
  brief: string;
  onBriefChange: (value: string) => void;
  onBack: () => void;
  onNext: () => void;
};

export function Step2Brief({ brief, onBriefChange, onBack, onNext }: Step2BriefProps) {
  return (
    <div className="space-y-5">
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
          disabled={!brief.trim()}
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

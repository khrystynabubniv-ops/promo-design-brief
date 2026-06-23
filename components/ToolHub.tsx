'use client';

import { ArrowRight, FileText, Layers3, Sparkles } from 'lucide-react';

type ToolHubProps = {
  onOpenBrief: () => void;
  onOpenSmm: () => void;
};

const tools = [
  {
    accent: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
    cta: 'Відкрити генератор',
    description: 'Вакансії або Ashby-лінки перетворюються на промо-брифи для дизайнерів і задачі в Notion.',
    icon: FileText,
    label: 'Promo Brief Generator',
    meta: 'Вакансії → бриф → Notion',
    onOpenKey: 'brief',
    status: 'Готовий',
  },
  {
    accent: 'bg-sky-50 text-sky-700 ring-sky-200',
    cta: 'Відкрити генератор',
    description: 'Матеріал, тема або інтервʼю перетворюються на варіанти поста й структуру каруселі в TOV Universe.',
    icon: Layers3,
    label: 'SMM Universe Generator',
    meta: 'Матеріал → caption / carousel',
    onOpenKey: 'smm',
    status: 'Новий',
  },
] as const;

export function ToolHub({ onOpenBrief, onOpenSmm }: ToolHubProps) {
  return (
    <div className="space-y-6">
      <section className="rounded-lg border border-neutral-200 bg-white p-6 shadow-soft">
        <div className="flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full bg-neutral-100 px-3 py-1 text-xs font-semibold text-neutral-700 ring-1 ring-neutral-200">
              <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
              PR Comms workspace
            </div>
            <h2 className="mt-4 max-w-2xl text-2xl font-semibold tracking-normal text-neutral-950">
              Пул інструментів для PR та комунікацій
            </h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-neutral-600">
              Обирай потрібний сценарій і працюй у своєму флоу: генерація брифів, тексти постів, каруселі та наступні інструменти команди.
            </p>
          </div>
          <p className="rounded-md border border-neutral-200 bg-neutral-50 px-4 py-3 text-sm font-medium text-neutral-600">
            {tools.length} інструменти в пулі
          </p>
        </div>
      </section>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {tools.map((tool) => {
          const Icon = tool.icon;
          const handleOpen = tool.onOpenKey === 'brief' ? onOpenBrief : onOpenSmm;

          return (
            <button
              className="group flex min-h-72 flex-col justify-between rounded-lg border border-neutral-200 bg-white p-5 text-left shadow-soft outline-none transition hover:-translate-y-0.5 hover:border-neutral-950 focus-visible:ring-2 focus-visible:ring-neutral-950 focus-visible:ring-offset-2"
              key={tool.label}
              onClick={handleOpen}
              type="button"
            >
              <span>
                <span className="flex items-start justify-between gap-4">
                  <span className={`flex h-11 w-11 items-center justify-center rounded-md ring-1 ${tool.accent}`}>
                    <Icon className="h-5 w-5" aria-hidden="true" />
                  </span>
                  <span className="rounded-full border border-neutral-200 bg-neutral-50 px-3 py-1 text-xs font-semibold text-neutral-600">
                    {tool.status}
                  </span>
                </span>
                <span className="mt-6 block text-xl font-semibold tracking-normal text-neutral-950">
                  {tool.label}
                </span>
                <span className="mt-2 block text-xs font-semibold uppercase tracking-[0.16em] text-neutral-500">
                  {tool.meta}
                </span>
                <span className="mt-4 block text-sm leading-6 text-neutral-600">
                  {tool.description}
                </span>
              </span>
              <span className="mt-6 inline-flex h-10 items-center gap-2 text-sm font-semibold text-neutral-950">
                {tool.cta}
                <ArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5" aria-hidden="true" />
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

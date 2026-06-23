'use client';

import { ArrowRight, CheckCircle2, FileText, Gift, Layers3, Newspaper, Sparkles } from 'lucide-react';

type ToolHubProps = {
  onOpenArticles: () => void;
  onOpenBrief: () => void;
  onOpenMerchIdeas: () => void;
  onOpenSmm: () => void;
};

const tools = [
  {
    chips: ['Ashby', 'Notion', 'design brief'],
    cta: 'Відкрити генератор',
    description: 'Вакансії або Ashby-лінки перетворюються на промо-брифи для дизайнерів і задачі в Notion.',
    icon: FileText,
    input: 'Вакансії або Ashby-лінки',
    label: 'Promo Brief Generator',
    meta: 'Вакансії → бриф → Notion',
    onOpenKey: 'brief',
    output: 'Промо-бриф і задача',
    step: '01',
    status: 'Готовий',
  },
  {
    chips: ['caption', 'carousel', 'TOV'],
    cta: 'Відкрити генератор',
    description: 'Матеріал, тема або інтервʼю перетворюються на варіанти поста й структуру каруселі в TOV Universe.',
    icon: Layers3,
    input: 'Матеріал, тема або інтервʼю',
    label: 'SMM Universe Generator',
    meta: 'Матеріал → caption / carousel',
    onOpenKey: 'smm',
    output: 'Пости й каруселі',
    step: '02',
    status: 'Новий',
  },
  {
    chips: ['audience', 'cases', 'sources'],
    cta: 'Відкрити генератор',
    description: 'Параметри аудиторії та приводу перетворюються на мерч-ідеї з реальними кейсами компаній і джерелами.',
    icon: Gift,
    input: 'Аудиторія, привід і бюджет',
    label: 'Merch & Gifts Ideas',
    meta: 'Аудиторія → кейси → ідеї',
    onOpenKey: 'merch',
    output: 'Мерч-ідеї з референсами',
    step: '03',
    status: 'Новий',
  },
  {
    chips: ['articles', 'quotes', 'press release'],
    cta: 'Відкрити редактор',
    description: 'Бриф, факти й картки спікерів перетворюються на статті, колонки, коментарі та прес-релізи.',
    icon: Newspaper,
    input: 'Бриф, факти й спікери',
    label: 'Articles & Press Releases',
    meta: 'Бриф → чернетка → редактор',
    onOpenKey: 'articles',
    output: 'Чернетка для редактури',
    step: '04',
    status: 'Beta',
  },
] as const;

export function ToolHub({ onOpenArticles, onOpenBrief, onOpenMerchIdeas, onOpenSmm }: ToolHubProps) {
  return (
    <div className="space-y-5">
      <section className="overflow-hidden rounded-[16px] border border-[#e7e9ee] bg-white shadow-[0_14px_40px_rgba(16,24,40,.07)]">
        <div className="grid gap-6 p-5 md:grid-cols-[minmax(0,1fr)_240px] md:p-6">
          <div>
            <div className="inline-flex h-8 items-center gap-2 rounded-[9px] bg-[#eef3ff] px-3 text-[13px] font-semibold text-[#1d4ed8] ring-1 ring-[#dbe4ff]">
              <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
              PR Comms workspace
            </div>
            <h2 className="mt-5 max-w-2xl text-[26px] font-bold leading-tight tracking-normal text-[#181b22] md:text-[30px]">
              Пул інструментів для PR та комунікацій
            </h2>
            <p className="mt-2 max-w-2xl text-[14.5px] leading-6 text-[#5b6472]">
              Обирай сценарій і працюй у єдиному флоу: промо-брифи, SMM-матеріали, мерч-ідеї та редактор статей із прес-релізами.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-2 self-end">
            <div className="rounded-[12px] border border-[#e7e9ee] bg-[#fafbfc] p-3">
              <span className="block text-[22px] font-bold leading-none text-[#181b22]">{tools.length}</span>
              <span className="mt-1 block text-[12.5px] font-medium text-[#7b8392]">інструменти</span>
            </div>
            <div className="rounded-[12px] border border-[#dbe4ff] bg-[#f7f9ff] p-3">
              <span className="flex h-[24px] w-[24px] items-center justify-center rounded-full bg-[#1d4ed8] text-white">
                <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
              </span>
              <span className="mt-2 block text-[12.5px] font-semibold text-[#3a5bbf]">єдиний стиль</span>
            </div>
          </div>
        </div>
      </section>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
        {tools.map((tool) => {
          const Icon = tool.icon;
          const handleOpen = tool.onOpenKey === 'brief'
            ? onOpenBrief
            : tool.onOpenKey === 'smm'
              ? onOpenSmm
              : tool.onOpenKey === 'merch'
                ? onOpenMerchIdeas
                : onOpenArticles;

          return (
            <button
              className="group flex min-h-[380px] flex-col rounded-[16px] border border-[#e7e9ee] bg-white p-[18px] text-left shadow-[0_10px_30px_rgba(16,24,40,.06)] outline-none transition hover:-translate-y-0.5 hover:border-[#b8c8f5] hover:shadow-[0_18px_44px_rgba(16,24,40,.09)] focus-visible:ring-2 focus-visible:ring-[#1d4ed8] focus-visible:ring-offset-2"
              key={tool.label}
              onClick={handleOpen}
              type="button"
            >
              <span>
                <span className="flex items-start justify-between gap-3">
                  <span className="flex h-11 w-11 items-center justify-center rounded-[11px] bg-[#eef3ff] text-[#1d4ed8] ring-1 ring-[#dbe4ff]">
                    <Icon className="h-5 w-5" aria-hidden="true" />
                  </span>
                  <span className="flex items-center gap-2 rounded-[9px] border border-[#e7e9ee] bg-[#fafbfc] px-2.5 py-1 text-[12px] font-semibold text-[#5b6472]">
                    <span className="text-[#9aa1ad]">{tool.step}</span>
                    <span className="h-3 w-px bg-[#e0e3e8]" />
                    <span>{tool.status}</span>
                  </span>
                </span>
                <span className="mt-6 block text-[20px] font-bold leading-[1.25] tracking-normal text-[#181b22]">
                  {tool.label}
                </span>
                <span className="mt-3 block text-[12px] font-bold uppercase tracking-normal text-[#1d4ed8]">
                  {tool.meta}
                </span>
                <span className="mt-3 block text-[13.5px] leading-6 text-[#5b6472]">
                  {tool.description}
                </span>
                <span className="mt-5 grid gap-3 border-y border-[#eef0f3] py-4">
                  <span className="grid grid-cols-[58px_minmax(0,1fr)] gap-3">
                    <span className="text-[11px] font-bold uppercase tracking-normal text-[#939bab]">
                      Вхід
                    </span>
                    <span className="text-[13px] font-semibold leading-5 text-[#2a3038]">
                      {tool.input}
                    </span>
                  </span>
                  <span className="grid grid-cols-[58px_minmax(0,1fr)] gap-3">
                    <span className="text-[11px] font-bold uppercase tracking-normal text-[#939bab]">
                      Вихід
                    </span>
                    <span className="text-[13px] font-semibold leading-5 text-[#2a3038]">
                      {tool.output}
                    </span>
                  </span>
                </span>
                <span className="mt-4 flex flex-wrap gap-1.5">
                  {tool.chips.map((chip) => (
                    <span
                      className="rounded-[7px] bg-[#f1f3f6] px-2 py-1 text-[11.5px] font-semibold leading-none text-[#5b6472]"
                      key={chip}
                    >
                      {chip}
                    </span>
                  ))}
                </span>
              </span>
              <span className="mt-auto flex items-center justify-between border-t border-[#eef0f3] pt-4 text-[13.5px] font-bold text-[#181b22]">
                <span>{tool.cta}</span>
                <span className="flex h-8 w-8 items-center justify-center rounded-[9px] bg-[#f7f9ff] text-[#1d4ed8] transition group-hover:translate-x-0.5 group-hover:bg-[#eef3ff]">
                  <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </span>
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

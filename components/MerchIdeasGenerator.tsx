'use client';

import {
  ExternalLink,
  Gift,
  Layers3,
  Loader2,
  PackageCheck,
  Plus,
  Search,
  WandSparkles,
} from 'lucide-react';
import { useState } from 'react';
import type { MerchIdea, MerchIdeasRequest, MerchIdeasResult } from '@/lib/schema';
import type { ActionStatus } from '@/lib/types';

const referenceBrandsPlaceholder = 'Jacquemus, Balenciaga, Cursor, Apple WWDC, Red Bull, Gisou, Supreme, Carhartt WIP, Figma, Anthropic';

const initialStatus: ActionStatus = { kind: 'idle' };

const initialForm: MerchIdeasRequest = {
  audience: '',
  occasion: '',
  direction: '',
  budget: '',
  quantity: '',
  referenceBrands: '',
  ideasCount: 5,
};

type MerchIdeasGeneratorProps = {
  onBackToHub: () => void;
};

type GenerateMerchIdeasResponse = {
  durationMs?: number;
  error?: string;
  result?: MerchIdeasResult;
};

async function readApiJson<T>(response: Response): Promise<T> {
  const responseText = await response.text();

  if (!responseText.trim()) {
    return {} as T;
  }

  try {
    return JSON.parse(responseText) as T;
  } catch {
    return {} as T;
  }
}

function formatDuration(value?: number) {
  if (!value) {
    return '';
  }

  return value < 1000 ? `${Math.round(value)} ms` : `${(value / 1000).toFixed(1)} s`;
}

function normalizeIdeasCount(value: number) {
  if (!Number.isFinite(value)) {
    return 5;
  }

  return Math.min(10, Math.max(1, Math.round(value)));
}

function buildFormPayload(form: MerchIdeasRequest): MerchIdeasRequest {
  return {
    audience: form.audience.trim(),
    occasion: form.occasion.trim(),
    direction: form.direction.trim(),
    budget: form.budget.trim(),
    quantity: form.quantity.trim(),
    referenceBrands: form.referenceBrands.trim(),
    ideasCount: normalizeIdeasCount(form.ideasCount),
  };
}

function isHttpUrl(value: string) {
  try {
    const url = new URL(value);
    return ['http:', 'https:'].includes(url.protocol);
  } catch {
    return false;
  }
}

export function MerchIdeasGenerator({ onBackToHub }: MerchIdeasGeneratorProps) {
  const [form, setForm] = useState<MerchIdeasRequest>(initialForm);
  const [status, setStatus] = useState<ActionStatus>(initialStatus);
  const [result, setResult] = useState<MerchIdeasResult | null>(null);

  const isLoading = status.kind === 'loading';
  const canGenerate = Boolean(form.audience.trim() && form.occasion.trim() && form.direction.trim()) && !isLoading;

  function updateForm(patch: Partial<MerchIdeasRequest>) {
    setForm((current) => ({ ...current, ...patch }));
    setStatus(initialStatus);
  }

  function createNewGeneration() {
    setForm(initialForm);
    setResult(null);
    setStatus(initialStatus);
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const payload = buildFormPayload(form);
    const requestStartedAt = performance.now();

    if (!payload.audience || !payload.occasion || !payload.direction) {
      setStatus({ kind: 'error', message: 'Заповніть аудиторію, привід і напрямок.' });
      return;
    }

    setForm(payload);
    setStatus({ kind: 'loading', message: 'Шукаємо реальні кейси й генеруємо ідеї...' });

    try {
      const response = await fetch('/api/generate-merch-ideas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await readApiJson<GenerateMerchIdeasResponse>(response);

      if (!response.ok || !data.result) {
        throw new Error(data.error ?? `Не вдалося згенерувати ідеї. Сервер повернув ${response.status}.`);
      }

      const durationMs = Math.round(performance.now() - requestStartedAt);

      setResult(data.result);
      setStatus({
        kind: 'success',
        message: `Готово за ${formatDuration(data.durationMs ?? durationMs)}.`,
      });
    } catch (error) {
      setStatus({
        kind: 'error',
        message: error instanceof Error ? error.message : 'Сталася помилка генерації ідей.',
      });
    }
  }

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
          className="inline-flex h-10 items-center gap-2 rounded-md border border-neutral-300 bg-white px-4 text-sm font-semibold text-neutral-900 transition hover:border-neutral-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-950 focus-visible:ring-offset-2"
          onClick={createNewGeneration}
          type="button"
        >
          <Plus className="h-4 w-4" aria-hidden="true" />
          Нова генерація
        </button>
      </div>

      <form className="space-y-5" onSubmit={handleSubmit}>
        <section className="rounded-lg border border-neutral-200 bg-white p-5 shadow-soft">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div>
              <label className="mb-2 block text-sm font-semibold text-neutral-950" htmlFor="merchAudience">
                Аудиторія *
              </label>
              <input
                className="h-11 w-full rounded-md border border-neutral-300 bg-neutral-50 px-3 text-sm text-neutral-900 outline-none transition placeholder:text-neutral-400 focus:border-neutral-950 focus:bg-white"
                id="merchAudience"
                placeholder="чоловіки 30-40, маркетологи IT-компаній"
                value={form.audience}
                onChange={(event) => updateForm({ audience: event.target.value })}
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-semibold text-neutral-950" htmlFor="merchOccasion">
                Привід / тематика *
              </label>
              <input
                className="h-11 w-full rounded-md border border-neutral-300 bg-neutral-50 px-3 text-sm text-neutral-900 outline-none transition placeholder:text-neutral-400 focus:border-neutral-950 focus:bg-white"
                id="merchOccasion"
                placeholder="івент, запуск продукту, welcome pack"
                value={form.occasion}
                onChange={(event) => updateForm({ occasion: event.target.value })}
              />
            </div>

            <div className="md:col-span-2">
              <label className="mb-2 block text-sm font-semibold text-neutral-950" htmlFor="merchDirection">
                Напрямок / формат *
              </label>
              <textarea
                className="min-h-28 w-full rounded-md border border-neutral-300 bg-neutral-50 p-4 text-sm leading-6 text-neutral-900 outline-none transition placeholder:text-neutral-400 focus:border-neutral-950 focus:bg-white"
                id="merchDirection"
                placeholder="щось їстивне брендоване в нестандартному пакуванні"
                value={form.direction}
                onChange={(event) => updateForm({ direction: event.target.value })}
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-semibold text-neutral-950" htmlFor="merchBudget">
                Бюджет
              </label>
              <input
                className="h-11 w-full rounded-md border border-neutral-300 bg-neutral-50 px-3 text-sm text-neutral-900 outline-none transition placeholder:text-neutral-400 focus:border-neutral-950 focus:bg-white"
                id="merchBudget"
                placeholder="$20 за одиницю або $3000 total"
                value={form.budget}
                onChange={(event) => updateForm({ budget: event.target.value })}
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-semibold text-neutral-950" htmlFor="merchQuantity">
                Кількість одиниць
              </label>
              <input
                className="h-11 w-full rounded-md border border-neutral-300 bg-neutral-50 px-3 text-sm text-neutral-900 outline-none transition placeholder:text-neutral-400 focus:border-neutral-950 focus:bg-white"
                id="merchQuantity"
                placeholder="100, 500, 1000"
                value={form.quantity}
                onChange={(event) => updateForm({ quantity: event.target.value })}
              />
            </div>

            <div className="md:col-span-2">
              <label className="mb-2 block text-sm font-semibold text-neutral-950" htmlFor="merchReferences">
                Бренди-референси
              </label>
              <input
                className="h-11 w-full rounded-md border border-neutral-300 bg-neutral-50 px-3 text-sm text-neutral-900 outline-none transition placeholder:text-neutral-400 focus:border-neutral-950 focus:bg-white"
                id="merchReferences"
                placeholder={referenceBrandsPlaceholder}
                value={form.referenceBrands}
                onChange={(event) => updateForm({ referenceBrands: event.target.value })}
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-semibold text-neutral-950" htmlFor="merchIdeasCount">
                Кількість ідей
              </label>
              <input
                className="h-11 w-full rounded-md border border-neutral-300 bg-neutral-50 px-3 text-sm text-neutral-900 outline-none transition focus:border-neutral-950 focus:bg-white"
                id="merchIdeasCount"
                max={10}
                min={1}
                type="number"
                value={form.ideasCount}
                onChange={(event) => updateForm({ ideasCount: normalizeIdeasCount(Number(event.target.value)) })}
              />
            </div>
          </div>
        </section>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <button
            className="inline-flex h-11 items-center gap-2 rounded-md bg-neutral-950 px-5 text-sm font-semibold text-white transition hover:bg-neutral-800 disabled:cursor-not-allowed disabled:bg-neutral-300 disabled:text-neutral-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-950 focus-visible:ring-offset-2"
            disabled={!canGenerate}
            type="submit"
          >
            {isLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            ) : (
              <WandSparkles className="h-4 w-4" aria-hidden="true" />
            )}
            Згенерувати ідеї
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
      </form>

      <MerchIdeasResults result={result} />
    </div>
  );
}

type MerchIdeasResultsProps = {
  result: MerchIdeasResult | null;
};

function MerchIdeasResults({ result }: MerchIdeasResultsProps) {
  if (!result) {
    return (
      <section className="rounded-lg border border-dashed border-neutral-300 bg-white p-8 text-center">
        <Search className="mx-auto h-8 w-8 text-neutral-400" aria-hidden="true" />
        <h2 className="mt-3 text-base font-semibold text-neutral-950">Ідеї зʼявляться тут</h2>
        <p className="mt-2 text-sm leading-6 text-neutral-500">
          Кожна картка матиме референс компанії, пояснення й формат пакування.
        </p>
      </section>
    );
  }

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold tracking-normal text-neutral-950">Ідеї для мерчу та подарунків</h2>
        <p className="text-sm font-medium text-neutral-500">{result.ideas.length} ідей</p>
      </div>

      <div className="grid grid-cols-1 gap-4">
        {result.ideas.map((idea, index) => (
          <MerchIdeaCard idea={idea} index={index} key={`${idea.title}-${index}`} />
        ))}
      </div>
    </section>
  );
}

type MerchIdeaCardProps = {
  idea: MerchIdea;
  index: number;
};

function MerchIdeaCard({ idea, index }: MerchIdeaCardProps) {
  const sourceUrl = idea.source_url.trim();

  return (
    <article className="rounded-lg border border-neutral-200 bg-white p-5 shadow-soft">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-neutral-500">
            Ідея {index + 1}
          </p>
          <h3 className="mt-1 text-lg font-semibold leading-7 text-neutral-950">{idea.title}</h3>
          <p className="mt-2 inline-flex items-center gap-2 rounded-md border border-neutral-200 bg-neutral-50 px-3 py-1 text-sm font-semibold text-neutral-700">
            <Gift className="h-4 w-4" aria-hidden="true" />
            {idea.company}
          </p>
        </div>

        {sourceUrl && isHttpUrl(sourceUrl) ? (
          <a
            className="inline-flex h-9 items-center gap-2 rounded-md border border-neutral-300 bg-white px-3 text-xs font-semibold text-neutral-900 transition hover:border-neutral-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-950 focus-visible:ring-offset-2"
            href={sourceUrl}
            rel="noreferrer"
            target="_blank"
          >
            Джерело
            <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
          </a>
        ) : null}
      </div>

      <div className="mt-5 grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(280px,0.8fr)]">
        <div className="rounded-md border border-neutral-200 bg-neutral-50 p-4">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-neutral-500">Що зробила компанія</p>
          <p className="mt-2 text-sm leading-6 text-neutral-800">{idea.case}</p>
        </div>

        <div className="rounded-md border border-neutral-200 bg-neutral-50 p-4">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-neutral-500">Чому пасує</p>
          <p className="mt-2 text-sm leading-6 text-neutral-800">{idea.why_fits}</p>
        </div>

        <div className="rounded-md border border-neutral-200 bg-neutral-50 p-4 lg:col-span-2">
          <div className="flex items-center gap-2">
            <PackageCheck className="h-4 w-4 text-neutral-500" aria-hidden="true" />
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-neutral-500">
              Формат / пакування
            </p>
          </div>
          <p className="mt-2 text-sm leading-6 text-neutral-800">{idea.format_packaging}</p>
        </div>
      </div>
    </article>
  );
}

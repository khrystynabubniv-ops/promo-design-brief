'use client';

import { ArrowLeft, ExternalLink, Loader2 } from 'lucide-react';
import { FORMATS, PLATFORMS, PRIORITIES, TASK_TYPES } from '@/lib/constants';
import type { ActionStatus, NotionTaskForm } from '@/lib/types';

type Step3NotionProps = {
  form: NotionTaskForm;
  status: ActionStatus;
  notionUrl: string;
  onBack: () => void;
  onFormChange: (patch: Partial<NotionTaskForm>) => void;
  onSubmit: () => void;
};

export function Step3Notion({
  form,
  status,
  notionUrl,
  onBack,
  onFormChange,
  onSubmit,
}: Step3NotionProps) {
  const isLoading = status.kind === 'loading';

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (notionUrl) {
      window.open(notionUrl, '_blank', 'noopener,noreferrer');
      return;
    }

    onSubmit();
  }

  return (
    <form className="space-y-5" onSubmit={handleSubmit}>
      <section className="rounded-lg border border-neutral-200 bg-white p-5 shadow-soft">
        <div className="space-y-5">
          <div>
            <label className="mb-2 block text-sm font-semibold text-neutral-950" htmlFor="taskName">
              Назва задачі *
            </label>
            <input
              className="h-11 w-full rounded-md border border-neutral-300 bg-neutral-50 px-3 text-sm text-neutral-900 outline-none transition placeholder:text-neutral-400 focus:border-neutral-950 focus:bg-white"
              id="taskName"
              placeholder="Promo вакансії Universe Group"
              value={form.name}
              onChange={(event) => onFormChange({ name: event.target.value })}
            />
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div>
              <label className="mb-2 block text-sm font-semibold text-neutral-950" htmlFor="deadline">
                Deadline *
              </label>
              <input
                className="h-11 w-full rounded-md border border-neutral-300 bg-neutral-50 px-3 text-sm text-neutral-900 outline-none transition focus:border-neutral-950 focus:bg-white"
                id="deadline"
                type="date"
                value={form.deadline}
                onChange={(event) => onFormChange({ deadline: event.target.value })}
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-semibold text-neutral-950" htmlFor="priority">
                Priority
              </label>
              <select
                className="h-11 w-full rounded-md border border-neutral-300 bg-neutral-50 px-3 text-sm text-neutral-900 outline-none transition focus:border-neutral-950 focus:bg-white"
                id="priority"
                value={form.priority}
                onChange={(event) => onFormChange({ priority: event.target.value as NotionTaskForm['priority'] })}
              >
                {PRIORITIES.map((priority) => (
                  <option key={priority} value={priority}>
                    {priority}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div>
              <label className="mb-2 block text-sm font-semibold text-neutral-950" htmlFor="platform">
                Platform
              </label>
              <select
                className="h-11 w-full rounded-md border border-neutral-300 bg-neutral-50 px-3 text-sm text-neutral-900 outline-none transition focus:border-neutral-950 focus:bg-white"
                id="platform"
                value={form.platform}
                onChange={(event) => onFormChange({ platform: event.target.value })}
              >
                {PLATFORMS.map((platform) => (
                  <option key={platform} value={platform}>
                    {platform}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-2 block text-sm font-semibold text-neutral-950" htmlFor="format">
                Format
              </label>
              <select
                className="h-11 w-full rounded-md border border-neutral-300 bg-neutral-50 px-3 text-sm text-neutral-900 outline-none transition focus:border-neutral-950 focus:bg-white"
                id="format"
                value={form.format}
                onChange={(event) => onFormChange({ format: event.target.value })}
              >
                {FORMATS.map((format) => (
                  <option key={format} value={format}>
                    {format}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <fieldset>
            <legend className="mb-3 text-sm font-semibold text-neutral-950">Task Type *</legend>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              {TASK_TYPES.map((taskType) => {
                const selected = form.taskTypeId === taskType.pageId;

                return (
                  <button
                    className={[
                      'min-h-24 rounded-md border p-4 text-left transition',
                      selected
                        ? 'border-neutral-950 bg-neutral-950 text-white'
                        : 'border-neutral-300 bg-neutral-50 text-neutral-900 hover:border-neutral-950 hover:bg-white',
                    ].join(' ')}
                    key={taskType.pageId}
                    onClick={() => onFormChange({ taskTypeId: taskType.pageId })}
                    type="button"
                  >
                    <span className="block text-sm font-semibold leading-5">{taskType.name}</span>
                    <span className={selected ? 'mt-2 block text-xs text-neutral-300' : 'mt-2 block text-xs text-neutral-500'}>
                      {taskType.hours} год
                    </span>
                  </button>
                );
              })}
            </div>
          </fieldset>
        </div>
      </section>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <button
          className="inline-flex h-11 items-center gap-2 rounded-md border border-neutral-300 bg-white px-5 text-sm font-semibold text-neutral-900 transition hover:border-neutral-950"
          onClick={onBack}
          type="button"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          Назад
        </button>

        <div className="flex flex-wrap items-center justify-end gap-3">
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

          <button
            className="inline-flex h-11 items-center gap-2 rounded-md bg-neutral-950 px-5 text-sm font-semibold text-white transition hover:bg-neutral-800 disabled:cursor-not-allowed disabled:bg-neutral-300 disabled:text-neutral-500"
            disabled={isLoading}
            type="submit"
          >
            {isLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            ) : (
              <ExternalLink className="h-4 w-4" aria-hidden="true" />
            )}
            {notionUrl ? 'Відкрити в Notion' : 'Створити задачу в Notion'}
          </button>
        </div>
      </div>
    </form>
  );
}

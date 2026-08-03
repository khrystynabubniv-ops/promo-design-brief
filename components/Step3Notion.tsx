'use client';

import { ArrowLeft, CheckCircle2, ExternalLink, Loader2, Plus } from 'lucide-react';
import { FORMATS, PLATFORMS, PRIORITIES, TASK_TYPES } from '@/lib/constants';
import type { ActionStatus, NotionTaskForm, NotionTaskLink } from '@/lib/types';

type Step3NotionProps = {
  form: NotionTaskForm;
  status: ActionStatus;
  notionUrl: string;
  notionTaskLinks: NotionTaskLink[];
  onBack: () => void;
  onCreateNew: () => void;
  onFormChange: (patch: Partial<NotionTaskForm>) => void;
  onSubmit: () => void;
};

export function Step3Notion({
  form,
  status,
  notionUrl,
  notionTaskLinks,
  onBack,
  onCreateNew,
  onFormChange,
  onSubmit,
}: Step3NotionProps) {
  const isLoading = status.kind === 'loading';
  const childTaskLinks = notionTaskLinks.filter((taskLink) => taskLink.kind === 'child');

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (notionUrl) {
      window.open(notionUrl, '_blank', 'noopener,noreferrer');
      return;
    }

    onSubmit();
  }

  if (notionUrl) {
    return (
      <section
        aria-labelledby="task-created-title"
        className="ct-app-panel p-8 text-center"
        role="dialog"
      >
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-green-50 text-green-700 ring-1 ring-green-200">
          <CheckCircle2 className="h-7 w-7" aria-hidden="true" />
        </div>
        <h2 className="mt-5 text-2xl font-bold tracking-normal text-[#181b22]" id="task-created-title">
          {childTaskLinks.length ? 'Задачі створено' : 'Задачу створено'}
        </h2>

        {status.message ? (
          <p className="mt-2 text-sm font-medium text-[#7b8392]">{status.message}</p>
        ) : null}

        {childTaskLinks.length ? (
          <div className="mx-auto mt-5 max-w-xl text-left">
            <p className="text-xs font-bold uppercase tracking-normal text-[#939bab]">
              Child-задачі
            </p>
            <div className="mt-3 space-y-2">
              {childTaskLinks.map((taskLink) => (
                <a
                  className="flex min-h-10 items-center justify-between gap-3 rounded-[10px] border border-[#e3e6ec] bg-white px-3 py-2 text-sm font-semibold text-[#2a3038] transition hover:bg-[#f5f6f8]"
                  href={taskLink.url}
                  key={taskLink.id}
                  rel="noreferrer"
                  target="_blank"
                >
                  <span className="min-w-0 truncate">{taskLink.name}</span>
                  <ExternalLink className="h-4 w-4 shrink-0" aria-hidden="true" />
                </a>
              ))}
            </div>
          </div>
        ) : null}

        <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
          <a
            className="ct-primary-action"
            href={notionUrl}
            rel="noreferrer"
            target="_blank"
          >
            <ExternalLink className="h-4 w-4" aria-hidden="true" />
            Відкрити в Notion
          </a>

          <button
            className="ct-secondary-action"
            onClick={onCreateNew}
            type="button"
          >
            <Plus className="h-4 w-4" aria-hidden="true" />
            Створити нову задачу
          </button>
        </div>
      </section>
    );
  }

  return (
    <form className="space-y-5" onSubmit={handleSubmit}>
      <section className="ct-app-panel p-5">
        <div className="space-y-5">
          <div>
            <label className="ct-app-label" htmlFor="taskName">
              Назва задачі *
            </label>
            <input
              className="ct-app-field h-11 w-full px-3"
              id="taskName"
              placeholder="Promo вакансії Universe"
              value={form.name}
              onChange={(event) => onFormChange({ name: event.target.value })}
            />
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div>
              <label className="ct-app-label" htmlFor="deadline">
                Deadline *
              </label>
              <input
                className="ct-app-field h-11 w-full px-3"
                id="deadline"
                type="date"
                value={form.deadline}
                onChange={(event) => onFormChange({ deadline: event.target.value })}
              />
            </div>

            <div>
              <label className="ct-app-label" htmlFor="priority">
                Priority
              </label>
              <select
                className="ct-app-field h-11 w-full px-3"
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
              <fieldset>
                <legend className="ct-app-label">Platform</legend>
                <div className="grid grid-cols-2 gap-2">
                  {PLATFORMS.map((platform) => {
                    const selected = form.platform.includes(platform);

                    return (
                      <button
                        aria-pressed={selected}
                        className={[
                          'ct-choice-card min-h-11 px-3 py-2 text-left text-sm font-bold',
                          selected ? 'ct-choice-card-active' : '',
                        ].join(' ')}
                        key={platform}
                        onClick={() =>
                          onFormChange({
                            platform: selected
                              ? form.platform.filter((value) => value !== platform)
                              : [...form.platform, platform],
                          })
                        }
                        type="button"
                      >
                        {platform}
                      </button>
                    );
                  })}
                </div>
              </fieldset>
            </div>

            <div>
              <fieldset>
                <legend className="ct-app-label">Format</legend>
                <div className="grid grid-cols-2 gap-2">
                  {FORMATS.map((format) => {
                    const selected = form.format === format;

                    return (
                      <button
                        aria-pressed={selected}
                        className={[
                          'ct-choice-card min-h-11 px-3 py-2 text-left text-sm font-bold',
                          selected ? 'ct-choice-card-active' : '',
                        ].join(' ')}
                        key={format}
                        onClick={() => onFormChange({ format })}
                        type="button"
                      >
                        {format}
                      </button>
                    );
                  })}
                </div>
              </fieldset>
            </div>
          </div>

          <fieldset>
            <legend className="ct-app-label">Task Type *</legend>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              {TASK_TYPES.map((taskType) => {
                const selected = form.taskTypeId === taskType.pageId;

                return (
                  <button
                    className={[
                      'ct-choice-card min-h-24 p-4 text-left',
                      selected ? 'ct-choice-card-active' : '',
                    ].join(' ')}
                    key={taskType.pageId}
                    onClick={() => onFormChange({ taskTypeId: taskType.pageId })}
                    type="button"
                  >
                    <span className="block text-sm font-bold leading-5">{taskType.name}</span>
                    <span className={selected ? 'mt-2 block text-xs text-[#3a5bbf]' : 'mt-2 block text-xs text-[#7b8392]'}>
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
          className="ct-secondary-action"
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

          <button
            className="ct-primary-action"
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

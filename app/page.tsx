'use client';

import { useEffect, useMemo, useState } from 'react';
import { Stepper } from '@/components/Stepper';
import { Step1Vacancies } from '@/components/Step1Vacancies';
import { Step2Brief } from '@/components/Step2Brief';
import { Step3Notion } from '@/components/Step3Notion';
import { RequestHistory } from '@/components/RequestHistory';
import { DEFAULT_PROMPT } from '@/lib/constants';
import type { ActionStatus, AppStep, NotionTaskForm, RequestHistoryItem } from '@/lib/types';

const PROMPT_STORAGE_KEY = 'brief_sys_prompt';
const PROMPT_STORAGE_VERSION_KEY = 'brief_sys_prompt_version';
const CURRENT_PROMPT_VERSION = 'creative-strategy-v2';
const HISTORY_STORAGE_KEY = 'brief_request_history';
const MAX_HISTORY_ITEMS = 30;

const initialStatus: ActionStatus = { kind: 'idle' };

const initialNotionForm: NotionTaskForm = {
  name: '',
  deadline: '',
  priority: 'Planned',
  platform: 'Meta',
  format: 'Static Image',
  taskTypeId: '',
};

type GenerateBriefResponse = {
  brief?: string;
  continuationAttempts?: number;
  durationMs?: number;
  error?: string;
  finishReason?: string | null;
  resolvedUrlCount?: number;
};

type CreateNotionTaskResponse = {
  url?: string;
  fallbackUrl?: string;
  id?: string;
  durationMs?: number;
  error?: string;
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

function getRequestErrorMessage(error: unknown) {
  if (error instanceof TypeError && error.message.toLowerCase().includes('failed to fetch')) {
    return 'Не вдалося з’єднатися з API генерації. Перевірте, що сервер запущений, а деплой не обриває довгий запит.';
  }

  return error instanceof Error ? error.message : 'Сталася помилка генерації.';
}

function createHistoryId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function formatDurationLabel(value: number) {
  return value < 1000 ? `${value} ms` : `${(value / 1000).toFixed(1)} s`;
}

function deriveHistoryTitle(vacancies: string) {
  const firstLine = vacancies
    .split('\n')
    .map((line) => line.replace(/^#+\s*/, '').replaceAll('*', '').trim())
    .find(Boolean);

  if (!firstLine) {
    return 'Запит без назви';
  }

  return firstLine.length > 72 ? `${firstLine.slice(0, 72)}...` : firstLine;
}

function parseHistoryItems(rawHistory: string | null): RequestHistoryItem[] {
  if (!rawHistory) {
    return [];
  }

  try {
    const parsed: unknown = JSON.parse(rawHistory);

    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed
      .reduce<RequestHistoryItem[]>((items, item) => {
        if (!item || typeof item !== 'object') {
          return items;
        }

        const candidate = item as Partial<RequestHistoryItem>;

        if (
          typeof candidate.id !== 'string' ||
          typeof candidate.createdAt !== 'string' ||
          typeof candidate.vacancies !== 'string' ||
          typeof candidate.brief !== 'string'
        ) {
          return items;
        }

        items.push({
          id: candidate.id,
          createdAt: candidate.createdAt,
          title: typeof candidate.title === 'string' ? candidate.title : deriveHistoryTitle(candidate.vacancies),
          vacancies: candidate.vacancies,
          systemPrompt: typeof candidate.systemPrompt === 'string' ? candidate.systemPrompt : '',
          brief: candidate.brief,
          notionForm: candidate.notionForm,
          taskUrl: candidate.taskUrl,
          taskFallbackUrl: candidate.taskFallbackUrl,
          taskId: candidate.taskId,
          timings: candidate.timings ?? {},
        });

        return items;
      }, [])
      .slice(0, MAX_HISTORY_ITEMS);
  } catch {
    return [];
  }
}

export default function Home() {
  const [step, setStep] = useState<AppStep>(1);
  const [vacancies, setVacancies] = useState('');
  const [systemPrompt, setSystemPrompt] = useState(DEFAULT_PROMPT);
  const [brief, setBrief] = useState('');
  const [generateStatus, setGenerateStatus] = useState<ActionStatus>(initialStatus);
  const [notionStatus, setNotionStatus] = useState<ActionStatus>(initialStatus);
  const [notionForm, setNotionForm] = useState<NotionTaskForm>(initialNotionForm);
  const [notionUrl, setNotionUrl] = useState('');
  const [historyItems, setHistoryItems] = useState<RequestHistoryItem[]>([]);
  const [activeHistoryId, setActiveHistoryId] = useState('');
  const [historyLoaded, setHistoryLoaded] = useState(false);

  const appTitle = useMemo(
    () => process.env.NEXT_PUBLIC_APP_TITLE ?? 'Brief Generator',
    [],
  );

  useEffect(() => {
    const savedPrompt = window.localStorage.getItem(PROMPT_STORAGE_KEY);
    const savedPromptVersion = window.localStorage.getItem(PROMPT_STORAGE_VERSION_KEY);

    if (savedPrompt && savedPromptVersion === CURRENT_PROMPT_VERSION) {
      setSystemPrompt(savedPrompt);
      return;
    }

    window.localStorage.setItem(PROMPT_STORAGE_KEY, DEFAULT_PROMPT);
    window.localStorage.setItem(PROMPT_STORAGE_VERSION_KEY, CURRENT_PROMPT_VERSION);
  }, []);

  useEffect(() => {
    window.localStorage.setItem(PROMPT_STORAGE_KEY, systemPrompt);
    window.localStorage.setItem(PROMPT_STORAGE_VERSION_KEY, CURRENT_PROMPT_VERSION);
  }, [systemPrompt]);

  useEffect(() => {
    const savedHistory = parseHistoryItems(window.localStorage.getItem(HISTORY_STORAGE_KEY));

    setHistoryItems(savedHistory);
    setActiveHistoryId(savedHistory[0]?.id ?? '');
    setHistoryLoaded(true);
  }, []);

  useEffect(() => {
    if (!historyLoaded) {
      return;
    }

    window.localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(historyItems));
  }, [historyItems, historyLoaded]);

  function saveHistoryItem(item: RequestHistoryItem) {
    setHistoryItems((current) => [
      item,
      ...current.filter((historyItem) => historyItem.id !== item.id),
    ].slice(0, MAX_HISTORY_ITEMS));
  }

  function updateHistoryItem(id: string, patch: Partial<RequestHistoryItem>) {
    setHistoryItems((current) =>
      current.map((item) =>
        item.id === id
          ? {
              ...item,
              ...patch,
              timings: {
                ...item.timings,
                ...(patch.timings ?? {}),
              },
            }
          : item,
      ),
    );
  }

  async function handleGenerateBrief() {
    const requestStartedAt = performance.now();

    setGenerateStatus({ kind: 'loading', message: 'Генеруємо бриф...' });

    try {
      const response = await fetch('/api/generate-brief', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          vacancies,
          systemPrompt,
        }),
      });

      const data = await readApiJson<GenerateBriefResponse>(response);

      if (!response.ok) {
        throw new Error(
          data.error ?? `Не вдалося згенерувати бриф. Сервер повернув ${response.status}.`,
        );
      }

      const generatedBrief = data.brief ?? '';
      const durationMs = Math.round(performance.now() - requestStartedAt);
      const historyId = createHistoryId();

      console.info('[Brief Generator] generate-brief duration', {
        durationMs,
        serverDurationMs: data.durationMs ?? null,
      });

      setBrief(generatedBrief);
      setActiveHistoryId(historyId);
      saveHistoryItem({
        id: historyId,
        createdAt: new Date().toISOString(),
        title: deriveHistoryTitle(vacancies),
        vacancies,
        systemPrompt,
        brief: generatedBrief,
        timings: {
          generateBriefMs: durationMs,
        },
      });
      const continuationMessage = data.continuationAttempts
        ? ` Дозібрано ${data.continuationAttempts} продовження.`
        : '';
      const resolvedLinksMessage = data.resolvedUrlCount
        ? ` Опрацьовано ${data.resolvedUrlCount} Ashby-лінків.`
        : '';

      setGenerateStatus({
        kind: 'success',
        message: `Бриф готовий за ${formatDurationLabel(durationMs)}.${resolvedLinksMessage}${continuationMessage}`,
      });
      setStep(2);
    } catch (error) {
      const durationMs = Math.round(performance.now() - requestStartedAt);

      console.error('[Brief Generator] generate-brief failed', { durationMs, error });
      setGenerateStatus({
        kind: 'error',
        message: getRequestErrorMessage(error),
      });
    }
  }

  async function handleCreateNotionTask() {
    if (!notionForm.name.trim()) {
      setNotionStatus({ kind: 'error', message: 'Заповніть назву задачі.' });
      return;
    }

    if (!notionForm.deadline) {
      setNotionStatus({ kind: 'error', message: 'Оберіть deadline.' });
      return;
    }

    if (!notionForm.taskTypeId) {
      setNotionStatus({ kind: 'error', message: 'Оберіть Task Type.' });
      return;
    }

    const requestStartedAt = performance.now();

    setNotionStatus({ kind: 'loading', message: 'Створюємо задачу...' });

    try {
      const response = await fetch('/api/notion/create-task', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...notionForm,
          brief,
        }),
      });

      const data = (await response.json()) as CreateNotionTaskResponse;

      if (!response.ok) {
        throw new Error(data.error ?? 'Не вдалося створити задачу в Notion.');
      }

      const durationMs = Math.round(performance.now() - requestStartedAt);
      const taskUrl = data.url ?? data.fallbackUrl ?? '';

      console.info('[Brief Generator] create-notion-task duration', {
        durationMs,
        serverDurationMs: data.durationMs ?? null,
        taskId: data.id ?? null,
      });

      setNotionUrl(taskUrl);
      setNotionStatus({ kind: 'success', message: `Задачу створено за ${formatDurationLabel(durationMs)}.` });

      if (activeHistoryId) {
        updateHistoryItem(activeHistoryId, {
          title: notionForm.name.trim() || deriveHistoryTitle(vacancies),
          brief,
          notionForm,
          taskUrl,
          taskFallbackUrl: data.fallbackUrl,
          taskId: data.id,
          timings: {
            createNotionTaskMs: durationMs,
          },
        });
      }
    } catch (error) {
      const durationMs = Math.round(performance.now() - requestStartedAt);

      console.error('[Brief Generator] create-notion-task failed', { durationMs, error });
      setNotionStatus({
        kind: 'error',
        message: error instanceof Error ? error.message : 'Сталася помилка Notion.',
      });
    }
  }

  function handleBriefChange(value: string) {
    setBrief(value);

    if (activeHistoryId) {
      updateHistoryItem(activeHistoryId, { brief: value });
    }
  }

  function handleCreateNewTask() {
    setStep(1);
    setVacancies('');
    setBrief('');
    setGenerateStatus(initialStatus);
    setNotionStatus(initialStatus);
    setNotionForm(initialNotionForm);
    setNotionUrl('');
    setActiveHistoryId(historyItems[0]?.id ?? '');
  }

  function clearHistory() {
    setHistoryItems([]);
    setActiveHistoryId('');
  }

  function updateNotionForm(patch: Partial<NotionTaskForm>) {
    setNotionUrl('');
    setNotionStatus(initialStatus);
    setNotionForm((current) => ({ ...current, ...patch }));
  }

  return (
    <main className="min-h-screen px-6 py-8">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
        <header className="flex items-end justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-neutral-500">
              Universe Group
            </p>
            <h1 className="mt-2 text-3xl font-semibold tracking-normal text-neutral-950">
              {appTitle}
            </h1>
          </div>
        </header>

        <Stepper currentStep={step} />

        {step === 1 ? (
          <Step1Vacancies
            status={generateStatus}
            systemPrompt={systemPrompt}
            vacancies={vacancies}
            onGenerate={handleGenerateBrief}
            onSystemPromptChange={setSystemPrompt}
            onVacanciesChange={setVacancies}
          />
        ) : null}

        {step === 2 ? (
          <Step2Brief
            brief={brief}
            onBack={() => setStep(1)}
            onBriefChange={handleBriefChange}
            onNext={() => setStep(3)}
          />
        ) : null}

        {step === 3 ? (
          <Step3Notion
            form={notionForm}
            notionUrl={notionUrl}
            status={notionStatus}
            onBack={() => setStep(2)}
            onCreateNew={handleCreateNewTask}
            onFormChange={updateNotionForm}
            onSubmit={handleCreateNotionTask}
          />
        ) : null}

        <RequestHistory
          activeId={activeHistoryId}
          items={historyItems}
          onClear={clearHistory}
          onSelect={setActiveHistoryId}
        />
      </div>
    </main>
  );
}

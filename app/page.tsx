'use client';

import { useEffect, useMemo, useState } from 'react';
import { Stepper } from '@/components/Stepper';
import { Step1Vacancies } from '@/components/Step1Vacancies';
import { Step2Brief } from '@/components/Step2Brief';
import { Step3Notion } from '@/components/Step3Notion';
import { DEFAULT_PROMPT } from '@/lib/constants';
import type { ActionStatus, AppStep, NotionTaskForm } from '@/lib/types';

const PROMPT_STORAGE_KEY = 'brief_sys_prompt';
const PROMPT_STORAGE_VERSION_KEY = 'brief_sys_prompt_version';
const CURRENT_PROMPT_VERSION = 'creative-strategy-v2';

const initialStatus: ActionStatus = { kind: 'idle' };

const initialNotionForm: NotionTaskForm = {
  name: '',
  deadline: '',
  priority: 'Planned',
  platform: 'Meta',
  formats: ['Static Image'],
  taskTypeId: '',
};

export default function Home() {
  const [step, setStep] = useState<AppStep>(1);
  const [vacancies, setVacancies] = useState('');
  const [systemPrompt, setSystemPrompt] = useState(DEFAULT_PROMPT);
  const [brief, setBrief] = useState('');
  const [generateStatus, setGenerateStatus] = useState<ActionStatus>(initialStatus);
  const [notionStatus, setNotionStatus] = useState<ActionStatus>(initialStatus);
  const [notionForm, setNotionForm] = useState<NotionTaskForm>(initialNotionForm);
  const [notionUrl, setNotionUrl] = useState('');

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

  async function handleGenerateBrief() {
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

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error ?? 'Не вдалося згенерувати бриф.');
      }

      setBrief(data.brief ?? '');
      setGenerateStatus({ kind: 'success', message: 'Бриф готовий.' });
      setStep(2);
    } catch (error) {
      setGenerateStatus({
        kind: 'error',
        message: error instanceof Error ? error.message : 'Сталася помилка генерації.',
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

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error ?? 'Не вдалося створити задачу в Notion.');
      }

      setNotionUrl(data.url ?? '');
      setNotionStatus({ kind: 'success', message: 'Задачу створено.' });
    } catch (error) {
      setNotionStatus({
        kind: 'error',
        message: error instanceof Error ? error.message : 'Сталася помилка Notion.',
      });
    }
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
            onBriefChange={setBrief}
            onNext={() => setStep(3)}
          />
        ) : null}

        {step === 3 ? (
          <Step3Notion
            form={notionForm}
            notionUrl={notionUrl}
            status={notionStatus}
            onBack={() => setStep(2)}
            onFormChange={updateNotionForm}
            onSubmit={handleCreateNotionTask}
          />
        ) : null}
      </div>
    </main>
  );
}

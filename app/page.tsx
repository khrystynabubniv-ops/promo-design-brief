'use client';

import { useEffect, useMemo, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { Layers3 } from 'lucide-react';
import { Stepper } from '@/components/Stepper';
import { Step1Vacancies } from '@/components/Step1Vacancies';
import { Step2Brief } from '@/components/Step2Brief';
import { Step3Notion } from '@/components/Step3Notion';
import { RequestHistory } from '@/components/RequestHistory';
import { SmmGenerator } from '@/components/SmmGenerator';
import { ToolHub } from '@/components/ToolHub';
import { MerchIdeasGenerator } from '@/components/MerchIdeasGenerator';
import { ArticlesView } from '@/features/articles/components/ArticlesView';
import { DEFAULT_PROMPT } from '@/lib/constants';
import { fetchGenerationHistory, getStringField } from '@/lib/historyClient';
import type {
  ActionStatus,
  AppStep,
  GenerationHistoryItem,
  NotionTaskForm,
  NotionTaskLink,
  RequestHistoryItem,
  VacancyBrief,
} from '@/lib/types';

const HISTORY_STORAGE_KEY = 'brief_request_history';
const MAX_HISTORY_ITEMS = 150;

const initialStatus: ActionStatus = { kind: 'idle' };

type ActiveTool = 'articles' | 'hub' | 'brief' | 'smm' | 'merch';

const toolPaths: Record<ActiveTool, string> = {
  articles: '/articles',
  brief: '/brief',
  hub: '/',
  merch: '/merch',
  smm: '/smm',
};

const initialNotionForm: NotionTaskForm = {
  name: '',
  deadline: '',
  priority: 'Planned',
  platform: ['Meta'],
  format: 'Static Image',
  taskTypeId: '',
};

type GenerateBriefResponse = {
  brief?: string;
  continuationAttempts?: number;
  durationMs?: number;
  error?: string;
  finishReason?: string | null;
  parentTitle?: string;
  resolvedUrlCount?: number;
  vacancyBriefs?: VacancyBrief[];
  historyItem?: GenerationHistoryItem | null;
};

type CreateNotionTaskResponse = {
  appendedBriefBlockCount?: number;
  childTaskCount?: number;
  descriptionTooLong?: boolean;
  url?: string;
  fallbackUrl?: string;
  id?: string;
  durationMs?: number;
  error?: string;
  tasks?: NotionTaskLink[];
  warning?: string;
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

function combineVacancyBriefs(vacancyBriefs: VacancyBrief[]) {
  return vacancyBriefs
    .map((vacancyBrief) => vacancyBrief.brief.trim())
    .filter(Boolean)
    .join('\n\n---\n\n');
}

function normalizeGeneratedVacancyBriefs(data: GenerateBriefResponse, fallbackBrief: string, vacanciesInput: string) {
  if (Array.isArray(data.vacancyBriefs) && data.vacancyBriefs.length) {
    const vacancyBriefs = data.vacancyBriefs
      .map((vacancyBrief, index): VacancyBrief | null => {
        if (!vacancyBrief || typeof vacancyBrief.brief !== 'string') {
          return null;
        }

        const briefText = vacancyBrief.brief.trim();

        if (!briefText) {
          return null;
        }

        return {
          brief: briefText,
          id: typeof vacancyBrief.id === 'string' && vacancyBrief.id.trim()
            ? vacancyBrief.id
            : `vacancy-${index + 1}`,
          sourceUrl: typeof vacancyBrief.sourceUrl === 'string' && vacancyBrief.sourceUrl.trim()
            ? vacancyBrief.sourceUrl
            : undefined,
          title: typeof vacancyBrief.title === 'string' && vacancyBrief.title.trim()
            ? vacancyBrief.title
            : `Вакансія ${index + 1}`,
        };
      })
      .filter((vacancyBrief): vacancyBrief is VacancyBrief => Boolean(vacancyBrief));

    if (vacancyBriefs.length) {
      return vacancyBriefs;
    }
  }

  return [
    {
      brief: fallbackBrief,
      id: 'vacancy-1',
      title: deriveHistoryTitle(vacanciesInput),
    },
  ];
}

function parseVacancyBriefs(value: unknown): VacancyBrief[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }

  const vacancyBriefs = value
    .map((item, index): VacancyBrief | null => {
      if (!item || typeof item !== 'object') {
        return null;
      }

      const candidate = item as Partial<VacancyBrief>;

      if (typeof candidate.brief !== 'string' || !candidate.brief.trim()) {
        return null;
      }

      return {
        brief: candidate.brief,
        id: typeof candidate.id === 'string' ? candidate.id : `vacancy-${index + 1}`,
        sourceUrl: typeof candidate.sourceUrl === 'string' ? candidate.sourceUrl : undefined,
        title: typeof candidate.title === 'string' ? candidate.title : `Вакансія ${index + 1}`,
      };
    })
    .filter((item): item is VacancyBrief => Boolean(item));

  return vacancyBriefs.length ? vacancyBriefs : undefined;
}

function parseTaskUrls(value: unknown): NotionTaskLink[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }

  const taskUrls = value
    .map((item): NotionTaskLink | null => {
      if (!item || typeof item !== 'object') {
        return null;
      }

      const candidate = item as Partial<NotionTaskLink>;

      if (
        typeof candidate.id !== 'string' ||
        typeof candidate.name !== 'string' ||
        typeof candidate.url !== 'string' ||
        !['single', 'parent', 'child'].includes(String(candidate.kind))
      ) {
        return null;
      }

      return {
        fallbackUrl: typeof candidate.fallbackUrl === 'string' ? candidate.fallbackUrl : undefined,
        id: candidate.id,
        kind: candidate.kind as NotionTaskLink['kind'],
        name: candidate.name,
        url: candidate.url,
      };
    })
    .filter((item): item is NotionTaskLink => Boolean(item));

  return taskUrls.length ? taskUrls : undefined;
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
          vacancyBriefs: parseVacancyBriefs(candidate.vacancyBriefs),
          notionForm: candidate.notionForm,
          taskUrl: candidate.taskUrl,
          taskFallbackUrl: candidate.taskFallbackUrl,
          taskId: candidate.taskId,
          taskUrls: parseTaskUrls(candidate.taskUrls),
          timings: candidate.timings ?? {},
        });

        return items;
      }, [])
      .slice(0, MAX_HISTORY_ITEMS);
  } catch {
    return [];
  }
}

function mapBriefGenerationHistoryItem(item: GenerationHistoryItem): RequestHistoryItem | null {
  if (item.tool !== 'brief') {
    return null;
  }

  const vacancies = getStringField(item.input, 'vacancies');
  const briefText = getStringField(item.output, 'brief');

  if (!vacancies || !briefText) {
    return null;
  }

  return {
    brief: briefText,
    createdAt: item.createdAt,
    id: item.id,
    systemPrompt: '',
    timings: {
      generateBriefMs: item.durationMs,
    },
    title: item.title || getStringField(item.output, 'parentTitle') || deriveHistoryTitle(vacancies),
    vacancies,
    vacancyBriefs: parseVacancyBriefs(item.output && typeof item.output === 'object'
      ? (item.output as { vacancyBriefs?: unknown }).vacancyBriefs
      : undefined),
  };
}

function mergeRequestHistoryItems(items: RequestHistoryItem[]) {
  const deduped = new Map<string, RequestHistoryItem>();

  items.forEach((item) => {
    if (!deduped.has(item.id)) {
      deduped.set(item.id, item);
    }
  });

  return Array.from(deduped.values())
    .sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime())
    .slice(0, MAX_HISTORY_ITEMS);
}

function getActiveToolFromPathname(pathname: string | null): ActiveTool {
  if (pathname === '/brief') {
    return 'brief';
  }

  if (pathname === '/smm') {
    return 'smm';
  }

  if (pathname === '/merch') {
    return 'merch';
  }

  if (pathname === '/articles') {
    return 'articles';
  }

  return 'hub';
}

export default function Home() {
  const router = useRouter();
  const pathname = usePathname();
  const activeTool = getActiveToolFromPathname(pathname);
  const [step, setStep] = useState<AppStep>(1);
  const [vacancies, setVacancies] = useState('');
  const systemPrompt = DEFAULT_PROMPT;
  const [brief, setBrief] = useState('');
  const [vacancyBriefs, setVacancyBriefs] = useState<VacancyBrief[]>([]);
  const [generateStatus, setGenerateStatus] = useState<ActionStatus>(initialStatus);
  const [notionStatus, setNotionStatus] = useState<ActionStatus>(initialStatus);
  const [notionForm, setNotionForm] = useState<NotionTaskForm>(initialNotionForm);
  const [notionUrl, setNotionUrl] = useState('');
  const [notionTaskLinks, setNotionTaskLinks] = useState<NotionTaskLink[]>([]);
  const [historyItems, setHistoryItems] = useState<RequestHistoryItem[]>([]);
  const [activeHistoryId, setActiveHistoryId] = useState('');
  const [historyLoaded, setHistoryLoaded] = useState(false);

  const appTitle = useMemo(() => {
    if (activeTool === 'brief') {
      return 'Promo Brief Generator';
    }

    if (activeTool === 'smm') {
      return 'SMM Universe Generator';
    }

    if (activeTool === 'merch') {
      return 'Merch & Gifts Ideas';
    }

    if (activeTool === 'articles') {
      return 'Написання статей і прес-релізів';
    }

    return 'PR Comms tools';
  }, [activeTool]);

  useEffect(() => {
    const savedHistory = parseHistoryItems(window.localStorage.getItem(HISTORY_STORAGE_KEY));
    let cancelled = false;

    setHistoryItems(savedHistory);
    setActiveHistoryId(savedHistory[0]?.id ?? '');
    setHistoryLoaded(true);

    async function loadServerHistory() {
      try {
        const serverHistory = (await fetchGenerationHistory('brief'))
          .map(mapBriefGenerationHistoryItem)
          .filter((item): item is RequestHistoryItem => Boolean(item));

        if (cancelled) {
          return;
        }

        setHistoryItems((current) => mergeRequestHistoryItems([...serverHistory, ...current]));
        setActiveHistoryId((current) => current || serverHistory[0]?.id || savedHistory[0]?.id || '');
      } catch (error) {
        console.warn('[Brief Generator] failed to load server history', error);
      }
    }

    void loadServerHistory();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!historyLoaded) {
      return;
    }

    window.localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(historyItems));
  }, [historyItems, historyLoaded]);

  function saveHistoryItem(item: RequestHistoryItem) {
    setHistoryItems((current) => mergeRequestHistoryItems([
      item,
      ...current.filter((historyItem) => historyItem.id !== item.id),
    ]));
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
        }),
      });

      const data = await readApiJson<GenerateBriefResponse>(response);

      if (!response.ok) {
        throw new Error(
          data.error ?? `Не вдалося згенерувати бриф. Сервер повернув ${response.status}.`,
        );
      }

      const generatedVacancyBriefs = normalizeGeneratedVacancyBriefs(data, data.brief ?? '', vacancies);
      const generatedBrief = data.brief ?? combineVacancyBriefs(generatedVacancyBriefs);
      const durationMs = Math.round(performance.now() - requestStartedAt);
      const serverHistoryItem = data.historyItem
        ? mapBriefGenerationHistoryItem(data.historyItem)
        : null;
      const historyId = serverHistoryItem?.id ?? createHistoryId();
      const historyItem = serverHistoryItem ?? {
        id: historyId,
        createdAt: new Date().toISOString(),
        title: data.parentTitle ?? deriveHistoryTitle(vacancies),
        vacancies,
        systemPrompt,
        brief: generatedBrief,
        vacancyBriefs: generatedVacancyBriefs,
        timings: {
          generateBriefMs: durationMs,
        },
      };

      console.info('[Brief Generator] generate-brief duration', {
        durationMs,
        serverDurationMs: data.durationMs ?? null,
      });

      setBrief(generatedBrief);
      setVacancyBriefs(generatedVacancyBriefs);
      setNotionUrl('');
      setNotionTaskLinks([]);
      setNotionForm((currentForm) => {
        if (currentForm.name.trim()) {
          return currentForm;
        }

        return {
          ...currentForm,
          name: data.parentTitle ?? generatedVacancyBriefs[0]?.title ?? deriveHistoryTitle(vacancies),
        };
      });
      setActiveHistoryId(historyId);
      saveHistoryItem(historyItem);
      const continuationMessage = data.continuationAttempts
        ? ` Дозібрано ${data.continuationAttempts} продовження.`
        : '';
      const resolvedLinksMessage = data.resolvedUrlCount
        ? ` Опрацьовано ${data.resolvedUrlCount} Ashby-лінків.`
        : '';
      const separateBriefsMessage = generatedVacancyBriefs.length > 1
        ? ` Створено ${generatedVacancyBriefs.length} окремі брифи.`
        : '';

      setGenerateStatus({
        kind: 'success',
        message: `Бриф готовий за ${formatDurationLabel(durationMs)}.${resolvedLinksMessage}${separateBriefsMessage}${continuationMessage}`,
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
    const requestVacancyBriefs = vacancyBriefs.length
      ? vacancyBriefs
      : [
          {
            brief,
            id: 'vacancy-1',
            title: notionForm.name.trim() || deriveHistoryTitle(vacancies),
          },
        ];

    setNotionStatus({ kind: 'loading', message: 'Створюємо задачу...' });

    try {
      const response = await fetch('/api/notion/create-task', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...notionForm,
          brief,
          vacancyBriefs: requestVacancyBriefs,
        }),
      });

      const data = (await response.json()) as CreateNotionTaskResponse;

      if (!response.ok) {
        throw new Error(data.error ?? 'Не вдалося створити задачу в Notion.');
      }

      const durationMs = Math.round(performance.now() - requestStartedAt);
      const taskUrl = data.url ?? data.fallbackUrl ?? '';
      const taskLinks = data.tasks ?? (
        data.id && taskUrl
          ? [
              {
                fallbackUrl: data.fallbackUrl,
                id: data.id,
                kind: 'single' as const,
                name: notionForm.name.trim(),
                url: taskUrl,
              },
            ]
          : []
      );

      console.info('[Brief Generator] create-notion-task duration', {
        durationMs,
        serverDurationMs: data.durationMs ?? null,
        taskId: data.id ?? null,
        taskCount: taskLinks.length,
      });

      setNotionUrl(taskUrl);
      setNotionTaskLinks(taskLinks);
      const briefLocationMessage = data.warning
        ? ` ${data.warning}`
        : data.childTaskCount
          ? ` Створено parent-задачу і ${data.childTaskCount} child-задачі з окремими брифами.`
          : data.descriptionTooLong
          ? ' Description містить коротку примітку, повний бриф додано в тіло задачі.'
          : data.appendedBriefBlockCount
            ? ' Повний бриф додано в тіло задачі.'
            : '';

      setNotionStatus({
        kind: 'success',
        message: `Задачу створено за ${formatDurationLabel(durationMs)}.${briefLocationMessage}`,
      });

      if (activeHistoryId) {
        updateHistoryItem(activeHistoryId, {
          title: notionForm.name.trim() || deriveHistoryTitle(vacancies),
          brief,
          vacancyBriefs: requestVacancyBriefs,
          notionForm,
          taskUrl,
          taskFallbackUrl: data.fallbackUrl,
          taskId: data.id,
          taskUrls: taskLinks,
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
    const nextVacancyBriefs = vacancyBriefs.length === 1
      ? [
          {
            ...vacancyBriefs[0],
            brief: value,
          },
        ]
      : vacancyBriefs;

    setBrief(value);
    setVacancyBriefs(nextVacancyBriefs);

    if (activeHistoryId) {
      updateHistoryItem(activeHistoryId, {
        brief: value,
        vacancyBriefs: nextVacancyBriefs,
      });
    }
  }

  function handleVacancyBriefChange(id: string, value: string) {
    const nextVacancyBriefs = vacancyBriefs.map((vacancyBrief) =>
      vacancyBrief.id === id
        ? {
            ...vacancyBrief,
            brief: value,
          }
        : vacancyBrief,
    );
    const nextBrief = combineVacancyBriefs(nextVacancyBriefs);

    setVacancyBriefs(nextVacancyBriefs);
    setBrief(nextBrief);

    if (activeHistoryId) {
      updateHistoryItem(activeHistoryId, {
        brief: nextBrief,
        vacancyBriefs: nextVacancyBriefs,
      });
    }
  }

  function handleCreateNewTask() {
    setStep(1);
    setVacancies('');
    setBrief('');
    setVacancyBriefs([]);
    setGenerateStatus(initialStatus);
    setNotionStatus(initialStatus);
    setNotionForm(initialNotionForm);
    setNotionUrl('');
    setNotionTaskLinks([]);
    setActiveHistoryId(historyItems[0]?.id ?? '');
  }

  function openTool(tool: ActiveTool) {
    router.push(toolPaths[tool]);
  }

  function openBriefGenerator() {
    setStep(1);
    openTool('brief');
  }

  function updateNotionForm(patch: Partial<NotionTaskForm>) {
    setNotionUrl('');
    setNotionTaskLinks([]);
    setNotionStatus(initialStatus);
    setNotionForm((current) => ({ ...current, ...patch }));
  }

  if (activeTool === 'articles') {
    return <ArticlesView onBackToHub={() => openTool('hub')} />;
  }

  return (
    <main className="min-h-screen bg-[#eceef1] px-4 py-5 font-[Onest,system-ui,sans-serif] text-[#181b22] sm:px-6">
      <div className="mx-auto flex w-full max-w-[1180px] flex-col gap-5">
        <header className="flex min-h-[60px] items-center justify-between gap-4 rounded-[16px] border border-[#e7e9ee] bg-white px-4 py-3 shadow-[0_10px_30px_rgba(16,24,40,.05)] sm:px-5">
          <div className="flex min-w-0 items-center gap-[13px]">
            <span className="flex h-[30px] w-[30px] flex-none items-center justify-center rounded-lg bg-[#1d4ed8] text-[15px] font-extrabold text-white">
              U
            </span>
            <div className="flex min-w-0 flex-col sm:flex-row sm:items-baseline sm:gap-2">
              <span className="text-[15px] font-bold text-[#181b22]">Universe</span>
              <span className="hidden text-[#c2c8d0] sm:inline">/</span>
              <span className="truncate text-[15px] font-semibold text-[#5b6472]">{appTitle}</span>
            </div>
          </div>
          <span className="hidden h-[34px] items-center rounded-[9px] border border-[#e7e9ee] bg-[#fafbfc] px-3 text-[13px] font-semibold text-[#5b6472] sm:inline-flex">
            PR Comms tools
          </span>
        </header>

        {activeTool === 'hub' ? (
          <ToolHub
            onOpenArticles={() => openTool('articles')}
            onOpenBrief={openBriefGenerator}
            onOpenMerchIdeas={() => openTool('merch')}
            onOpenSmm={() => openTool('smm')}
          />
        ) : null}

        {activeTool === 'brief' ? (
          <>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <button
                className="inline-flex h-10 items-center gap-2 rounded-[9px] border border-[#e7e9ee] bg-white px-4 text-sm font-semibold text-[#2a3038] transition hover:bg-[#f5f6f8] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1d4ed8] focus-visible:ring-offset-2"
                onClick={() => openTool('hub')}
                type="button"
              >
                <Layers3 className="h-4 w-4 text-[#1d4ed8]" aria-hidden="true" />
                До пулу тулів
              </button>
            </div>

            <Stepper currentStep={step} />

            {step === 1 ? (
              <Step1Vacancies
                status={generateStatus}
                systemPrompt={systemPrompt}
                vacancies={vacancies}
                onGenerate={handleGenerateBrief}
                onVacanciesChange={setVacancies}
              />
            ) : null}

            {step === 2 ? (
              <Step2Brief
                brief={brief}
                vacancyBriefs={vacancyBriefs}
                onBack={() => setStep(1)}
                onBriefChange={handleBriefChange}
                onVacancyBriefChange={handleVacancyBriefChange}
                onNext={() => setStep(3)}
              />
            ) : null}

            {step === 3 ? (
              <Step3Notion
                form={notionForm}
                notionUrl={notionUrl}
                notionTaskLinks={notionTaskLinks}
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
              onSelect={setActiveHistoryId}
            />
          </>
        ) : null}

        {activeTool === 'smm' ? (
          <SmmGenerator onBackToHub={() => openTool('hub')} />
        ) : null}

        {activeTool === 'merch' ? (
          <MerchIdeasGenerator onBackToHub={() => openTool('hub')} />
        ) : null}

      </div>
    </main>
  );
}

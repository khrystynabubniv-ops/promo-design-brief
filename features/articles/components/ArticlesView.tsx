'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  FileText,
  History,
  Loader2,
  Pencil,
  Plus,
  RefreshCw,
  Save,
  Search,
  Trash2,
  UserPlus,
  WandSparkles,
  X,
} from 'lucide-react';
import { getForbiddenForBrief } from '../lib/forbidden';
import { lint, type LintMatch } from '../lib/lint';
import {
  canUseSpeakerForGeneration,
  createSpeakerCard,
  listSpeakerCards,
  updateSpeakerCard,
} from '../lib/speakers';
import type { ActionStatus, GenerationHistoryItem } from '@/lib/types';
import type { Brief, Draft, DraftVersion, Format, SpeakerCard, StoredSpeakerCard } from '../types';

const DRAFT_HISTORY_LIMIT = 20;
const DRAFT_HISTORY_STORAGE_KEY = 'articles_draft_history';
const DRAFT_STORAGE_KEY = 'articles_current_draft';

type ArticlesViewProps = {
  onBackToHub: () => void;
};

type GenerateArticleResponse = {
  durationMs?: number;
  error?: string;
  historyItem?: GenerationHistoryItem | null;
  result?: {
    content: string;
    draft: Draft;
    lint: LintMatch[];
  };
};

type ExtractStyleResponse = {
  card?: SpeakerCard;
  durationMs?: number;
  error?: string;
};

type RegenerateParagraphResponse = {
  durationMs?: number;
  error?: string;
  paragraph?: string;
};

type SaveNotionResponse = {
  durationMs?: number;
  error?: string;
  url?: string;
};

type DraftHistoryItem = {
  draft: Draft;
  id: string;
  savedAt: string;
  title: string;
};

const initialStatus: ActionStatus = { kind: 'idle' };

const formatOptions: Array<{ label: string; value: Format }> = [
  { label: 'Стаття', value: 'article' },
  { label: 'Колонка', value: 'column' },
  { label: 'Опед', value: 'oped' },
  { label: 'Прес-реліз', value: 'press_release' },
  { label: 'Коментар', value: 'comment' },
];

const lengthOptions: Array<{ label: string; value: NonNullable<Brief['lengthHint']> }> = [
  { label: 'Коротко', value: 'short' },
  { label: 'Стандарт', value: 'standard' },
  { label: 'Лонгрід', value: 'longread' },
];

function getFormatLabel(format: Format) {
  return formatOptions.find((option) => option.value === format)?.label ?? format;
}

function getSpeakerInitials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);

  if (!parts.length) {
    return 'UG';
  }

  return parts
    .slice(0, 2)
    .map((part) => part[0]?.toLocaleUpperCase('uk-UA') ?? '')
    .join('');
}

function getSpeakerGradient(index: number) {
  const gradients = [
    'from-blue-500 to-blue-700',
    'from-emerald-400 to-emerald-600',
    'from-pink-400 to-pink-600',
    'from-violet-400 to-indigo-600',
    'from-amber-400 to-orange-600',
  ];

  return gradients[index % gradients.length];
}

function createInitialBrief(): Brief {
  return {
    format: 'press_release',
    variant: 'full',
    speakerId: null,
    topic: '',
    thesis: [''],
    mustIncludeFacts: [
      {
        id: createId(),
        label: '',
        value: '',
      },
    ],
    quotes: [],
    targetMedia: '',
    lengthHint: 'standard',
    links: [''],
  };
}

function createId() {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }

  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

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

function isAuthorFormat(format: Format) {
  return format === 'article' || format === 'column' || format === 'oped' || format === 'comment';
}

function formatDuration(value?: number) {
  if (!value) {
    return '';
  }

  return value < 1000 ? `${Math.round(value)} ms` : `${(value / 1000).toFixed(1)} s`;
}

function buildBriefPayload(brief: Brief): Brief {
  return {
    ...brief,
    speakerId: isAuthorFormat(brief.format) ? brief.speakerId ?? null : null,
    thesis: brief.thesis.map((item) => item.trim()).filter(Boolean),
    mustIncludeFacts: brief.mustIncludeFacts
      .map((fact) => ({
        ...fact,
        label: fact.label.trim(),
        value: fact.value.trim(),
      }))
      .filter((fact) => fact.label && fact.value),
    quotes: brief.format === 'press_release'
      ? (brief.quotes ?? [])
        .map((quote) => ({
          ...quote,
          intent: quote.intent.trim(),
        }))
        .filter((quote) => quote.speakerId && quote.intent)
      : [],
    targetMedia: brief.targetMedia?.trim() ?? '',
    topic: brief.topic.trim(),
    links: (brief.links ?? []).map((link) => link.trim()).filter(Boolean),
    variant: brief.format === 'press_release' ? brief.variant ?? 'full' : undefined,
  };
}

function getActiveVersion(draft: Draft | null) {
  return draft?.versions.find((version) => version.id === draft.activeVersionId) ?? draft?.versions[0] ?? null;
}

function replaceParagraph(content: string, paragraphIndex: number, nextParagraph: string) {
  const paragraphs = content.split(/\n{2,}/);
  paragraphs[paragraphIndex] = nextParagraph.trim();

  return paragraphs.join('\n\n');
}

function getForbiddenForDraft(draft: Draft | null, speakers: SpeakerCard[]) {
  if (!draft) {
    return [];
  }

  const speaker = speakers.find((card) => card.id === draft.brief.speakerId);

  return getForbiddenForBrief(draft.brief, speaker);
}

function parseStoredDraft(value: string | null) {
  if (!value) {
    return null;
  }

  try {
    const parsed: unknown = JSON.parse(value);

    if (
      parsed &&
      typeof parsed === 'object' &&
      typeof (parsed as Partial<Draft>).id === 'string' &&
      Array.isArray((parsed as Partial<Draft>).versions)
    ) {
      return parsed as Draft;
    }
  } catch {
    return null;
  }

  return null;
}

function parseStoredDraftHistory(value: string | null) {
  if (!value) {
    return [];
  }

  try {
    const parsed: unknown = JSON.parse(value);

    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed
      .filter((item): item is DraftHistoryItem => Boolean(
        item &&
        typeof item === 'object' &&
        typeof (item as Partial<DraftHistoryItem>).id === 'string' &&
        typeof (item as Partial<DraftHistoryItem>).savedAt === 'string' &&
        typeof (item as Partial<DraftHistoryItem>).title === 'string' &&
        (item as Partial<DraftHistoryItem>).draft &&
        typeof (item as Partial<DraftHistoryItem>).draft === 'object' &&
        Array.isArray((item as Partial<DraftHistoryItem>).draft?.versions),
      ))
      .sort((left, right) => new Date(right.savedAt).getTime() - new Date(left.savedAt).getTime())
      .slice(0, DRAFT_HISTORY_LIMIT);
  } catch {
    return [];
  }
}

function getDraftTitle(draft: Draft) {
  return draft.brief.topic.trim() || getFormatLabel(draft.brief.format);
}

function getDraftPreview(draft: Draft) {
  const activeVersion = getActiveVersion(draft);

  return activeVersion?.content.replace(/\s+/g, ' ').trim().slice(0, 110) || 'Без тексту';
}

function draftHasContent(draft: Draft | null) {
  return Boolean(getActiveVersion(draft)?.content.trim());
}

function createDraftHistoryItem(draft: Draft, savedAt = new Date().toISOString()): DraftHistoryItem {
  return {
    draft,
    id: draft.id,
    savedAt,
    title: getDraftTitle(draft),
  };
}

function archiveDraft(draft: Draft | null, history: DraftHistoryItem[]) {
  if (!draft || !draftHasContent(draft)) {
    return history;
  }

  const item = createDraftHistoryItem(draft);

  return [
    item,
    ...history.filter((historyItem) => historyItem.id !== draft.id),
  ].slice(0, DRAFT_HISTORY_LIMIT);
}

function writeStoredDraftHistory(history: DraftHistoryItem[]) {
  if (typeof window === 'undefined') {
    return;
  }

  window.localStorage.setItem(DRAFT_HISTORY_STORAGE_KEY, JSON.stringify(history));
}

export function ArticlesView({ onBackToHub }: ArticlesViewProps) {
  const [brief, setBrief] = useState<Brief>(() => createInitialBrief());
  const [draft, setDraft] = useState<Draft | null>(null);
  const [draftHistory, setDraftHistory] = useState<DraftHistoryItem[]>([]);
  const [speakers, setSpeakers] = useState<StoredSpeakerCard[]>([]);
  const [status, setStatus] = useState<ActionStatus>(initialStatus);
  const [exportStatus, setExportStatus] = useState<ActionStatus>(initialStatus);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [speakerModalMode, setSpeakerModalMode] = useState<'create' | 'edit' | null>(null);
  const [editingSpeaker, setEditingSpeaker] = useState<StoredSpeakerCard | null>(null);
  const [regeneratingParagraph, setRegeneratingParagraph] = useState<number | null>(null);

  const activeVersion = getActiveVersion(draft);
  const lintMatches = useMemo(
    () => activeVersion ? lint(activeVersion.content, getForbiddenForDraft(draft, speakers)) : [],
    [activeVersion, draft, speakers],
  );
  const selectedSpeaker = speakers.find((speaker) => speaker.id === brief.speakerId) ?? null;
  const canGenerate = Boolean(brief.topic.trim()) && status.kind !== 'loading';
  const visibleHistoryCount = draftHistory.length + (
    draftHasContent(draft) && !draftHistory.some((item) => item.id === draft?.id) ? 1 : 0
  );

  useEffect(() => {
    setSpeakers(listSpeakerCards());
    setDraft(parseStoredDraft(window.localStorage.getItem(DRAFT_STORAGE_KEY)));
    setDraftHistory(parseStoredDraftHistory(window.localStorage.getItem(DRAFT_HISTORY_STORAGE_KEY)));
  }, []);

  useEffect(() => {
    if (draft) {
      window.localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(draft));
    } else {
      window.localStorage.removeItem(DRAFT_STORAGE_KEY);
    }
  }, [draft]);

  function persistDraftHistory(nextHistory: DraftHistoryItem[]) {
    setDraftHistory(nextHistory);
    writeStoredDraftHistory(nextHistory);
  }

  function archiveCurrentDraft(nextDraft = draft) {
    const nextHistory = archiveDraft(nextDraft, draftHistory);

    if (nextHistory !== draftHistory) {
      persistDraftHistory(nextHistory);
    }
  }

  function clearWorkspace() {
    archiveCurrentDraft();
    setBrief(createInitialBrief());
    setDraft(null);
    setExportStatus(initialStatus);
    setRegeneratingParagraph(null);
    setStatus(initialStatus);
    window.localStorage.removeItem(DRAFT_STORAGE_KEY);
  }

  function handleBackToHub() {
    clearWorkspace();
    onBackToHub();
  }

  function restoreDraftFromHistory(item: DraftHistoryItem) {
    if (draft?.id !== item.id) {
      archiveCurrentDraft();
    }

    setBrief(item.draft.brief);
    setDraft(item.draft);
    setExportStatus(initialStatus);
    setHistoryOpen(false);
    setRegeneratingParagraph(null);
    setStatus({ kind: 'success', message: 'Чернетку відновлено з історії.' });
  }

  function removeDraftFromHistory(id: string) {
    persistDraftHistory(draftHistory.filter((item) => item.id !== id));
  }

  function reloadSpeakers() {
    setSpeakers(listSpeakerCards());
  }

  function updateBrief(patch: Partial<Brief>) {
    setBrief((current) => ({ ...current, ...patch }));
    setStatus(initialStatus);
  }

  function updateFormat(format: Format) {
    setBrief((current) => ({
      ...current,
      format,
      speakerId: isAuthorFormat(format) ? current.speakerId : null,
      variant: format === 'press_release' ? current.variant ?? 'full' : undefined,
      quotes: format === 'press_release' ? current.quotes ?? [] : [],
    }));
    setStatus(initialStatus);
  }

  function openCreateSpeakerModal() {
    setEditingSpeaker(null);
    setSpeakerModalMode('create');
  }

  function openEditSpeakerModal(speaker: StoredSpeakerCard) {
    setEditingSpeaker(speaker);
    setSpeakerModalMode('edit');
  }

  function handleSpeakerSaved(card: SpeakerCard) {
    let savedCard: StoredSpeakerCard | null;

    if (speakerModalMode === 'edit' && editingSpeaker) {
      savedCard = updateSpeakerCard(editingSpeaker.id, card);
    } else {
      savedCard = createSpeakerCard(card);
    }

    reloadSpeakers();
    setBrief((current) => ({ ...current, speakerId: savedCard?.id ?? card.id }));
    setSpeakerModalMode(null);
    setEditingSpeaker(null);
  }

  async function handleGenerate() {
    const payload = buildBriefPayload(brief);
    const speaker = speakers.find((card) => card.id === payload.speakerId);

    if (!payload.topic) {
      setStatus({ kind: 'error', message: 'Додайте тему.' });
      return;
    }

    if (isAuthorFormat(payload.format) && (!speaker || !canUseSpeakerForGeneration(speaker))) {
      setStatus({
        kind: 'error',
        message: 'Для авторського формату потрібна картка спікера з name, role, addressForm, sentenceStyle і tone.',
      });
      return;
    }

    setBrief(payload);
    setStatus({ kind: 'loading', message: 'Генеруємо чернетку...' });

    try {
      const response = await fetch('/api/articles/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          brief: payload,
          speakers,
        }),
      });
      const data = await readApiJson<GenerateArticleResponse>(response);

      if (!response.ok || !data.result) {
        throw new Error(data.error ?? `Не вдалося згенерувати текст. Сервер повернув ${response.status}.`);
      }

      archiveCurrentDraft();
      setDraft(data.result.draft);
      setStatus({
        kind: 'success',
        message: `Чернетка готова${data.durationMs ? ` за ${formatDuration(data.durationMs)}` : ''}.`,
      });
    } catch (error) {
      setStatus({
        kind: 'error',
        message: error instanceof Error ? error.message : 'Сталася помилка генерації.',
      });
    }
  }

  function updateActiveVersion(updater: (version: DraftVersion) => DraftVersion) {
    setDraft((current) => {
      if (!current) {
        return current;
      }

      return {
        ...current,
        versions: current.versions.map((version) =>
          version.id === current.activeVersionId ? updater(version) : version,
        ),
      };
    });
  }

  function handleParagraphEdit(paragraphIndex: number, value: string) {
    if (!activeVersion || value.trim() === activeVersion.content.split(/\n{2,}/)[paragraphIndex]?.trim()) {
      return;
    }

    updateActiveVersion((version) => ({
      ...version,
      content: replaceParagraph(version.content, paragraphIndex, value),
      manualEdits: version.manualEdits + 1,
    }));
  }

  async function handleRegenerateParagraph(paragraphIndex: number, paragraph: string) {
    if (!draft || !activeVersion) {
      return;
    }

    setRegeneratingParagraph(paragraphIndex);

    try {
      const response = await fetch('/api/articles/regenerate-paragraph', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          brief: draft.brief,
          content: activeVersion.content,
          paragraph,
          paragraphIndex,
          speakers,
        }),
      });
      const data = await readApiJson<RegenerateParagraphResponse>(response);

      if (!response.ok || !data.paragraph) {
        throw new Error(data.error ?? 'Не вдалося перегенерувати абзац.');
      }

      const nextContent = replaceParagraph(activeVersion.content, paragraphIndex, data.paragraph);
      const nextVersion: DraftVersion = {
        id: createId(),
        createdAt: new Date().toISOString(),
        content: nextContent,
        manualEdits: 0,
      };

      setDraft((current) => current
        ? {
            ...current,
            activeVersionId: nextVersion.id,
            versions: [...current.versions, nextVersion],
          }
        : current);
    } catch (error) {
      setStatus({
        kind: 'error',
        message: error instanceof Error ? error.message : 'Не вдалося перегенерувати абзац.',
      });
    } finally {
      setRegeneratingParagraph(null);
    }
  }

  async function handleSaveNotion() {
    if (!activeVersion) {
      setExportStatus({ kind: 'error', message: 'Спершу згенеруйте чернетку.' });
      return;
    }

    const versionNumber = draft
      ? draft.versions.findIndex((version) => version.id === draft.activeVersionId) + 1
      : 0;

    setExportStatus({ kind: 'loading', message: 'Зберігаємо в Notion...' });

    try {
      const response = await fetch('/api/articles/save-notion', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          brief: draft?.brief,
          content: activeVersion.content,
          manualEdits: activeVersion.manualEdits,
          versionLabel: versionNumber ? `v${versionNumber}` : '',
        }),
      });
      const data = await readApiJson<SaveNotionResponse>(response);

      if (!response.ok || !data.url) {
        throw new Error(data.error ?? 'Не вдалося зберегти в Notion.');
      }

      setExportStatus({ kind: 'success', message: 'Збережено в Notion.' });
      window.open(data.url, '_blank', 'noopener,noreferrer');
    } catch (error) {
      setExportStatus({
        kind: 'error',
        message: error instanceof Error ? error.message : 'Не вдалося зберегти в Notion.',
      });
    }
  }

  return (
    <div className="flex min-h-screen flex-col bg-[#eceef1] font-[Onest,system-ui,sans-serif] text-[#181b22]">
      <header className="flex h-[60px] flex-none items-center justify-between border-b border-[#e7e9ee] bg-white px-[22px]">
        <div className="flex min-w-0 items-center gap-[13px]">
          <button
            className="flex h-[30px] w-[30px] flex-none items-center justify-center rounded-lg bg-[#1d4ed8] text-[15px] font-extrabold tracking-[-0.02em] text-white transition hover:bg-[#1a44bd] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1d4ed8] focus-visible:ring-offset-2"
            onClick={handleBackToHub}
            title="До пулу тулів"
            type="button"
          >
            U
          </button>
          <div className="flex min-w-0 items-baseline gap-2">
            <span className="text-[15px] font-bold tracking-[-0.01em] text-[#181b22]">Comms Tool</span>
            <span className="text-[#c2c8d0]">/</span>
            <span className="truncate text-[15px] font-semibold text-[#5b6472]">Тексти</span>
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            className="inline-flex h-[34px] items-center gap-2 rounded-[9px] border border-[#e7e9ee] bg-white px-3.5 text-[13px] font-semibold text-[#2a3038] transition hover:bg-[#f5f6f8] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1d4ed8] focus-visible:ring-offset-2"
            onClick={() => setHistoryOpen(true)}
            type="button"
          >
            <History className="h-3.5 w-3.5 text-[#8b94a3]" aria-hidden="true" />
            Історія
            {visibleHistoryCount ? (
              <span className="ml-0.5 rounded-md bg-[#eef3ff] px-1.5 py-0.5 text-[11px] font-bold text-[#1d4ed8]">
                {visibleHistoryCount}
              </span>
            ) : null}
          </button>
          <div className="hidden h-[34px] items-center gap-2 rounded-[9px] border border-[#e7e9ee] bg-[#fafbfc] px-3 sm:flex">
            <span className="text-[13px] font-semibold text-[#1d4ed8]">
              {draft ? `v${draft.versions.findIndex((version) => version.id === draft.activeVersionId) + 1}` : 'v0'}
            </span>
            <span className="h-3.5 w-px bg-[#e0e3e8]" />
            <RefreshCw className="h-[13px] w-[13px] text-[#8b94a3]" aria-hidden="true" />
            <span className="text-[13px] font-medium text-[#5b6472]">
              {activeVersion ? `${activeVersion.manualEdits} правок` : '0 правок'}
            </span>
          </div>
          <button
            className="inline-flex h-[34px] items-center gap-2 rounded-[9px] border border-[#e7e9ee] bg-white px-3.5 text-[13px] font-semibold text-[#2a3038] transition hover:bg-[#f5f6f8] disabled:cursor-not-allowed disabled:text-[#9aa1ad] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1d4ed8] focus-visible:ring-offset-2"
            disabled={!activeVersion || exportStatus.kind === 'loading'}
            onClick={handleSaveNotion}
            type="button"
          >
            {exportStatus.kind === 'loading' ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin text-[#1d4ed8]" aria-hidden="true" />
            ) : (
              <Save className="h-3.5 w-3.5 text-[#1d4ed8]" aria-hidden="true" />
            )}
            Зберегти у Notion
          </button>
        </div>
      </header>

      {exportStatus.message ? (
        <div className="border-b border-[#e7e9ee] bg-white px-[22px] py-2">
          <StatusPill status={exportStatus} />
        </div>
      ) : null}

      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        <aside className="ct-scroll w-full flex-none overflow-y-auto border-r border-[#e7e9ee] bg-white px-[26px] py-6 pb-10 lg:min-h-0 lg:w-[40%] lg:min-w-[420px] lg:max-w-[560px]">
          <BriefForm
            brief={brief}
            canGenerate={canGenerate}
            selectedSpeaker={selectedSpeaker}
            speakers={speakers}
            status={status}
            onAddSpeaker={openCreateSpeakerModal}
            onEditSpeaker={openEditSpeakerModal}
            onGenerate={handleGenerate}
            onReset={clearWorkspace}
            onUpdateBrief={updateBrief}
            onUpdateFormat={updateFormat}
          />
        </aside>

        <DraftEditor
          activeVersion={activeVersion}
          draft={draft}
          lintMatches={lintMatches}
          regeneratingParagraph={regeneratingParagraph}
          selectedSpeaker={selectedSpeaker}
          status={status}
          onParagraphEdit={handleParagraphEdit}
          onRegenerateParagraph={handleRegenerateParagraph}
          onSelectVersion={(versionId) => {
            setDraft((current) => current ? { ...current, activeVersionId: versionId } : current);
          }}
        />
      </div>

      {speakerModalMode ? (
        <AddSpeakerModal
          initialCard={editingSpeaker}
          mode={speakerModalMode}
          onClose={() => {
            setSpeakerModalMode(null);
            setEditingSpeaker(null);
          }}
          onSave={handleSpeakerSaved}
        />
      ) : null}

      {historyOpen ? (
        <DraftHistoryDrawer
          activeDraftId={draft?.id ?? null}
          currentDraft={draft}
          history={draftHistory}
          speakers={speakers}
          onClose={() => setHistoryOpen(false)}
          onRemove={removeDraftFromHistory}
          onRestore={restoreDraftFromHistory}
        />
      ) : null}
    </div>
  );
}

type BriefFormProps = {
  brief: Brief;
  canGenerate: boolean;
  selectedSpeaker: StoredSpeakerCard | null;
  speakers: StoredSpeakerCard[];
  status: ActionStatus;
  onAddSpeaker: () => void;
  onEditSpeaker: (speaker: StoredSpeakerCard) => void;
  onGenerate: () => void;
  onReset: () => void;
  onUpdateBrief: (patch: Partial<Brief>) => void;
  onUpdateFormat: (format: Format) => void;
};

type DraftHistoryDrawerProps = {
  activeDraftId: string | null;
  currentDraft: Draft | null;
  history: DraftHistoryItem[];
  speakers: StoredSpeakerCard[];
  onClose: () => void;
  onRemove: (id: string) => void;
  onRestore: (item: DraftHistoryItem) => void;
};

function formatHistoryDate(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return '';
  }

  return new Intl.DateTimeFormat('uk-UA', {
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    month: 'short',
  }).format(date);
}

function getHistoryGroupLabel(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return 'Раніше';
  }

  const today = new Date();
  const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
  const startOfItemDay = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
  const dayMs = 24 * 60 * 60 * 1000;

  if (startOfItemDay === startOfToday) {
    return 'Сьогодні';
  }

  if (startOfItemDay === startOfToday - dayMs) {
    return 'Учора';
  }

  return 'Раніше';
}

function getHistorySpeakerName(item: DraftHistoryItem, speakers: StoredSpeakerCard[]) {
  if (item.draft.brief.format === 'press_release') {
    return 'Інституційний голос';
  }

  const speaker = speakers.find((card) => card.id === item.draft.brief.speakerId);

  return speaker?.name ?? 'Спікер не обраний';
}

function DraftHistoryDrawer({
  activeDraftId,
  currentDraft,
  history,
  speakers,
  onClose,
  onRemove,
  onRestore,
}: DraftHistoryDrawerProps) {
  const [query, setQuery] = useState('');
  const normalizedQuery = query.trim().toLocaleLowerCase('uk-UA');
  const currentHistoryItem = currentDraft && draftHasContent(currentDraft)
    ? createDraftHistoryItem(currentDraft, getActiveVersion(currentDraft)?.createdAt ?? new Date().toISOString())
    : null;
  const visibleHistory = currentHistoryItem
    ? [
        currentHistoryItem,
        ...history.filter((item) => item.id !== currentHistoryItem.id),
      ]
    : history;
  const filteredHistory = visibleHistory.filter((item) => {
    if (!normalizedQuery) {
      return true;
    }

    const searchable = [
      item.title,
      getFormatLabel(item.draft.brief.format),
      getHistorySpeakerName(item, speakers),
      getDraftPreview(item.draft),
    ].join(' ').toLocaleLowerCase('uk-UA');

    return searchable.includes(normalizedQuery);
  });
  const groupedHistory = filteredHistory.reduce<Array<{ group: string; items: DraftHistoryItem[] }>>(
    (groups, item) => {
      const group = getHistoryGroupLabel(item.savedAt);
      const currentGroup = groups.find((candidate) => candidate.group === group);

      if (currentGroup) {
        currentGroup.items.push(item);
      } else {
        groups.push({ group, items: [item] });
      }

      return groups;
    },
    [],
  );

  return (
    <div className="fixed inset-0 z-[90] flex justify-end">
      <button
        aria-label="Закрити історію"
        className="absolute inset-0 bg-[rgba(20,23,29,.38)] backdrop-blur-[2px]"
        onClick={onClose}
        type="button"
      />
      <aside className="ct-scroll relative flex w-[420px] max-w-[90vw] flex-col border-l border-[#e7e9ee] bg-white shadow-[-12px_0_40px_rgba(16,24,40,.16)]">
        <div className="flex-none border-b border-[#eef0f3] px-[22px] pb-4 pt-5">
          <div className="mb-3.5 flex items-center justify-between gap-4">
            <div>
              <h2 className="text-lg font-bold tracking-[-0.01em] text-[#181b22]">Історія матеріалів</h2>
              <p className="mt-0.5 text-[12.5px] text-[#9aa1ad]">
                Відкрий, щоб повернутися й продовжити роботу
              </p>
            </div>
            <button
              className="flex h-8 w-8 flex-none items-center justify-center rounded-[9px] border border-[#eef0f3] bg-white text-[#8b94a3] transition hover:bg-[#f5f6f8] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1d4ed8] focus-visible:ring-offset-2"
              onClick={onClose}
              type="button"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
          <div className="flex h-9 items-center gap-2 rounded-[10px] border border-[#e7e9ee] bg-[#fafbfc] px-3">
            <Search className="h-[15px] w-[15px] flex-none text-[#b8bfc9]" aria-hidden="true" />
            <input
              className="min-w-0 flex-1 border-none bg-transparent text-[13px] text-[#2a3038] outline-none placeholder:text-[#aeb5c0]"
              placeholder="Пошук за темою або спікером"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </div>
        </div>

        <div className="ct-scroll flex-1 overflow-y-auto px-4 py-3.5 pb-[22px]">
          {!visibleHistory.length ? (
            <div className="flex min-h-[260px] flex-col items-center justify-center text-center">
              <FileText className="h-9 w-9 text-[#c8cdd6]" aria-hidden="true" />
              <p className="mt-3 text-sm font-semibold text-[#5b6472]">Історія поки порожня</p>
              <p className="mt-1 max-w-[260px] text-[12.5px] leading-5 text-[#9aa1ad]">
                Після очищення або виходу поточна чернетка збережеться тут.
              </p>
            </div>
          ) : groupedHistory.length ? (
            groupedHistory.map(({ group, items }) => (
              <div key={group}>
                <div className="px-1.5 pb-[9px] pt-3 text-[11px] font-bold uppercase tracking-[0.05em] text-[#b0b7c2]">
                  {group}
                </div>
                {items.map((item) => {
                  const active = activeDraftId === item.id;
                  const activeVersion = getActiveVersion(item.draft);
                  const versionIndex = item.draft.versions.findIndex(
                    (version) => version.id === item.draft.activeVersionId,
                  );
                  const speakerName = getHistorySpeakerName(item, speakers);

                  return (
                    <div
                      className={[
                        'group/history mb-[9px] rounded-[13px] border p-[13px] transition',
                        active
                          ? 'border-[1.5px] border-[#1d4ed8] bg-[#f7f9ff]'
                          : 'border-[#e7e9ee] bg-white hover:border-[#cdd3dc] hover:bg-[#fafbfc]',
                      ].join(' ')}
                      key={item.id}
                    >
                      <button
                        className="block w-full text-left focus-visible:outline-none"
                        onClick={() => onRestore(item)}
                        type="button"
                      >
                        <div className="flex items-center gap-2">
                          <span className={[
                            'rounded-md px-2 py-1 text-[10.5px] font-bold uppercase tracking-[0.03em]',
                            active ? 'bg-[#e7eeff] text-[#1d4ed8]' : 'bg-[#f1f3f6] text-[#5b6472]',
                          ].join(' ')}
                          >
                            {getFormatLabel(item.draft.brief.format)}
                          </span>
                          {active ? (
                            <span className="ml-auto text-[11px] font-semibold text-[#1d4ed8]">
                              відкрито зараз
                            </span>
                          ) : (
                            <span className="ml-auto text-[11px] font-medium text-[#9aa1ad]">
                              {formatHistoryDate(item.savedAt)}
                            </span>
                          )}
                        </div>
                        <div className="mt-[9px] text-sm font-semibold leading-[1.35] text-[#1a1d24]">
                          {item.title}
                        </div>
                        <div className="mt-[9px] flex flex-wrap items-center gap-2 text-xs text-[#7b8392]">
                          <span>{speakerName}</span>
                          <span className="text-[#cdd3dc]">·</span>
                          <span>v{versionIndex >= 0 ? versionIndex + 1 : 1}</span>
                          <span className="text-[#cdd3dc]">·</span>
                          <span>{activeVersion?.manualEdits ?? 0} правок</span>
                        </div>
                        <p className="mt-2 line-clamp-2 text-[12.5px] leading-5 text-[#9aa1ad]">
                          {getDraftPreview(item.draft)}
                        </p>
                      </button>
                      {!active ? (
                        <div className="mt-2 flex justify-end">
                          <button
                            className="inline-flex h-7 items-center gap-1.5 rounded-md px-2 text-[11.5px] font-semibold text-[#b8bfc9] opacity-100 transition hover:bg-red-50 hover:text-red-600 md:opacity-0 md:group-hover/history:opacity-100"
                            onClick={() => onRemove(item.id)}
                            type="button"
                          >
                            <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                            Видалити
                          </button>
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            ))
          ) : (
            <div className="flex min-h-[220px] flex-col items-center justify-center text-center">
              <Search className="h-8 w-8 text-[#c8cdd6]" aria-hidden="true" />
              <p className="mt-3 text-sm font-semibold text-[#5b6472]">Нічого не знайшли</p>
              <p className="mt-1 text-[12.5px] text-[#9aa1ad]">Спробуй інший запит.</p>
            </div>
          )}
        </div>
      </aside>
    </div>
  );
}

function BriefForm({
  brief,
  canGenerate,
  selectedSpeaker,
  speakers,
  status,
  onAddSpeaker,
  onEditSpeaker,
  onGenerate,
  onReset,
  onUpdateBrief,
  onUpdateFormat,
}: BriefFormProps) {
  const authorFormat = isAuthorFormat(brief.format);

  return (
    <section>
      <div className="mb-[18px] flex items-center justify-between">
        <h2 className="text-[13px] font-bold uppercase tracking-[0.04em] text-[#939bab]">Бриф</h2>
        <button
          className="flex items-center gap-1.5 border-none bg-transparent text-[12.5px] font-medium text-[#939bab] transition hover:text-[#5b6472]"
          onClick={onReset}
          type="button"
        >
          <RefreshCw className="h-3 w-3" aria-hidden="true" />
          Очистити
        </button>
      </div>

      <div className="space-y-6">
        <fieldset>
          <legend className="mb-[9px] text-[11.5px] font-semibold uppercase tracking-[0.03em] text-[#939bab]">
            Формат
          </legend>
          <div className="flex gap-[3px] rounded-[11px] bg-[#f1f3f6] p-[3px]">
            {formatOptions.map((option) => {
              const selected = brief.format === option.value;

              return (
                <button
                  aria-pressed={selected}
                  className={[
                    'h-[34px] flex-1 rounded-lg border-none px-2 text-[13px] font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1d4ed8] focus-visible:ring-offset-2',
                    selected
                      ? 'bg-white text-[#1d4ed8] shadow-[0_1px_2px_rgba(16,24,40,.08)]'
                      : 'bg-transparent text-[#5b6472] hover:text-[#1d4ed8]',
                  ].join(' ')}
                  key={option.value}
                  onClick={() => onUpdateFormat(option.value)}
                  type="button"
                >
                  {option.label}
                </button>
              );
            })}
          </div>
        </fieldset>

        {brief.format === 'press_release' ? (
          <fieldset>
            <legend className="mb-2 text-[11.5px] font-semibold uppercase tracking-[0.03em] text-[#939bab]">
              Версія
            </legend>
            <div className="flex gap-[3px] rounded-[10px] bg-[#f1f3f6] p-[3px]">
              {(['full', 'short'] as const).map((variant) => {
                const selected = brief.variant === variant;

                return (
                  <button
                    aria-pressed={selected}
                    className={[
                      'h-[34px] flex-1 rounded-lg border-none px-3 text-[13px] font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1d4ed8] focus-visible:ring-offset-2',
                      selected
                        ? 'bg-white text-[#1d4ed8] shadow-[0_1px_2px_rgba(16,24,40,.08)]'
                        : 'bg-transparent text-[#5b6472] hover:text-[#1d4ed8]',
                    ].join(' ')}
                    key={variant}
                    onClick={() => onUpdateBrief({ variant })}
                    type="button"
                  >
                    {variant === 'full' ? 'Розширена' : 'Скорочена'}
                  </button>
                );
              })}
            </div>
            <p className="mt-2 text-xs leading-5 text-[#9aa1ad]">
              Розширена містить контекст, цитати та довідку. Скорочена — лід і ключові факти.
            </p>
            <div className="mt-4 flex items-start gap-2 rounded-[11px] border border-[#e2e9fb] bg-[#f7f9ff] px-[13px] py-[11px]">
              <AlertTriangle className="mt-0.5 h-4 w-4 flex-none text-[#1d4ed8]" aria-hidden="true" />
              <p className="text-[12.5px] leading-5 text-[#3a5bbf]">
                Нейтральний інституційний голос компанії. Голос конкретного спікера не застосовується.
              </p>
            </div>
          </fieldset>
        ) : null}

        {authorFormat ? (
          <div>
            <label className="mb-2.5 block text-[11.5px] font-semibold uppercase tracking-[0.03em] text-[#939bab]">
              Спікер
            </label>
            <div className="flex flex-col gap-2">
              {speakers.map((speaker, index) => {
                const selected = brief.speakerId === speaker.id;

                return (
                  <button
                    className={[
                      'flex items-center gap-3 rounded-xl border px-[13px] py-[11px] text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1d4ed8] focus-visible:ring-offset-2',
                      selected
                        ? 'border-[1.5px] border-[#1d4ed8] bg-[#f7f9ff]'
                        : 'border-[#e7e9ee] bg-white hover:border-[#d6dae0] hover:bg-[#fafbfc]',
                    ].join(' ')}
                    key={speaker.id}
                    onClick={() => onUpdateBrief({ speakerId: speaker.id })}
                    type="button"
                  >
                    <span className={`flex h-[38px] w-[38px] flex-none items-center justify-center rounded-full bg-gradient-to-br ${getSpeakerGradient(index)} text-sm font-bold text-white`}>
                      {getSpeakerInitials(speaker.name)}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold leading-tight text-[#181b22]">
                        {speaker.name}
                      </span>
                      <span className="mt-0.5 block truncate text-[12.5px] text-[#7b8392]">
                        {speaker.role}
                      </span>
                    </span>
                    <span className="flex flex-none items-center gap-2">
                      <span className={[
                        'rounded-md px-2 py-1 text-[11px] font-semibold',
                        selected ? 'bg-[#e7eeff] text-[#1d4ed8]' : 'bg-[#f1f3f6] text-[#5b6472]',
                      ].join(' ')}
                      >
                        {speaker.archetype || (speaker.source === 'seed' ? 'Seed' : 'User')}
                      </span>
                      {selected ? (
                        <span className="h-[17px] w-[17px] rounded-full bg-[#1d4ed8]" aria-hidden="true" />
                      ) : null}
                    </span>
                  </button>
                );
              })}
              <button
                className="flex items-center justify-center gap-2 rounded-xl border-[1.5px] border-dashed border-[#cdd3dc] bg-white px-3 py-[11px] text-[13.5px] font-semibold text-[#1d4ed8] transition hover:border-[#9db4f5] hover:bg-[#f7f9ff] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1d4ed8] focus-visible:ring-offset-2"
                onClick={onAddSpeaker}
                type="button"
              >
                <Plus className="h-[15px] w-[15px]" aria-hidden="true" />
                Додати спікера
              </button>
            </div>
            {selectedSpeaker?.lowConfidence ? (
              <p className="mt-2 inline-flex items-center gap-2 rounded-md bg-[#fdf3e2] px-3 py-2 text-xs font-semibold text-[#9a6a12] ring-1 ring-[#f3dcb4]">
                <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />
                low confidence: генерація піде через fallback.
              </p>
            ) : null}
            {selectedSpeaker ? (
              <button
                className="mt-2 inline-flex items-center gap-1.5 border-none bg-transparent p-0 text-[13px] font-semibold text-[#1d4ed8] transition hover:opacity-70"
                onClick={() => onEditSpeaker(selectedSpeaker)}
                type="button"
              >
                <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
                Редагувати картку
              </button>
            ) : null}
          </div>
        ) : null}

        <TextField
          id="articleTopic"
          label="Тема *"
          placeholder="Про що пишемо"
          value={brief.topic}
          onChange={(topic) => onUpdateBrief({ topic })}
        />

        <TextField
          id="articleTargetMedia"
          label="Цільове медіа"
          placeholder="AIN, Forbes, dev.ua..."
          value={brief.targetMedia ?? ''}
          onChange={(targetMedia) => onUpdateBrief({ targetMedia })}
        />

        <div>
          <label className="mb-2 block text-[11.5px] font-semibold uppercase tracking-[0.03em] text-[#939bab]" htmlFor="articleLength">
            Довжина
          </label>
          <div className="flex gap-[3px] rounded-[10px] bg-[#f1f3f6] p-[3px]">
            {lengthOptions.map((option) => {
              const selected = (brief.lengthHint ?? 'standard') === option.value;

              return (
                <button
                  aria-pressed={selected}
                  className={[
                    'h-8 flex-1 rounded-[7px] border-none px-2 text-[12.5px] font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1d4ed8] focus-visible:ring-offset-2',
                    selected
                      ? 'bg-white text-[#1d4ed8] shadow-[0_1px_2px_rgba(16,24,40,.08)]'
                      : 'bg-transparent text-[#5b6472] hover:text-[#1d4ed8]',
                  ].join(' ')}
                  key={option.value}
                  onClick={() => onUpdateBrief({ lengthHint: option.value })}
                  type="button"
                >
                  {option.label}
                </button>
              );
            })}
          </div>
        </div>

        <RepeatableTextRows
          label="Тези"
          placeholder="Одна теза"
          rows={brief.thesis}
          onChange={(thesis) => onUpdateBrief({ thesis })}
        />

        <FactRows
          rows={brief.mustIncludeFacts}
          onChange={(mustIncludeFacts) => onUpdateBrief({ mustIncludeFacts })}
        />

        {brief.format === 'press_release' ? (
          <QuoteRows
            quotes={brief.quotes ?? []}
            speakers={speakers}
            onAddSpeaker={onAddSpeaker}
            onChange={(quotes) => onUpdateBrief({ quotes })}
          />
        ) : null}

        <RepeatableTextRows
          label="Посилання"
          placeholder="https://..."
          rows={brief.links ?? []}
          onChange={(links) => onUpdateBrief({ links })}
        />

        <div className="space-y-3 border-t border-[#eef0f3] pt-5">
          <button
            className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#1d4ed8] px-5 text-[14.5px] font-bold text-white shadow-[0_2px_10px_rgba(29,78,216,.25)] transition hover:bg-[#1a44bd] disabled:cursor-not-allowed disabled:bg-[#d6dae0] disabled:text-[#8b94a3] disabled:shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1d4ed8] focus-visible:ring-offset-2"
            disabled={!canGenerate}
            onClick={onGenerate}
            type="button"
          >
            {status.kind === 'loading' ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            ) : (
              <WandSparkles className="h-4 w-4" aria-hidden="true" />
            )}
            Згенерувати чернетку
          </button>
          {status.message ? <StatusPill status={status} /> : null}
        </div>
      </div>
    </section>
  );
}

function TextField({
  id,
  label,
  onChange,
  placeholder,
  value,
}: {
  id: string;
  label: string;
  onChange: (value: string) => void;
  placeholder: string;
  value: string;
}) {
  return (
    <div>
      <label className="mb-2 block text-[11.5px] font-semibold uppercase tracking-[0.03em] text-[#939bab]" htmlFor={id}>
        {label}
      </label>
      <input
        className="h-[44px] w-full rounded-[10px] border border-[#e3e6ec] bg-white px-[13px] text-sm font-medium text-[#181b22] outline-none transition placeholder:text-[#aeb5c0] focus:border-[#1d4ed8] focus:ring-2 focus:ring-[#dbe4ff]"
        id={id}
        placeholder={placeholder}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </div>
  );
}

function RepeatableTextRows({
  label,
  onChange,
  placeholder,
  rows,
}: {
  label: string;
  onChange: (rows: string[]) => void;
  placeholder: string;
  rows: string[];
}) {
  const visibleRows = rows.length ? rows : [''];

  return (
    <div>
      <div className="mb-2 flex items-center justify-between gap-3">
        <label className="block text-[11.5px] font-semibold uppercase tracking-[0.03em] text-[#939bab]">{label}</label>
        <button
          className="inline-flex h-8 items-center gap-1.5 border-none bg-transparent px-0 text-[13px] font-semibold text-[#1d4ed8] transition hover:opacity-70"
          onClick={() => onChange([...visibleRows, ''])}
          type="button"
        >
          <Plus className="h-3.5 w-3.5" aria-hidden="true" />
          Додати
        </button>
      </div>
      <div className="space-y-2">
        {visibleRows.map((row, index) => (
          <div className="flex gap-2" key={`${label}-${index}`}>
            <span className="mt-[17px] hidden h-1.5 w-1.5 flex-none rounded-full bg-[#cdd3dc] sm:block" />
            <input
              className="h-10 min-w-0 flex-1 rounded-[9px] border border-[#e3e6ec] bg-white px-3 text-[13.5px] text-[#2a3038] outline-none transition placeholder:text-[#aeb5c0] focus:border-[#1d4ed8] focus:bg-white"
              placeholder={placeholder}
              value={row}
              onChange={(event) => {
                const nextRows = [...visibleRows];
                nextRows[index] = event.target.value;
                onChange(nextRows);
              }}
            />
            <button
              className="inline-flex h-10 w-10 items-center justify-center rounded-[9px] border border-[#e3e6ec] bg-white text-[#b8bfc9] transition hover:border-[#f1d6d6] hover:text-[#dc2626] disabled:cursor-not-allowed disabled:text-[#d6dae0]"
              disabled={visibleRows.length === 1}
              onClick={() => onChange(visibleRows.filter((_, rowIndex) => rowIndex !== index))}
              title="Видалити рядок"
              type="button"
            >
              <Trash2 className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

function FactRows({
  onChange,
  rows,
}: {
  onChange: (rows: Brief['mustIncludeFacts']) => void;
  rows: Brief['mustIncludeFacts'];
}) {
  const visibleRows = rows.length ? rows : [{ id: createId(), label: '', value: '' }];

  return (
    <div>
      <div className="mb-2 flex items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <label className="block text-[11.5px] font-semibold uppercase tracking-[0.03em] text-[#939bab]">
            Обовʼязкові факти й цифри
          </label>
          <span className="inline-flex items-center gap-1 rounded-md bg-[#fdf3e2] px-2 py-0.5 text-[10.5px] font-semibold text-[#9a6a12]">
            не змінюється AI
          </span>
        </div>
        <button
          className="inline-flex h-8 items-center gap-1.5 border-none bg-transparent px-0 text-[13px] font-semibold text-[#1d4ed8] transition hover:opacity-70"
          onClick={() => onChange([...visibleRows, { id: createId(), label: '', value: '' }])}
          type="button"
        >
          <Plus className="h-3.5 w-3.5" aria-hidden="true" />
          Додати
        </button>
      </div>
      <div className="space-y-2">
        {visibleRows.map((row, index) => (
          <div className="grid grid-cols-[minmax(112px,1.1fr)_minmax(0,1fr)_40px] gap-[7px]" key={row.id}>
            <input
              className="h-10 rounded-[9px] border border-[#e3e6ec] bg-[#fafbfc] px-[11px] text-[13px] text-[#5b6472] outline-none transition placeholder:text-[#aeb5c0] focus:border-[#1d4ed8] focus:bg-white"
              placeholder="Лейбл"
              value={row.label}
              onChange={(event) => {
                const nextRows = [...visibleRows];
                nextRows[index] = { ...row, label: event.target.value };
                onChange(nextRows);
              }}
            />
            <input
              className="h-10 min-w-0 rounded-[9px] border border-[#e3e6ec] bg-white px-[11px] text-[13px] font-semibold text-[#181b22] outline-none transition placeholder:text-[#aeb5c0] focus:border-[#1d4ed8]"
              placeholder="Значення дослівно"
              value={row.value}
              onChange={(event) => {
                const nextRows = [...visibleRows];
                nextRows[index] = { ...row, value: event.target.value };
                onChange(nextRows);
              }}
            />
            <button
              className="inline-flex h-10 w-10 items-center justify-center rounded-[9px] border border-[#e3e6ec] bg-white text-[#b8bfc9] transition hover:border-[#f1d6d6] hover:text-[#dc2626] disabled:cursor-not-allowed disabled:text-[#d6dae0]"
              disabled={visibleRows.length === 1}
              onClick={() => onChange(visibleRows.filter((_, rowIndex) => rowIndex !== index))}
              title="Видалити факт"
              type="button"
            >
              <Trash2 className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

function QuoteRows({
  onAddSpeaker,
  onChange,
  quotes,
  speakers,
}: {
  onAddSpeaker: () => void;
  onChange: (quotes: NonNullable<Brief['quotes']>) => void;
  quotes: NonNullable<Brief['quotes']>;
  speakers: StoredSpeakerCard[];
}) {
  return (
    <div>
      <div className="mb-2 flex items-center justify-between gap-3">
        <label className="block text-[11.5px] font-semibold uppercase tracking-[0.03em] text-[#939bab]">Цитати</label>
        <button
          className="inline-flex h-8 items-center gap-1.5 border-none bg-transparent px-0 text-[13px] font-semibold text-[#1d4ed8] transition hover:opacity-70"
          onClick={() => onChange([...quotes, { id: createId(), speakerId: speakers[0]?.id ?? '', intent: '' }])}
          type="button"
        >
          <Plus className="h-3.5 w-3.5" aria-hidden="true" />
          Додати
        </button>
      </div>
      <div className="space-y-2">
        {quotes.length ? quotes.map((quote, index) => (
          <div className="rounded-[11px] border border-[#e7e9ee] bg-[#fafbfc] p-[11px]" key={quote.id}>
            <div className="grid grid-cols-[minmax(130px,0.45fr)_minmax(0,1fr)_32px] gap-2">
            <select
              className="h-9 rounded-lg border border-[#e3e6ec] bg-white px-[9px] text-[13px] font-semibold text-[#2a3038] outline-none transition focus:border-[#1d4ed8]"
              value={quote.speakerId}
              onChange={(event) => {
                if (event.target.value === '__add__') {
                  onAddSpeaker();
                  return;
                }

                const nextQuotes = [...quotes];
                nextQuotes[index] = { ...quote, speakerId: event.target.value };
                onChange(nextQuotes);
              }}
            >
              <option value="">Спікер</option>
              {speakers.map((speaker) => (
                <option key={speaker.id} value={speaker.id}>{speaker.name}</option>
              ))}
              <option value="__add__">+ Додати спікера</option>
            </select>
            <input
              className="h-9 min-w-0 rounded-lg border border-[#e3e6ec] bg-white px-[10px] text-[13px] text-[#5b6472] outline-none transition placeholder:text-[#aeb5c0] focus:border-[#1d4ed8]"
              placeholder="Що має сказати цитата"
              value={quote.intent}
              onChange={(event) => {
                const nextQuotes = [...quotes];
                nextQuotes[index] = { ...quote, intent: event.target.value };
                onChange(nextQuotes);
              }}
            />
            <button
              className="inline-flex h-9 w-8 items-center justify-center rounded-lg border-none bg-transparent text-[#b8bfc9] transition hover:text-[#dc2626]"
              onClick={() => onChange(quotes.filter((_, quoteIndex) => quoteIndex !== index))}
              title="Видалити цитату"
              type="button"
            >
              <Trash2 className="h-4 w-4" aria-hidden="true" />
            </button>
            </div>
          </div>
        )) : (
          <p className="rounded-[11px] border border-dashed border-[#cdd3dc] bg-[#fafbfc] px-3 py-3 text-[13px] leading-5 text-[#7b8392]">
            Цитати необовʼязкові. Якщо додати рядок, attribution збере код.
          </p>
        )}
      </div>
    </div>
  );
}

type DraftEditorProps = {
  activeVersion: DraftVersion | null;
  draft: Draft | null;
  lintMatches: LintMatch[];
  regeneratingParagraph: number | null;
  selectedSpeaker: StoredSpeakerCard | null;
  status: ActionStatus;
  onParagraphEdit: (paragraphIndex: number, value: string) => void;
  onRegenerateParagraph: (paragraphIndex: number, paragraph: string) => void;
  onSelectVersion: (versionId: string) => void;
};

function DraftEditor({
  activeVersion,
  draft,
  lintMatches,
  regeneratingParagraph,
  selectedSpeaker,
  status,
  onParagraphEdit,
  onRegenerateParagraph,
  onSelectVersion,
}: DraftEditorProps) {
  const isLoading = status.kind === 'loading';
  const paragraphs = activeVersion?.content.split(/\n{2,}/).filter(Boolean) ?? [];
  const formatLabel = draft ? getFormatLabel(draft.brief.format) : 'Чернетка';
  const versionIndex = draft?.versions.findIndex((version) => version.id === draft.activeVersionId) ?? -1;

  return (
    <main className="ct-scroll relative min-h-[calc(100vh-60px)] min-w-0 flex-1 overflow-y-auto bg-[#f7f8fa]">
      <div className="sticky top-0 z-10 flex flex-wrap items-center justify-between gap-3 border-b border-[#e7e9ee] bg-[#f7f8fa]/85 px-8 py-[11px] backdrop-blur">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="mr-1 text-[11px] font-semibold uppercase tracking-[0.04em] text-[#a4abb6]">Версії</span>
        {draft ? (
          <>
            {draft.versions.map((version, index) => {
              const selected = draft.activeVersionId === version.id;

              return (
                <button
                  className={[
                    'h-[27px] rounded-[7px] border px-[11px] text-[12.5px] font-semibold transition',
                    selected
                      ? 'border-[#1d4ed8] bg-[#1d4ed8] text-white'
                      : 'border-[#e7e9ee] bg-white text-[#7b8392] hover:border-[#cdd3dc]',
                  ].join(' ')}
                  key={version.id}
                  onClick={() => onSelectVersion(version.id)}
                  type="button"
                >
                  v{index + 1}
                </button>
              );
            })}
          </>
        ) : (
          <button className="h-[27px] rounded-[7px] border border-[#e7e9ee] bg-white px-[11px] text-[12.5px] font-semibold text-[#7b8392]" type="button">
            v0
          </button>
        )}
          <span className="mx-1 h-[18px] w-px bg-[#e0e3e8]" />
          <span className="inline-flex items-center gap-1.5 text-[12.5px] font-medium text-[#7b8392]">
            <Pencil className="h-[13px] w-[13px] text-[#8b94a3]" aria-hidden="true" />
            {activeVersion ? `${activeVersion.manualEdits} ручних правок` : '0 ручних правок'}
          </span>
        </div>
        <div className="flex items-center gap-[9px]">
          <span
            className={[
              'inline-flex h-[30px] items-center gap-1.5 rounded-lg border px-[11px] text-[12.5px] font-semibold',
              lintMatches.length
                ? 'border-[#f3dcb4] bg-[#fdf3e2] text-[#9a6a12]'
                : 'border-[#e7e9ee] bg-white text-[#9aa1ad]',
            ].join(' ')}
          >
            <AlertTriangle className="h-[13px] w-[13px]" aria-hidden="true" />
            {lintMatches.length ? `${lintMatches.length} зауважень лінтера` : 'Лінтер чистий'}
          </span>
        </div>
      </div>

      {lintMatches.length ? (
        <div className="border-b border-[#f3dcb4] bg-[#fdf3e2] px-8 py-3">
          <p className="inline-flex items-center gap-2 text-sm font-semibold text-[#9a6a12]">
            <AlertTriangle className="h-4 w-4" aria-hidden="true" />
            Лінтер знайшов {lintMatches.length} збігів
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            {lintMatches.slice(0, 12).map((match, index) => (
              <span
                className="rounded-md bg-white px-2 py-1 text-xs font-semibold text-[#9a6a12] ring-1 ring-[#f3dcb4]"
                key={`${match.start}-${match.term}-${index}`}
                title={match.reason}
              >
                {match.term}
              </span>
            ))}
          </div>
        </div>
      ) : null}

      {isLoading ? (
        <div className="mx-auto max-w-[680px] px-8 py-[54px]">
          <div className="mb-8 inline-flex items-center gap-2 rounded-lg bg-[#eef3ff] px-[13px] py-[7px] text-[13px] font-semibold text-[#1d4ed8]">
            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
            Генеруємо чернетку...
          </div>
          <div className="mb-3.5 h-[30px] w-4/5 animate-pulse rounded-lg bg-[#eceef2]" />
          <div className="mb-[34px] h-[30px] w-[55%] animate-pulse rounded-lg bg-[#eceef2]" />
          {[100, 97, 88, 94, 74].map((width, index) => (
            <div
              className="mb-[11px] h-[13px] animate-pulse rounded-md bg-[#eceef2]"
              key={index}
              style={{ width: `${width}%` }}
            />
          ))}
        </div>
      ) : activeVersion ? (
        <article className="mx-auto max-w-[680px] px-8 py-10 pb-[90px]">
          <div className="mb-4 text-xs font-bold uppercase tracking-[0.08em] text-[#1d4ed8]">
            {formatLabel}
            {draft?.brief.targetMedia ? ` · готується для ${draft.brief.targetMedia}` : ''}
          </div>
          <h1 className="mb-[18px] font-[Literata,serif] text-[32px] font-bold leading-[1.2] tracking-[-0.01em] text-[#14171d] md:text-[36px]">
            {draft?.brief.topic || 'Чернетка'}
          </h1>
          {selectedSpeaker && draft?.brief.format !== 'press_release' ? (
            <div className="mb-[30px] flex items-center gap-[11px] border-b border-[#e7e9ee] pb-[26px]">
              <span className="flex h-[34px] w-[34px] items-center justify-center rounded-full bg-gradient-to-br from-blue-500 to-blue-700 text-xs font-bold text-white">
                {getSpeakerInitials(selectedSpeaker.name)}
              </span>
              <div className="min-w-0 text-[13.5px]">
                <span className="font-semibold text-[#2a3038]">{selectedSpeaker.name}</span>
                <span className="text-[#9aa1ad]"> · {selectedSpeaker.role}</span>
              </div>
            </div>
          ) : null}

          {paragraphs.map((paragraph, index) => (
            <ParagraphEditor
              key={`${activeVersion.id}-${index}`}
              index={index}
              isRegenerating={regeneratingParagraph === index}
              lintMatches={getParagraphLintMatches(activeVersion.content, paragraph, index, lintMatches)}
              paragraph={paragraph}
              onEdit={onParagraphEdit}
              onRegenerate={onRegenerateParagraph}
            />
          ))}
        </article>
      ) : (
        <div className="flex h-full min-h-[560px] flex-col items-center justify-center px-10 text-center">
          <div className="flex h-24 w-24 items-center justify-center rounded-3xl border border-[#dfe3ea] bg-white">
            <FileText className="h-10 w-10 text-[#a4abb6]" aria-hidden="true" />
          </div>
          <h3 className="mt-[26px] text-lg font-bold text-[#2a3038]">Чистий аркуш</h3>
          <p className="mt-2 max-w-[340px] text-sm leading-[1.55] text-[#8b94a3]">
            Заповни бриф ліворуч і згенеруй — або відкрий попередній матеріал в{' '}
            <span className="font-semibold text-[#1d4ed8]">Історії</span>.
          </p>
        </div>
      )}
    </main>
  );
}

function getParagraphLintMatches(
  content: string,
  paragraph: string,
  paragraphIndex: number,
  matches: LintMatch[],
) {
  let start = 0;

  for (let index = 0; index < paragraphIndex; index += 1) {
    const previous = content.split(/\n{2,}/)[index] ?? '';
    start += previous.length + 2;
  }

  const end = start + paragraph.length;

  return matches.filter((match) => match.start >= start && match.end <= end);
}

function ParagraphEditor({
  index,
  isRegenerating,
  lintMatches,
  onEdit,
  onRegenerate,
  paragraph,
}: {
  index: number;
  isRegenerating: boolean;
  lintMatches: LintMatch[];
  onEdit: (paragraphIndex: number, value: string) => void;
  onRegenerate: (paragraphIndex: number, paragraph: string) => void;
  paragraph: string;
}) {
  const [value, setValue] = useState(paragraph);

  useEffect(() => {
    setValue(paragraph);
  }, [paragraph]);

  return (
    <div className="group relative">
      <div className="absolute right-[-6px] top-[-2px] z-[2] flex items-center gap-3 opacity-100 transition md:opacity-0 md:group-hover:opacity-100">
        <button
          className="inline-flex h-[26px] items-center gap-1.5 rounded-[7px] border border-[#e2e9fb] bg-white px-[9px] text-[11.5px] font-semibold text-[#1d4ed8] shadow-[0_2px_8px_rgba(16,24,40,.08)] transition hover:bg-[#f7f9ff] disabled:cursor-not-allowed disabled:text-[#9aa1ad]"
          disabled={isRegenerating}
          onClick={() => onRegenerate(index, value)}
          type="button"
        >
          {isRegenerating ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
          ) : (
            <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
          )}
          Перегенерувати
        </button>
      </div>
      <textarea
        className="mb-[22px] min-h-[132px] w-full resize-y border-0 bg-transparent p-0 font-[Literata,serif] text-[19px] leading-[1.72] text-[#2c313a] outline-none transition focus:bg-white/40"
        value={value}
        onBlur={() => onEdit(index, value)}
        onChange={(event) => setValue(event.target.value)}
      />
      {lintMatches.length ? (
        <div className="-mt-3 mb-5 flex flex-wrap gap-2">
          {lintMatches.map((match, matchIndex) => (
            <span
              className="rounded-md bg-[#fdf0db] px-2 py-1 text-xs font-semibold text-[#9a6a12] underline decoration-[#e8a33d] decoration-2 underline-offset-2"
              key={`${match.start}-${matchIndex}`}
              title={match.reason}
            >
              {match.term}
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function StatusPill({ status }: { status: ActionStatus }) {
  return (
    <span
      className={[
        'inline-flex min-h-8 items-center rounded-lg px-3 py-1 text-xs font-semibold',
        status.kind === 'error'
          ? 'bg-red-50 text-red-700 ring-1 ring-red-200'
          : status.kind === 'success'
            ? 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200'
            : 'bg-[#eef3ff] text-[#1d4ed8] ring-1 ring-[#c9d8fb]',
      ].join(' ')}
    >
      {status.message}
    </span>
  );
}

type AddSpeakerModalProps = {
  initialCard: StoredSpeakerCard | null;
  mode: 'create' | 'edit';
  onClose: () => void;
  onSave: (card: SpeakerCard) => void;
};

function AddSpeakerModal({ initialCard, mode, onClose, onSave }: AddSpeakerModalProps) {
  const [activeTab, setActiveTab] = useState<'manual' | 'extract'>('manual');
  const [status, setStatus] = useState<ActionStatus>(initialStatus);
  const [form, setForm] = useState<SpeakerCard>(() => initialCard ?? {
    id: '',
    name: '',
    role: '',
    language: 'uk',
    addressForm: '',
    sentenceStyle: '',
    tone: [],
    source: 'user',
  });
  const [toneInput, setToneInput] = useState((initialCard?.tone ?? []).join(', '));
  const [lexiconYesInput, setLexiconYesInput] = useState((initialCard?.lexiconYes ?? []).join(', '));
  const [lexiconNoInput, setLexiconNoInput] = useState((initialCard?.lexiconNo ?? []).join(', '));
  const [extractDescription, setExtractDescription] = useState('');
  const [extractTexts, setExtractTexts] = useState(['']);

  function parseList(value: string) {
    return value.split(',').map((item) => item.trim()).filter(Boolean);
  }

  function buildCardFromForm(): SpeakerCard {
    return {
      ...form,
      id: form.id || '',
      language: 'uk',
      lexiconNo: parseList(lexiconNoInput),
      lexiconYes: parseList(lexiconYesInput),
      lowConfidence: !form.sentenceStyle?.trim() || parseList(toneInput).length === 0 || form.lowConfidence,
      source: 'user',
      tone: parseList(toneInput),
    };
  }

  async function handleExtractStyle() {
    if (!form.name.trim() || !form.role.trim()) {
      setStatus({ kind: 'error', message: 'Для extraction потрібні імʼя та посада.' });
      return;
    }

    setStatus({ kind: 'loading', message: 'Витягуємо стиль...' });

    try {
      const response = await fetch('/api/articles/extract-style', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          description: extractDescription,
          name: form.name,
          role: form.role,
          texts: extractTexts.map((text) => text.trim()).filter(Boolean),
        }),
      });
      const data = await readApiJson<ExtractStyleResponse>(response);

      if (!response.ok || !data.card) {
        throw new Error(data.error ?? 'Не вдалося витягнути стиль.');
      }

      setForm(data.card);
      setToneInput((data.card.tone ?? []).join(', '));
      setLexiconYesInput((data.card.lexiconYes ?? []).join(', '));
      setLexiconNoInput((data.card.lexiconNo ?? []).join(', '));
      setActiveTab('manual');
      setStatus({ kind: 'success', message: 'Стиль витягнуто. Картку можна відредагувати.' });
    } catch (error) {
      setStatus({
        kind: 'error',
        message: error instanceof Error ? error.message : 'Не вдалося витягнути стиль.',
      });
    }
  }

  function handleSave() {
    const card = buildCardFromForm();

    if (!card.name.trim() || !card.role.trim()) {
      setStatus({ kind: 'error', message: 'Заповніть імʼя та посаду.' });
      return;
    }

    onSave(card);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#14171d]/40 px-4 py-8 backdrop-blur-sm">
      <div className="ct-scroll max-h-[90vh] w-full max-w-[780px] overflow-y-auto rounded-[18px] bg-white shadow-[0_24px_60px_rgba(16,24,40,.28)]">
        <div className="sticky top-0 z-10 rounded-t-[18px] border-b border-[#eef0f3] bg-white px-6 pt-5">
          <div className="mb-[18px] flex items-start justify-between gap-4">
          <div>
            <h2 className="text-[19px] font-bold tracking-[-0.01em] text-[#181b22]">
              {mode === 'edit' ? 'Редагувати спікера' : 'Додати спікера'}
            </h2>
            <p className="mt-1 text-[13px] text-[#9aa1ad]">Картку можна редагувати будь-коли</p>
          </div>
          <button
            className="inline-flex h-8 w-8 items-center justify-center rounded-[9px] border border-[#eef0f3] bg-white text-[#8b94a3] transition hover:bg-[#f5f6f8]"
            onClick={onClose}
            type="button"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
          </div>
          <div className="flex gap-6">
            {[
              { label: 'Заповнити вручну', value: 'manual' as const },
              { label: 'Витягнути зі стилю', value: 'extract' as const },
            ].map((tab) => (
              <button
                className={[
                  'mb-[-1px] border-b-2 bg-transparent px-0.5 pb-[13px] text-sm font-semibold transition',
                  activeTab === tab.value
                    ? 'border-[#1d4ed8] text-[#181b22]'
                    : 'border-transparent text-[#9aa1ad] hover:text-[#5b6472]',
                ].join(' ')}
                key={tab.value}
                onClick={() => setActiveTab(tab.value)}
                type="button"
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-5 px-6 py-[22px]">
          {activeTab === 'manual' ? (
            <div className="rounded-[14px] border border-[#eef0f3] bg-[#fcfcfd] p-[18px]">
              <div className="mb-4 flex items-center justify-between">
                <h3 className="text-[13px] font-bold uppercase tracking-[0.04em] text-[#939bab]">Картка спікера</h3>
                {buildCardFromForm().lowConfidence ? (
                  <span className="inline-flex items-center gap-1.5 rounded-[7px] bg-[#fdf3e2] px-2.5 py-1 text-[11px] font-semibold text-[#9a6a12]">
                    <AlertTriangle className="h-3 w-3" aria-hidden="true" />
                    low confidence
                  </span>
                ) : null}
              </div>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <TextField
                id="speakerName"
                label="Імʼя *"
                placeholder="Імʼя Прізвище"
                value={form.name}
                onChange={(name) => setForm((current) => ({ ...current, name }))}
              />
              <TextField
                id="speakerRole"
                label="Посада *"
                placeholder="CEO Universe Group"
                value={form.role}
                onChange={(role) => setForm((current) => ({ ...current, role }))}
              />
              <TextField
                id="speakerAddress"
                label="Форма звертання"
                placeholder="ви"
                value={form.addressForm ?? ''}
                onChange={(addressForm) => setForm((current) => ({ ...current, addressForm }))}
              />
              <TextField
                id="speakerArchetype"
                label="Архетип"
                placeholder="прагматичний експерт"
                value={form.archetype ?? ''}
                onChange={(archetype) => setForm((current) => ({ ...current, archetype }))}
              />
              <div className="md:col-span-2">
                <label className="mb-2 block text-[11px] font-semibold uppercase tracking-[0.03em] text-[#939bab]" htmlFor="speakerSentenceStyle">
                  Стиль речень
                </label>
                <textarea
                  className="min-h-24 w-full rounded-[9px] border border-[#e3e6ec] bg-white p-3 text-sm leading-6 text-[#2a3038] outline-none transition placeholder:text-[#aeb5c0] focus:border-[#1d4ed8]"
                  id="speakerSentenceStyle"
                  placeholder="Короткі речення, багато конкретики..."
                  value={form.sentenceStyle ?? ''}
                  onChange={(event) => setForm((current) => ({ ...current, sentenceStyle: event.target.value }))}
                />
              </div>
              <TextField
                id="speakerTone"
                label="Tone"
                placeholder="експертний, прямий"
                value={toneInput}
                onChange={setToneInput}
              />
              <TextField
                id="speakerAnglicisms"
                label="Англіцизми"
                placeholder="допустимі / уникати"
                value={form.anglicisms ?? ''}
                onChange={(anglicisms) => setForm((current) => ({ ...current, anglicisms }))}
              />
              <TextField
                id="speakerLexiconYes"
                label="Лексика так"
                placeholder="через кому"
                value={lexiconYesInput}
                onChange={setLexiconYesInput}
              />
              <TextField
                id="speakerLexiconNo"
                label="Лексика ні"
                placeholder="через кому"
                value={lexiconNoInput}
                onChange={setLexiconNoInput}
              />
              <div className="md:col-span-2">
                <label className="mb-2 block text-[11px] font-semibold uppercase tracking-[0.03em] text-[#939bab]" htmlFor="speakerNotes">
                  Нотатки
                </label>
                <textarea
                  className="min-h-24 w-full rounded-[9px] border border-[#e3e6ec] bg-white p-3 text-sm leading-6 text-[#2a3038] outline-none transition placeholder:text-[#aeb5c0] focus:border-[#1d4ed8]"
                  id="speakerNotes"
                  value={form.notes ?? ''}
                  onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))}
                />
              </div>
              {buildCardFromForm().lowConfidence ? (
                <p className="inline-flex items-center gap-2 rounded-md bg-[#fdf3e2] px-3 py-2 text-xs font-semibold text-[#9a6a12] ring-1 ring-[#f3dcb4] md:col-span-2">
                  <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />
                  low confidence
                </p>
              ) : null}
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <TextField
                  id="extractName"
                  label="Імʼя *"
                  placeholder="Імʼя Прізвище"
                  value={form.name}
                  onChange={(name) => setForm((current) => ({ ...current, name }))}
                />
                <TextField
                  id="extractRole"
                  label="Посада *"
                  placeholder="CEO Universe Group"
                  value={form.role}
                  onChange={(role) => setForm((current) => ({ ...current, role }))}
                />
              </div>
              <div>
                <label className="mb-2 block text-[11.5px] font-semibold uppercase tracking-[0.03em] text-[#939bab]" htmlFor="extractDescription">
                  Опис TOV
                </label>
                <textarea
                  className="min-h-24 w-full rounded-[11px] border border-[#e3e6ec] bg-white p-3 text-[13.5px] leading-6 text-[#2a3038] outline-none transition placeholder:text-[#aeb5c0] focus:border-[#1d4ed8]"
                  id="extractDescription"
                  value={extractDescription}
                  onChange={(event) => setExtractDescription(event.target.value)}
                />
              </div>
              <RepeatableTextRows
                label="Тексти спікера"
                placeholder="Вставте текст"
                rows={extractTexts}
                onChange={(rows) => setExtractTexts(rows.slice(0, 3))}
              />
              <button
                className="inline-flex h-[42px] items-center gap-2 rounded-[11px] bg-[#1d4ed8] px-[18px] text-[13.5px] font-bold text-white shadow-[0_2px_10px_rgba(29,78,216,.22)] transition hover:bg-[#1a44bd] disabled:cursor-not-allowed disabled:bg-[#d6dae0] disabled:text-[#8b94a3]"
                disabled={status.kind === 'loading'}
                onClick={handleExtractStyle}
                type="button"
              >
                {status.kind === 'loading' ? (
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                ) : (
                  <WandSparkles className="h-4 w-4" aria-hidden="true" />
                )}
                Витягнути стиль
              </button>
            </div>
          )}

          {status.message ? <StatusPill status={status} /> : null}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[#eef0f3] px-6 py-5">
          <p className="text-[12.5px] text-[#9aa1ad]">Картку можна редагувати будь-коли</p>
          <div className="flex gap-[9px]">
          <button
            className="inline-flex h-[42px] items-center gap-2 rounded-[11px] border border-[#e3e6ec] bg-white px-[18px] text-[13.5px] font-semibold text-[#5b6472] transition hover:bg-[#f5f6f8]"
            onClick={onClose}
            type="button"
          >
            Скасувати
          </button>
          <button
            className="inline-flex h-[42px] items-center gap-2 rounded-[11px] bg-[#1d4ed8] px-5 text-[13.5px] font-bold text-white shadow-[0_2px_10px_rgba(29,78,216,.22)] transition hover:bg-[#1a44bd]"
            onClick={handleSave}
            type="button"
          >
            <UserPlus className="h-4 w-4" aria-hidden="true" />
            Зберегти картку
          </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export type AppStep = 1 | 2 | 3;

export type StatusKind = 'idle' | 'loading' | 'success' | 'error';

export type Priority =
  | 'Planned'
  | 'This week'
  | 'Urgent'
  | 'High'
  | 'Normal'
  | 'Low';

export type SelectOption = string;

export type TaskType = {
  name: string;
  hours: number;
  pageId: string;
};

export type ActionStatus = {
  kind: StatusKind;
  message?: string;
};

export type VacancyBrief = {
  id: string;
  title: string;
  sourceUrl?: string;
  brief: string;
};

export type NotionTaskLink = {
  id: string;
  name: string;
  url: string;
  fallbackUrl?: string;
  kind: 'single' | 'parent' | 'child';
};

export type NotionTaskForm = {
  name: string;
  deadline: string;
  priority: Priority;
  platform: string;
  format: string;
  taskTypeId: string;
};

export type RequestTimings = {
  generateBriefMs?: number;
  createNotionTaskMs?: number;
};

export type RequestHistoryItem = {
  id: string;
  createdAt: string;
  title: string;
  vacancies: string;
  systemPrompt: string;
  brief: string;
  vacancyBriefs?: VacancyBrief[];
  notionForm?: NotionTaskForm;
  taskUrl?: string;
  taskFallbackUrl?: string;
  taskId?: string;
  taskUrls?: NotionTaskLink[];
  timings: RequestTimings;
};

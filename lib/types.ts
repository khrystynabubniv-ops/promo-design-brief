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

export type NotionTaskForm = {
  name: string;
  deadline: string;
  priority: Priority;
  platform: string;
  format: string;
  taskTypeId: string;
};

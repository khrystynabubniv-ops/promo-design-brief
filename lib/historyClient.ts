import type { GenerationHistoryItem, GenerationHistoryTool } from './types';

type HistoryResponse = {
  error?: string;
  items?: GenerationHistoryItem[];
};

export function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

export function getStringField(value: unknown, key: string) {
  if (!isRecord(value)) {
    return '';
  }

  const field = value[key];

  return typeof field === 'string' ? field : '';
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

export async function fetchGenerationHistory(tool: GenerationHistoryTool, limit = 150) {
  const response = await fetch(`/api/history?tool=${tool}&limit=${limit}`, {
    cache: 'no-store',
  });
  const data = await readApiJson<HistoryResponse>(response);

  if (!response.ok) {
    throw new Error(data.error ?? 'Не вдалося завантажити історію.');
  }

  return data.items?.filter((item) => item.tool === tool) ?? [];
}

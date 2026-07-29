import { createHash, randomUUID } from 'crypto';
import type { Pool } from 'pg';
import { getPool, isDatabaseConfigured } from './database';
import { requestOpenRouterTextCompletion } from './openrouter';
import type { SmmGenerateRequest } from './schema';

const SMM_LEARNING_RULE_LIMIT = 12;
const SMM_LEARNING_MAX_RULES = 80;
const MAX_RULE_LENGTH = 420;

type SmmLearningRule = {
  createdAt: string;
  id: string;
  rule: string;
};

type SmmLearningContext = {
  form: SmmGenerateRequest;
};

type SaveSmmLearningRuleParams = SmmLearningContext & {
  instruction: string;
  rule: string;
};

let schemaReadyPromise: Promise<void> | null = null;

function normalizeRule(value: string) {
  return value
    .replace(/^[-*\d.\s]+/, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_RULE_LENGTH)
    .trim();
}

function getFingerprint(form: SmmGenerateRequest, rule: string) {
  return createHash('sha256')
    .update([
      form.contentType,
      form.platform,
      form.format,
      rule.toLowerCase(),
    ].join('|'))
    .digest('hex');
}

function mapRuleRow(row: {
  created_at: Date | string;
  id: string;
  rule: string;
}): SmmLearningRule {
  const createdAt = row.created_at instanceof Date
    ? row.created_at.toISOString()
    : new Date(row.created_at).toISOString();

  return {
    createdAt,
    id: row.id,
    rule: row.rule,
  };
}

async function ensureSmmLearningRulesTable(currentPool: Pool) {
  if (!schemaReadyPromise) {
    schemaReadyPromise = currentPool.query(`
      CREATE TABLE IF NOT EXISTS smm_learning_rules (
        id TEXT PRIMARY KEY,
        fingerprint TEXT UNIQUE NOT NULL,
        rule TEXT NOT NULL,
        source_instruction TEXT NOT NULL,
        content_type TEXT NOT NULL,
        platform TEXT NOT NULL,
        format TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE INDEX IF NOT EXISTS smm_learning_rules_context_created_at_idx
        ON smm_learning_rules (content_type, platform, format, created_at DESC);
    `).then(() => undefined);
  }

  await schemaReadyPromise;
}

async function pruneSmmLearningRules(currentPool: Pool) {
  await currentPool.query(
    `DELETE FROM smm_learning_rules
     WHERE id IN (
       SELECT id
       FROM smm_learning_rules
       ORDER BY created_at DESC
       OFFSET $1
     )`,
    [SMM_LEARNING_MAX_RULES],
  );
}

export function isSmmLearningConfigured() {
  return isDatabaseConfigured();
}

export async function getSmmLearningRules({
  form,
}: SmmLearningContext): Promise<SmmLearningRule[]> {
  const currentPool = getPool();

  if (!currentPool) {
    return [];
  }

  await ensureSmmLearningRulesTable(currentPool);

  const result = await currentPool.query(
    `SELECT id, rule, created_at
     FROM smm_learning_rules
     WHERE content_type = $1
       AND platform = $2
       AND ($3 = 'both' OR format = $3 OR format = 'both')
     ORDER BY created_at DESC
     LIMIT $4`,
    [
      form.contentType,
      form.platform,
      form.format,
      SMM_LEARNING_RULE_LIMIT,
    ],
  );

  return result.rows.map(mapRuleRow);
}

export async function getSmmLearningRulesSafely(context: SmmLearningContext) {
  try {
    return await getSmmLearningRules(context);
  } catch (error) {
    console.warn('[smm-learning] failed to read rules', {
      error: error instanceof Error ? error.message : 'unknown error',
    });

    return [];
  }
}

export async function saveSmmLearningRule(params: SaveSmmLearningRuleParams) {
  const currentPool = getPool();
  const rule = normalizeRule(params.rule);

  if (!currentPool || !rule || rule.toUpperCase().startsWith('NO_LEARNING')) {
    return null;
  }

  await ensureSmmLearningRulesTable(currentPool);

  const fingerprint = getFingerprint(params.form, rule);
  const result = await currentPool.query(
    `INSERT INTO smm_learning_rules (
       id,
       fingerprint,
       rule,
       source_instruction,
       content_type,
       platform,
       format
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT (fingerprint)
     DO UPDATE SET
       source_instruction = EXCLUDED.source_instruction,
       created_at = NOW()
     RETURNING id, rule, created_at`,
    [
      randomUUID(),
      fingerprint,
      rule,
      params.instruction.trim(),
      params.form.contentType,
      params.form.platform,
      params.form.format,
    ],
  );

  await pruneSmmLearningRules(currentPool);

  return mapRuleRow(result.rows[0]);
}

export async function saveSmmLearningRuleSafely(params: SaveSmmLearningRuleParams) {
  try {
    return await saveSmmLearningRule(params);
  } catch (error) {
    console.warn('[smm-learning] failed to save rule', {
      error: error instanceof Error ? error.message : 'unknown error',
    });

    return null;
  }
}

export async function deriveSmmLearningRuleSafely({
  form,
  instruction,
}: SmmLearningContext & { instruction: string }) {
  if (!isSmmLearningConfigured()) {
    return '';
  }

  try {
    const content = await requestOpenRouterTextCompletion({
      maxTokens: 220,
      temperature: 0.2,
      messages: [
        {
          role: 'system',
          content: `Ти редактор Universe Group. Твоє завдання — перетворити конкретну правку користувача на короткий reusable редакторський урок для майбутніх SMM генерацій.

Поверни один рядок українською без markdown.
Якщо правка одноразова і не дає корисного стилістичного/структурного уроку, поверни рівно NO_LEARNING.
Не перенось у правило імена, дати, назви продуктів, компаній, факти або теми з конкретного поста.`,
        },
        {
          role: 'user',
          content: `Контекст:
- Тип контенту: ${form.contentType}
- Майданчик: ${form.platform}
- Формат: ${form.format}

Правка користувача:
${instruction.trim()}

Сформулюй reusable урок. Приклади хорошого формату:
- У каруселях про карʼєрний ріст перший слайд має триматися на конкретній дії/зміні відповідальності, а не на абстрактному гачку.
- Якщо користувач просить "менш пафосно", прибирай мотиваційні афоризми й замінюй їх фактами, діями та простішими реченнями.`,
        },
      ],
    });
    const rule = normalizeRule(content);

    if (!rule || rule.toUpperCase().startsWith('NO_LEARNING')) {
      return '';
    }

    return rule;
  } catch (error) {
    console.warn('[smm-learning] failed to derive rule', {
      error: error instanceof Error ? error.message : 'unknown error',
    });

    return '';
  }
}

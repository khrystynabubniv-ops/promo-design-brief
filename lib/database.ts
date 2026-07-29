import { Pool } from 'pg';

let pool: Pool | null = null;

export function getDatabaseUrl() {
  return process.env.DATABASE_URL || process.env.POSTGRES_URL || '';
}

export function isDatabaseConfigured() {
  return Boolean(getDatabaseUrl());
}

export function getPool() {
  const databaseUrl = getDatabaseUrl();

  if (!databaseUrl) {
    return null;
  }

  if (!pool) {
    pool = new Pool({
      connectionString: databaseUrl,
      ssl: databaseUrl.includes('railway.internal')
        ? false
        : {
            rejectUnauthorized: false,
          },
    });
  }

  return pool;
}

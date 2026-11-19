import { Pool } from "pg";

// Prevent multiple pool instances in development
declare global {
  // eslint-disable-next-line no-var
  var __neon_pool__: Pool | undefined;
}

const connectionString =
  process.env.DATABASE_URL ||
  "postgresql://neondb_owner:npg_UR1nBFGC7KZa@ep-wispy-bread-bdlxeqet-pooler.c-8.us-east-2.aws.neon.tech/neondb?sslmode=require&channel_binding=require";

export const pool =
  global.__neon_pool__ ||
  new Pool({
    connectionString,
    ssl: {
      rejectUnauthorized: false,
    },
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 10000,
  });

if (process.env.NODE_ENV !== "production") {
  global.__neon_pool__ = pool;
}

export async function query(text: string, params?: any[]) {
  return pool.query(text, params);
}

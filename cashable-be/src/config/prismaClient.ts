import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import { AsyncLocalStorage } from 'async_hooks';
import { performance } from 'perf_hooks';

// Reuse a single PrismaClient instance across the app.
const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
};

// Use the standard PostgreSQL driver (pg) against the Neon connection string.
const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error('DATABASE_URL environment variable is not set');
}

const pool = new Pool({
  connectionString,
  ssl: { rejectUnauthorized: false },
  // Prevent "ConnectionClosed" (P1017) when DB closes idle connections
  keepAlive: true,
  idleTimeoutMillis: 20000,
  // Neon cold starts can exceed 10s; allow longer connect attempts locally.
  connectionTimeoutMillis: Number(process.env.DB_CONNECTION_TIMEOUT_MS ?? '60000'),
});

pool.on('error', (err) => {
  console.error('Database pool error:', err.message);
});

const adapter = new PrismaPg(pool);

/**
 * Per-request database timing (time spent waiting on queries + how many ran), reported to the
 * browser in the `Server-Timing` response header — see `serverTimingMiddleware` in index.ts.
 */
export const dbTiming = new AsyncLocalStorage<{ ms: number; count: number }>();

const baseClient = new PrismaClient({
  adapter,
  log: ['error', 'warn'],
} as any);

const prisma: PrismaClient =
  globalForPrisma.prisma ??
  (baseClient.$extends({
    query: {
      async $allOperations({ args, query }) {
        const store = dbTiming.getStore();
        if (!store) return query(args);
        const started = performance.now();
        try {
          return await query(args);
        } finally {
          store.ms += performance.now() - started;
          store.count += 1;
        }
      },
    },
  }) as unknown as PrismaClient);

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}

export default prisma;



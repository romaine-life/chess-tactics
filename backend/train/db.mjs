// Postgres pool for the training worker — the SAME passwordless workload-identity
// connection backend/server.js uses (buildPool), so a Job pod authenticates to
// Azure Postgres with its federated token exactly like the app. Only used when
// TRAIN_RUN_ID is set (persisting progress); the stdout-only path needs no DB.
import pg from 'pg';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { Pool } = pg;
const AAD_DB_TOKEN_SCOPE = 'https://ossrdbms-aad.database.windows.net/.default';

let cached;

export function getTrainerPool() {
  if (cached !== undefined) return cached;
  const databaseUrl = process.env.DATABASE_URL || '';
  const host = process.env.POSTGRES_HOST || '';
  const database = process.env.POSTGRES_DATABASE || '';
  const user = process.env.POSTGRES_USER || '';
  if (databaseUrl) {
    const needsSsl = /sslmode=require/i.test(databaseUrl) || /\.postgres\.database\.azure\.com/i.test(databaseUrl);
    cached = new Pool({ connectionString: databaseUrl, ssl: needsSsl ? { rejectUnauthorized: false } : undefined, max: 4, connectionTimeoutMillis: 10000 });
  } else if (host && database && user) {
    const { DefaultAzureCredential } = require('@azure/identity');
    const credential = new DefaultAzureCredential();
    cached = new Pool({
      host, port: 5432, database, user,
      password: async () => {
        const token = await credential.getToken(AAD_DB_TOKEN_SCOPE);
        if (!token || !token.token) throw new Error('failed to acquire AAD token for Postgres');
        return token.token;
      },
      ssl: { rejectUnauthorized: false }, max: 4, idleTimeoutMillis: 30000, connectionTimeoutMillis: 10000, maxLifetimeSeconds: 50 * 60,
    });
  } else {
    cached = null;
  }
  return cached;
}

import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const backendDir = path.resolve(scriptDir, '..');
const usesConnectionString = Boolean(String(process.env.DATABASE_URL || '').trim());
const result = spawnSync(
  process.execPath,
  ['server.js'],
  {
    cwd: backendDir,
    env: {
      ...process.env,
      SCHEMA_MIGRATIONS: 'auto',
      SCHEMA_MIGRATION_COMMAND: '1',
      POSTGRES_HOST: usesConnectionString
        ? ''
        : (process.env.POSTGRES_HOST || 'chess-tactics-pg.postgres.database.azure.com'),
      POSTGRES_DATABASE: usesConnectionString
        ? ''
        : (process.env.POSTGRES_DATABASE || 'chess_tactics'),
      POSTGRES_USER: usesConnectionString
        ? ''
        : (process.env.POSTGRES_USER || 'nelson-devops-project@outlook.com'),
    },
    stdio: 'inherit',
  },
);

if (result.error) throw result.error;
process.exitCode = result.status ?? 1;

// Headless training worker — the process a cluster Job runs on the D8als_v7 pool.
//
// Reads a run spec (TRAIN_SPEC env JSON, or a train_runs row via TRAIN_RUN_ID),
// tunes the AI's eval weights for one level by launching N parallel SPSA restarts
// across worker_threads (one per core), keeps the best champion, and reports the
// result — to stdout always (visible in `kubectl logs`), and to the train_runs
// table when TRAIN_RUN_ID is set so the Gym can read it back.
//
// The engine is the SAME pure, deterministic bundle the app and live AI use
// (frontend/trainer-bundle/engine.mjs, built by `npm run build:trainer`). No DOM,
// no server — this is a run-to-completion batch job.
import { Worker } from 'node:worker_threads';
import os from 'node:os';
import { performance } from 'node:perf_hooks';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { generateOpeningBook, DEFAULT_EVAL_WEIGHTS } from '../frontend/trainer-bundle/engine.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const log = (o) => console.log(JSON.stringify({ t: new Date().toISOString(), ...o }));

async function loadSpec() {
  if (process.env.TRAIN_SPEC) return JSON.parse(process.env.TRAIN_SPEC);
  const runId = process.env.TRAIN_RUN_ID;
  if (!runId) throw new Error('set TRAIN_SPEC (json) or TRAIN_RUN_ID (train_runs row id)');
  const { getTrainerPool } = await import('./train/db.mjs');
  const pool = getTrainerPool();
  if (!pool) throw new Error('TRAIN_RUN_ID set but no database configured');
  const { rows } = await pool.query('SELECT spec FROM train_runs WHERE id = $1', [runId]);
  if (!rows.length) throw new Error(`train_runs row ${runId} not found`);
  return rows[0].spec;
}

function runRestart(r, level, cfg) {
  return new Promise((resolve, reject) => {
    const w = new Worker(join(here, 'train', 'restart-thread.mjs'), {
      workerData: { level, cfg: { ...cfg, masterSeed: (cfg.masterSeed ?? 1) + r * 100003 } },
    });
    w.once('message', (m) => { w.terminate(); resolve({ r, ...m }); });
    w.once('error', (e) => { w.terminate(); reject(e); });
  });
}

async function persist(runId, patch) {
  if (!runId) return;
  try {
    const { getTrainerPool } = await import('./train/db.mjs');
    const pool = getTrainerPool();
    if (pool) await pool.query('UPDATE train_runs SET body = body || $2::jsonb, status = $3, updated_at = now() WHERE id = $1', [runId, JSON.stringify(patch.body ?? {}), patch.status]);
  } catch (e) { log({ event: 'persist_error', error: String(e && e.message || e) }); }
}

async function main() {
  const spec = await loadSpec();
  const runId = process.env.TRAIN_RUN_ID || null;
  const level = spec.level;
  if (!level) throw new Error('spec.level is required');
  const match = spec.match ?? { search: { maxDepth: 4, maxNodes: 40_000 }, maxPlies: 100 };
  const steps = spec.steps ?? 60;
  const restarts = Math.max(1, Math.min(spec.restarts ?? (os.cpus().length - 1), os.cpus().length));
  const masterSeed = spec.masterSeed ?? 1;
  const reference = spec.reference ?? DEFAULT_EVAL_WEIGHTS;
  const book = spec.book ?? generateOpeningBook(level, spec.bookSettings ?? { size: 8, seedBase: 1, plies: 4, variety: 0.6 }, match);

  log({ event: 'start', level: level.id, restarts, steps, book: book.length, cores: os.cpus().length });
  await persist(runId, { status: 'running', body: { startedAt: new Date().toISOString(), restarts, steps } });

  const cfg = { steps, book, match, masterSeed, reference };
  const t0 = performance.now();
  const results = await Promise.all(Array.from({ length: restarts }, (_, r) => runRestart(r, level, cfg)));
  const secs = (performance.now() - t0) / 1000;

  results.sort((a, b) => b.champion.score - a.champion.score);
  const best = results[0];
  const summary = {
    event: 'done',
    secs: +secs.toFixed(1),
    gamesPerSec: null,
    best: { restart: best.r, score: +best.champion.score.toFixed(4), step: best.champion.step },
    restarts: results.map((x) => ({ r: x.r, score: +x.champion.score.toFixed(4) })),
    championTheta: best.champion.theta,
  };
  log(summary);
  await persist(runId, { status: 'done', body: { finishedAt: new Date().toISOString(), secs: summary.secs, champion: best.champion, restarts: summary.restarts } });
  process.exit(0);
}

main().catch((e) => { log({ event: 'error', error: String(e && e.stack || e) }); process.exit(1); });

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
import { generateCuratedBook, splitBook, decodeWeights, validateStep, DEFAULT_SPRT, DEFAULT_EVAL_WEIGHTS } from '../frontend/trainer-bundle/engine.mjs';

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
  // Curated (UHO/imbalanced) book so games are DECISIVE (a balanced book draws out
  // and yields no signal), split into a TRAIN slice (SPSA tunes on it) and a disjoint
  // HELD-OUT slice (the champion is SPRT-validated on it — the anti-overfit guard: it
  // must beat the shipped AI on openings it never trained on).
  const fullBook = spec.book
    ?? generateCuratedBook(level, spec.bookSettings ?? { size: 16, seedBase: 1, plies: 4, variety: 0.6 }, match, spec.curation).positions;
  const split = splitBook(fullBook.length, spec.holdoutFraction ?? 0.3);
  const holdSet = new Set(split.holdout);
  const trainBook = fullBook.filter((_, i) => !holdSet.has(i));
  const holdoutBook = fullBook.filter((_, i) => holdSet.has(i));

  log({ event: 'start', level: level.id, restarts, steps, book: fullBook.length, train: trainBook.length, holdout: holdoutBook.length, cores: os.cpus().length });
  await persist(runId, { status: 'running', body: { startedAt: new Date().toISOString(), restarts, steps, train: trainBook.length, holdout: holdoutBook.length } });

  const cfg = { steps, book: trainBook, match, masterSeed, reference };
  const t0 = performance.now();
  const results = await Promise.all(Array.from({ length: restarts }, (_, r) => runRestart(r, level, cfg)));
  results.sort((a, b) => b.champion.score - a.champion.score);
  const best = results[0];

  // Validate the best champion on the HELD-OUT openings (only if a restart actually
  // improved on train — champion.step === -1 means nothing beat the reference).
  let holdout = { verdict: 'skipped', elo: 0, n: 0, w: 0, d: 0, l: 0 };
  if (holdoutBook.length && best.champion.step >= 0) {
    const candidate = decodeWeights(best.champion.theta);
    let vs = null;
    let guard = 0;
    do {
      vs = validateStep(level, candidate, reference, holdoutBook, match, masterSeed + 12345, vs, DEFAULT_SPRT, 300);
      guard += 1;
    } while (!vs.done && guard < 305);
    holdout = { verdict: vs.sprt.verdict, elo: +vs.sprt.elo.toFixed(1), n: vs.gameIndex, w: vs.w, d: vs.d, l: vs.l };
  }

  const secs = (performance.now() - t0) / 1000;
  const summary = {
    event: 'done',
    secs: +secs.toFixed(1),
    best: { restart: best.r, trainScore: +best.champion.score.toFixed(4), step: best.champion.step },
    holdout,
    restarts: results.map((x) => ({ r: x.r, score: +x.champion.score.toFixed(4) })),
    championTheta: best.champion.theta,
  };
  log(summary);
  await persist(runId, { status: 'done', body: { finishedAt: new Date().toISOString(), secs: summary.secs, champion: best.champion, holdout, restarts: summary.restarts } });
  process.exit(0);
}

main().catch((e) => { log({ event: 'error', error: String(e && e.stack || e) }); process.exit(1); });

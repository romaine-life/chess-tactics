// Headless board-solver worker — the process a cluster Job runs on the trainer pool.
//
// Reads a SolveSpec (SOLVE_SPEC env JSON, or a solve_runs row via SOLVE_RUN_ID),
// estimates feasibility, runs a BOUNDED, ANYTIME solve of the level's game value
// (retrograde strong-solve when small enough, iterative-deepening search otherwise —
// runSolve dispatches on spec.mode), and reports progress + the final proven value —
// to stdout always (visible in `kubectl logs`), and to the solve_runs table when
// SOLVE_RUN_ID is set so the Run tab can read it back.
//
// The engine is the SAME pure, deterministic bundle the app and live AI use
// (frontend/trainer-bundle/engine.mjs, built by `npm run build:trainer`) — the exact
// relative specifier train-worker.mjs uses. No DOM, no server: a run-to-completion
// batch job. Progress is streamed by JSONB-patching the row body on a cadence; the
// partial body (tightening rootBounds + partial tablebase census) is the anytime
// guarantee — a cancel/budget/memory stop still leaves a well-formed result.
import { performance } from 'node:perf_hooks';
import { gzipSync } from 'node:zlib';
import { estimateFeasibility, runSolve } from '../frontend/trainer-bundle/engine.mjs';

const log = (o) => console.log(JSON.stringify({ t: new Date().toISOString(), ...o }));

// Default bounds when a spec omits them — matches the SolveRuns UI launch defaults
// (contract SolveBounds shape: ms + states + bytes; maxMemoryBytes set UNDER the 12Gi
// container limit so the self-check trips before an OOM-kill).
const DEFAULT_BOUNDS = { wallClockMs: 300_000, maxStates: 50_000_000, maxMemoryBytes: 8 * 2 ** 30 };
// Above this a serialized tablebase goes to blob (or is truncated when no sink is set),
// never into the JSONB row (ADR §5, the `body` JSONB growth guard).
const TB_INLINE_MAX_BYTES = 1_000_000;

async function loadSpec() {
  if (process.env.SOLVE_SPEC) return JSON.parse(process.env.SOLVE_SPEC);
  const runId = process.env.SOLVE_RUN_ID;
  if (!runId) throw new Error('set SOLVE_SPEC (json) or SOLVE_RUN_ID (solve_runs row id)');
  const { getTrainerPool } = await import('./train/db.mjs');
  const pool = getTrainerPool();
  if (!pool) throw new Error('SOLVE_RUN_ID set but no database configured');
  const { rows } = await pool.query('SELECT spec FROM solve_runs WHERE id = $1', [runId]);
  if (!rows.length) throw new Error(`solve_runs row ${runId} not found`);
  return rows[0].spec;
}

// Top-level-key body patch (never accumulate history arrays — each patch REPLACES the
// progress sub-keys), plus status. No-ops without a runId (the local smoke path).
async function persist(runId, patch) {
  if (!runId) return;
  try {
    const { getTrainerPool } = await import('./train/db.mjs');
    const pool = getTrainerPool();
    if (pool) await pool.query('UPDATE solve_runs SET body = body || $2::jsonb, status = $3, updated_at = now() WHERE id = $1', [runId, JSON.stringify(patch.body ?? {}), patch.status]);
  } catch (e) { log({ event: 'persist_error', error: String(e && e.message || e) }); }
}

/** Serialize a solved tablebase (proven positions → Value) to the format:'solver-tablebase-v1'
 * payload. NEW surface (nothing in the trainer produces this). The caller gzips + decides the
 * sink. When the engine did not expose an enumerable tablebase, emits the proven census +
 * root line as the summary payload. */
function serializeTablebase(result) {
  const payload = {
    format: 'solver-tablebase-v1',
    rootValue: result.rootValue,
    proven: result.proven,
    provenCount: result.provenCount,
    complete: result.complete,
    mode: result.mode,
    // The full entry map, when the engine attached one; else the proven summary alone.
    entries: Array.isArray(result.tablebaseEntries) ? result.tablebaseEntries : undefined,
  };
  return Buffer.from(JSON.stringify(payload), 'utf8');
}

/** Upload the gzipped tablebase to blob (SOLVE_ARTIFACTS_URL container) and return its URL.
 * Adapts the server.js lazy-import + DefaultAzureCredential pattern for a WRITER (needs the
 * Storage Blob Data Contributor role). Guarded by the caller: only reached when the container
 * URL is set — v1 ships blob-off, so the common path truncates instead. */
async function uploadTablebase(runId, gz) {
  const containerUrl = process.env.SOLVE_ARTIFACTS_URL;
  if (!containerUrl) throw new Error('SOLVE_ARTIFACTS_URL unset');
  const { BlobServiceClient } = await import('@azure/storage-blob');
  const { DefaultAzureCredential } = await import('@azure/identity');
  // SOLVE_ARTIFACTS_URL is a container-scoped URL (…/<account>.blob.core.windows.net/<container>).
  // BlobServiceClient takes the ACCOUNT url (protocol+host); the container name is the URL PATH —
  // the exact split server.js uses for the BGM container (getBgmContainerClient).
  const u = new URL(containerUrl);
  const svc = new BlobServiceClient(`${u.protocol}//${u.host}`, new DefaultAzureCredential());
  const containerClient = svc.getContainerClient(u.pathname.replace(/^\/+/, ''));
  const blobName = `solve/${runId}/tablebase.json.gz`;
  const block = containerClient.getBlockBlobClient(blobName);
  await block.uploadData(gz, { blobHTTPHeaders: { blobContentEncoding: 'gzip', blobContentType: 'application/json' } });
  return block.url;
}

// Decide the tablebase sink: inline (small), blob (big + sink configured), or truncate
// (big + no sink — v1 default). Returns the body fields to merge into the final `done` patch.
async function sinkTablebase(runId, result) {
  const buf = serializeTablebase(result);
  if (buf.length <= TB_INLINE_MAX_BYTES) {
    return { tablebase: JSON.parse(buf.toString('utf8')) };
  }
  if (process.env.SOLVE_ARTIFACTS_URL) {
    try {
      const gz = gzipSync(buf);
      const url = await uploadTablebase(runId, gz);
      return { tablebaseUrl: url, tablebase: { format: 'solver-tablebase-v1', bytes: gz.length, entries: result.provenCount } };
    } catch (e) {
      log({ event: 'tablebase_upload_failed', error: String(e && e.message || e) });
      // Fall through to truncation rather than fail the run.
    }
  }
  // No sink (or upload failed): keep the proven summary + root, drop the full entry map.
  return { tablebaseTruncated: true, tablebase: { format: 'solver-tablebase-v1', rootValue: result.rootValue, proven: result.proven, provenCount: result.provenCount } };
}

async function main() {
  const spec = await loadSpec();
  const runId = process.env.SOLVE_RUN_ID || null;
  const level = spec.level;
  if (!level) throw new Error('spec.level is required');
  const bounds = spec.bounds ?? DEFAULT_BOUNDS;
  const startedAt = new Date().toISOString();

  // (1) Feasibility FIRST — the instant, pre-commit read (verdict, est. states/memory,
  // recommended mode, en-passant refusal). Persisted before the heavy solve begins.
  const feasibility = estimateFeasibility(level);
  log({ event: 'feasibility', level: level.id, verdict: feasibility.verdict, recommendedMode: feasibility.recommendedMode, etaSeconds: feasibility.etaSeconds });
  // The mode the run will ACTUALLY dispatch on: runSolve re-derives it from
  // estimateFeasibility(level).recommendedMode (it takes no mode arg), so persisting
  // spec.mode here would drift from the done-patch's result.mode when a caller POSTs a
  // mismatched mode. Persist recommendedMode so the feasibility + done patches agree.
  await persist(runId, { status: 'running', body: { phase: 'feasibility', feasibility, startedAt, mode: feasibility.recommendedMode } });

  // (2) Anytime solve. onProgress patches the body on a THROTTLED cadence (≥ ~2.5s or a
  // large node stride) — top-level keys only, no accumulating arrays.
  const t0 = performance.now();
  let lastPatch = 0;
  let lastStates = 0;
  const onProgress = (p) => {
    const now = performance.now();
    if (now - lastPatch < 2500 && p.statesEnumerated - lastStates < 250_000) return;
    lastPatch = now;
    lastStates = p.statesEnumerated;
    void persist(runId, {
      status: 'running',
      body: {
        phase: p.phase,
        statesEnumerated: p.statesEnumerated,
        statesSolved: p.statesSolved,
        proven: p.proven,
        rootBounds: p.rootBounds,
        coveragePct: p.coveragePct,
        secs: p.secs,
        ...(p.depth != null ? { depth: p.depth } : {}),
        ...(p.sweep != null ? { sweep: p.sweep } : {}),
      },
    });
  };

  const result = runSolve(level, bounds, onProgress);
  const secs = +((performance.now() - t0) / 1000).toFixed(1);

  // (3) Tablebase sink decision (inline / blob / truncate) → body fields for the `done` patch.
  const tb = await sinkTablebase(runId, result);

  // (4) Final result — well-formed at ANY stop (budget/memory/cancel): complete=false + a
  // partial census + tightened rootBounds is the anytime guarantee.
  const summary = {
    event: 'done',
    secs,
    complete: result.complete,
    rootValue: result.rootValue,
    provenCount: result.provenCount,
    coveragePct: result.coveragePct,
    mode: result.mode,
  };
  log(summary);
  await persist(runId, {
    status: 'done',
    body: {
      finishedAt: new Date().toISOString(),
      secs,
      phase: 'done',
      complete: result.complete,
      rootValue: result.rootValue,
      rootBounds: result.rootBounds,
      proven: result.proven,
      provenCount: result.provenCount,
      coveragePct: result.coveragePct,
      pieceValues: result.pieceValues,
      mode: result.mode,
      ...tb,
    },
  });
  process.exit(0);
}

main().catch((e) => { log({ event: 'error', error: String(e && e.stack || e) }); process.exit(1); });

// Postgres-FREE, cluster-FREE smoke test for the board-solver worker (ADR-0068 Phase 3).
//
// Like netplay-smoke-test.js, this runs ANYWHERE in seconds: it drives the real
// solve-worker.mjs against a tiny hand-checkable level via SOLVE_SPEC (no SOLVE_RUN_ID,
// so persist() no-ops and no database is touched), then asserts the worker estimated
// feasibility, ran the bounded/anytime solve, logged a terminal `done` with a rootValue,
// and exited cleanly (code 0). The engine is imported from the built trainer bundle
// (frontend/trainer-bundle/engine.mjs) — the EXACT specifier the worker uses (F3) — so
// this also guards that the bundle exports estimateFeasibility/runSolve DOM-free.
//
// Run: `node solve-worker-smoke-test.js` (needs the trainer bundle built:
// `cd ../frontend && npm run build:trainer`). Wired into `npm test` after netplay.

const { spawn } = require('child_process');
const path = require('path');
const { pathToFileURL } = require('url');

const bundleUrl = pathToFileURL(path.join(__dirname, '..', 'frontend', 'trainer-bundle', 'engine.mjs')).href;

function fail(msg) { console.error(`solve-worker-smoke-test: FAIL — ${msg}`); process.exit(1); }

async function main() {
  let engine;
  try {
    engine = await import(bundleUrl);
  } catch (e) {
    fail(`could not import the trainer bundle (build it: cd frontend && npm run build:trainer)\n${e && e.stack || e}`);
  }
  if (typeof engine.estimateFeasibility !== 'function' || typeof engine.runSolve !== 'function') {
    fail('trainer bundle does not export estimateFeasibility/runSolve');
  }

  // Tiny hand-checkable board: a blank capture-all level (the player has no pieces) is a
  // proven LOSS for the player at ply 0 — a trivially strongly-solvable position. This
  // exercises feasibility → retrograde solve → terminal `done` end to end.
  const level = engine.createBlankLevel();
  level.id = 'solve-smoke';
  level.name = 'solve-smoke';
  const spec = {
    level,
    mode: 'retrograde',
    bounds: { wallClockMs: 10_000, maxStates: 1_000_000, maxMemoryBytes: 2 ** 30 },
  };

  const child = spawn(process.execPath, ['solve-worker.mjs'], {
    cwd: __dirname,
    env: { ...process.env, SOLVE_SPEC: JSON.stringify(spec) },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let out = '';
  child.stdout.on('data', (c) => { out += c.toString(); });
  child.stderr.on('data', (c) => { out += c.toString(); });

  const timer = setTimeout(() => { child.kill('SIGKILL'); fail(`worker did not finish within 30s\n${out}`); }, 30_000);

  const code = await new Promise((resolve) => child.on('exit', resolve));
  clearTimeout(timer);

  if (code !== 0) fail(`worker exited with code ${code}\n${out}`);

  // Parse the JSON log lines and find the terminal `done` record with a rootValue.
  const lines = out.split('\n').map((l) => l.trim()).filter(Boolean);
  const records = [];
  for (const l of lines) { try { records.push(JSON.parse(l)); } catch { /* non-json line */ } }
  const done = records.find((r) => r.event === 'done');
  if (!done) fail(`no \`done\` log record\n${out}`);
  if (!done.rootValue || typeof done.rootValue.outcome !== 'string') fail(`\`done\` record has no rootValue.outcome\n${out}`);
  if (done.rootValue.outcome === 'unknown') fail(`root value should be proven for this trivial board, got 'unknown'\n${out}`);

  console.log(`solve-worker-smoke-test: OK — feasibility + bounded solve verified with NO database (rootValue=${done.rootValue.outcome}${done.rootValue.winner ? `/${done.rootValue.winner}` : ''}, provenCount=${done.provenCount}).`);
  process.exit(0);
}

main().catch((e) => fail(String(e && e.stack || e)));

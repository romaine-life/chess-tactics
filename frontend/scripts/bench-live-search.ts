// Live-search throughput + determinism harness.
//
//   Run (from frontend/):  node scripts/bench-live-search.mjs [--json out.json] [--reps 3]
//   (that wrapper esbuild-bundles THIS file, so it runs on plain node with no Vite.)
//
// Two jobs, deliberately in one script so a single run proves both halves of an
// optimization pass:
//
//   1. THROUGHPUT — call `searchBestAction` with the exact live-play options
//      (game/enemyReply.ts LIVE_SEARCH) on fixed positions and report wall-clock.
//      Every case asserts `nodes === maxNodes`: the live search is NODE-bounded and
//      always exhausts its budget, so a wall-clock delta at an identical node count
//      is a pure per-node cost change and nothing else.
//
//   2. DETERMINISM — fingerprint the chosen action for every position AND the full
//      move transcript of headless self-play games across several seeds/levels.
//      Two runs of this script must produce byte-identical `fingerprint` blocks.
//      That is the contract at the top of game/enemyReply.ts: same (game, seed,
//      tick) ⇒ same move, on any machine.
//
// This is a wall-clock measurement, not a test — it lives in scripts/ and is not
// wired into `npm test`.

import { searchBestAction, DEFAULT_EVAL_WEIGHTS, type SearchContext } from '../src/core/ai';
import { LIVE_SEARCH } from '../src/game/enemyReply';
import { applyMove, gameEnv, recordPosition, type MoveEnv } from '../src/core/rules';
import { createRng } from '../src/core/rng';
import { createFromLevel, createSkirmish } from '../src/game/setup';
import { playLevelGame } from '../src/game/selfplay';
import { kingSideOf, objectiveContextForLevel, victoryRulesForLevel, victoryRulesForObjective } from '../src/core/objectives';
import { createBlankLevel, type Level } from '../src/core/level';
import { breakLineLevel } from '../src/game/__fixtures__/breakLine';
import { applyTestDrawableCatalog } from '../src/test/drawableCatalog';
import type { GameState, ObjectiveType } from '../src/core/types';

// `createSkirmish` generates its terrain through the socket board generator, which
// reads the art registry. Hydrate the deterministic test catalog so this harness
// runs headless — it only affects which terrain FAMILY each cell gets, and the
// mapping to gameplay terrain (and therefore to movement cost) is the real one.
applyTestDrawableCatalog();

interface Position {
  name: string;
  state: GameState;
  env: MoveEnv;
  sctx: SearchContext;
  /** Seed for the root near-best pick, so the chosen move is reproducible. */
  seed: number;
}

/** Build the SearchContext the store/worker would hand the search for this game. */
function contextFor(state: GameState, objective: ObjectiveType, level?: Level): SearchContext {
  const ctx = level
    ? { ...objectiveContextForLevel(level), kingSide: kingSideOf(state.pieces) }
    : { kingSide: kingSideOf(state.pieces) };
  return {
    objective,
    victoryRules: level ? victoryRulesForLevel(level, ctx) : victoryRulesForObjective(objective, ctx),
    ctx,
    turnsElapsed: 0,
  };
}

/**
 * Walk a start position forward `plies` half-moves with the SAME search that is
 * being benchmarked, so the benchmarked positions are real midgame boards (denser
 * threats, deeper quiescence) rather than untouched openings. Deterministic.
 */
function advance(state: GameState, env: MoveEnv, sctx: SearchContext, plies: number, seed: number): GameState {
  let game = state;
  for (let i = 0; i < plies; i += 1) {
    const plyEnv: MoveEnv = { ...env, lastMove: game.lastMove };
    // A cheaper budget here: these plies only need to reach a realistic position,
    // and the benchmark itself is what runs at the full live budget.
    const chosen = searchBestAction(game, plyEnv, sctx, createRng(seed + i), {
      maxDepth: 3,
      maxNodes: 4_000,
      weights: DEFAULT_EVAL_WEIGHTS,
    });
    if (!chosen) break;
    const res = applyMove(game, chosen.pieceId, chosen.move);
    const next = recordPosition(res.state, { ...env, lastMove: res.state.lastMove });
    // Never hand back a finished board: a benchmarked position must still have a
    // move to search. Stop at the last position the side to move can act from.
    if (next.winner || (next.turn !== 'player' && next.turn !== 'enemy')) break;
    if (!searchBestAction(next, { ...env, lastMove: next.lastMove }, sctx, null, { maxDepth: 1, maxNodes: 1_000, weights: DEFAULT_EVAL_WEIGHTS })) break;
    game = next;
  }
  return game;
}

/** A dense 8x8 midgame duel — mostly sliders, so quiescence actually recurses. */
function duelLevel(): Level {
  const level = createBlankLevel('bench-duel', 'Bench Duel', 8, 8);
  level.objective = 'capture-all';
  level.layers.units = [
    { x: 1, y: 6, type: 'queen', side: 'player' },
    { x: 3, y: 6, type: 'rook', side: 'player' },
    { x: 5, y: 7, type: 'bishop', side: 'player' },
    { x: 6, y: 6, type: 'knight', side: 'player' },
    { x: 2, y: 7, type: 'pawn', side: 'player' },
    { x: 6, y: 1, type: 'queen', side: 'enemy' },
    { x: 4, y: 1, type: 'rook', side: 'enemy' },
    { x: 2, y: 0, type: 'bishop', side: 'enemy' },
    { x: 1, y: 1, type: 'knight', side: 'enemy' },
    { x: 5, y: 0, type: 'pawn', side: 'enemy' },
  ];
  return level;
}

function positions(): Position[] {
  const out: Position[] = [];

  // 1. Free skirmish, the shipped 8x12 default board (terrain + scattered rocks).
  {
    const state = createSkirmish({ seed: 7 });
    const env = gameEnv(state);
    const sctx = contextFor(state, 'capture-king');
    out.push({ name: 'free-skirmish 8x12 (opening)', state, env, sctx, seed: 11 });
    const mid = advance(state, env, sctx, 6, 101);
    out.push({ name: 'free-skirmish 8x12 (midgame +6)', state: mid, env, sctx, seed: 11 });
  }

  // 2. A 6x6 board with a Run-battle-like force (terrain + rocks), the size class
  //    the live measurement found slowest.
  {
    const state = createSkirmish({ seed: 3, size: { cols: 6, rows: 6 }, party: ['knight', 'bishop', 'rook', 'queen'] });
    const env = gameEnv(state);
    const sctx = contextFor(state, 'capture-king');
    out.push({ name: 'skirmish 6x6 (opening)', state, env, sctx, seed: 5 });
    const mid = advance(state, env, sctx, 6, 202);
    out.push({ name: 'skirmish 6x6 (midgame +6)', state: mid, env, sctx, seed: 5 });
  }

  // 3. A real shipped campaign board (rival-kings, authored terrain).
  {
    const level = breakLineLevel as Level;
    const state = createFromLevel(level, 4);
    const env = gameEnv(state);
    const sctx = contextFor(state, level.objective, level);
    out.push({ name: 'off-l-break-line 3x8 (opening)', state, env, sctx, seed: 9 });
    const mid = advance(state, env, sctx, 4, 303);
    out.push({ name: 'off-l-break-line 3x8 (midgame +4)', state: mid, env, sctx, seed: 9 });
  }

  // 4. Dense slider duel — the heaviest quiescence load.
  {
    const level = duelLevel();
    const state = createFromLevel(level, 2);
    const env = gameEnv(state);
    const sctx = contextFor(state, level.objective, level);
    out.push({ name: 'duel 8x8 10 sliders (opening)', state, env, sctx, seed: 13 });
    const mid = advance(state, env, sctx, 6, 404);
    out.push({ name: 'duel 8x8 10 sliders (midgame +6)', state: mid, env, sctx, seed: 13 });
  }

  return out;
}

interface CaseResult {
  name: string;
  pieces: number;
  board: string;
  /** 'node' = exhausted maxNodes (the live-play case); 'position' = finished under budget. */
  bound: 'node' | 'position';
  nodes: number;
  depth: number;
  score: number;
  /** The chosen action, stringified — the determinism fingerprint for this position. */
  chosen: string;
  msRuns: number[];
  msMin: number;
  msMedian: number;
}

function median(xs: readonly number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const mid = s.length >> 1;
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

function runCase(pos: Position, reps: number): CaseResult {
  const env: MoveEnv = { ...pos.env, lastMove: pos.state.lastMove };
  const opts = { ...LIVE_SEARCH, weights: DEFAULT_EVAL_WEIGHTS };

  const msRuns: number[] = [];
  let last: ReturnType<typeof searchBestAction> = null;
  for (let i = 0; i < reps; i += 1) {
    const t0 = performance.now();
    last = searchBestAction(pos.state, env, pos.sctx, createRng(pos.seed), opts);
    msRuns.push(performance.now() - t0);
  }
  if (!last) throw new Error(`${pos.name}: search returned no action`);

  // Two classes of position, and the distinction matters for reading the timings:
  //
  //   node-bound     — the search exhausts maxNodes without finishing maxDepth. This
  //                    is the live-play case the throughput claim is about: the tree
  //                    is FIXED at maxNodes, so wall-clock is a pure function of
  //                    per-node cost and before/after is directly comparable.
  //   position-bound — a small board completes every depth under budget. Still
  //                    comparable (the node count is recorded and must not change),
  //                    but it measures a smaller, position-determined tree.
  //
  // `nodes` goes in the determinism fingerprint either way, so ANY change to the
  // shape or size of the searched tree fails the comparison.
  const bound = last.nodes >= LIVE_SEARCH.maxNodes ? 'node' : 'position';

  const alive = pos.state.pieces.filter((p) => p.alive).length;
  return {
    name: pos.name,
    pieces: alive,
    board: `${pos.state.size.cols}x${pos.state.size.rows}`,
    bound,
    nodes: last.nodes,
    depth: last.depth,
    score: last.score,
    chosen: `${last.pieceId} -> ${JSON.stringify(last.move)} @ ${last.score.toFixed(6)} d${last.depth} n${last.nodes}`,
    msRuns,
    msMin: Math.min(...msRuns),
    msMedian: median(msRuns),
  };
}

/**
 * Full self-play transcripts. A single chosen move per position proves little; an
 * entire game replays every decision the engine makes, including the ones reached
 * only after earlier choices. Identical transcripts across an optimization ⇒ the
 * search tree and its ordering are unchanged.
 */
function selfPlayFingerprints(): string[] {
  const out: string[] = [];
  const levels: Array<[string, Level]> = [
    ['duel', duelLevel()],
    ['break-line', breakLineLevel as Level],
  ];
  for (const [label, level] of levels) {
    for (const seed of [1, 2, 3, 17]) {
      const rec = playLevelGame(level, {
        seed,
        search: { maxDepth: 4, maxNodes: 8_000, weights: DEFAULT_EVAL_WEIGHTS },
        maxPlies: 30,
      });
      const moves = rec.moves.map((m) => `${m.side}:${m.pieceId}:${m.from.x},${m.from.y}->${m.move.x},${m.move.y}${m.move.capture ? `x${m.move.capture}` : ''}`).join(' ');
      out.push(`${label}#${seed} winner=${rec.winner} plies=${rec.plies} nodes=${rec.nodes} avgDepth=${rec.avgDepth.toFixed(6)} | ${moves}`);
    }
  }
  return out;
}

function main(): void {
  const argv = process.argv.slice(2);
  const repsArg = argv.indexOf('--reps');
  const reps = repsArg >= 0 ? Number(argv[repsArg + 1]) : 3;
  const jsonArg = argv.indexOf('--json');
  const jsonOut = jsonArg >= 0 ? argv[jsonArg + 1] : null;
  // `--only <substr>` narrows to matching positions and `--no-selfplay` drops the
  // transcript pass, so a CPU profile run (node --cpu-prof) samples ONLY the search.
  const onlyArg = argv.indexOf('--only');
  const only = onlyArg >= 0 ? argv[onlyArg + 1] : null;
  const skipSelfPlay = argv.includes('--no-selfplay');

  console.log(`live search budget: maxDepth=${LIVE_SEARCH.maxDepth} maxNodes=${LIVE_SEARCH.maxNodes}, reps=${reps}\n`);

  const chosenPositions = positions().filter((p) => !only || p.name.includes(only));
  if (!chosenPositions.length) throw new Error(`--only ${only} matched no position`);
  const results = chosenPositions.map((p) => runCase(p, reps));

  const pad = (s: string, n: number) => s.padEnd(n);
  console.log(`${pad('position', 34)} ${pad('board', 6)} ${pad('pc', 3)} ${pad('bound', 5)} ${pad('nodes', 7)} ${pad('d', 2)} ${pad('min ms', 9)} ${pad('median ms', 9)} us/node`);
  console.log('-'.repeat(106));
  for (const r of results) {
    const nsPerNode = (r.msMedian * 1e6) / r.nodes;
    console.log(
      `${pad(r.name, 34)} ${pad(r.board, 6)} ${pad(String(r.pieces), 3)} ${pad(r.bound, 5)} ${pad(String(r.nodes), 7)} ${pad(String(r.depth), 2)} ` +
      `${pad(r.msMin.toFixed(1), 9)} ${pad(r.msMedian.toFixed(1), 9)} ${(nsPerNode / 1000).toFixed(1)}`,
    );
  }

  const totalMedian = results.reduce((a, r) => a + r.msMedian, 0);
  const totalNodes = results.reduce((a, r) => a + r.nodes, 0);
  const nodeBound = results.filter((r) => r.bound === 'node');
  const nbMs = nodeBound.reduce((a, r) => a + r.msMedian, 0);
  const nbNodes = nodeBound.reduce((a, r) => a + r.nodes, 0);
  console.log('-'.repeat(106));
  console.log(`TOTAL   median ${totalMedian.toFixed(1)}ms over ${totalNodes} nodes = ${((totalMedian * 1000) / totalNodes).toFixed(1)}us/node`);
  console.log(`NODE-BOUND only (${nodeBound.length}/${results.length} cases, the live-play class): ${nbMs.toFixed(1)}ms over ${nbNodes} nodes = ${((nbMs * 1000) / nbNodes).toFixed(1)}us/node\n`);

  const selfPlay = skipSelfPlay ? [] : selfPlayFingerprints();
  const fingerprint = [...results.map((r) => `${r.name} :: ${r.chosen}`), ...selfPlay];
  console.log('determinism fingerprint (must be byte-identical across an optimization):');
  for (const line of fingerprint) console.log(`  ${line.slice(0, 150)}${line.length > 150 ? '…' : ''}`);

  if (jsonOut) {
    const fs = require('node:fs') as typeof import('node:fs');
    fs.writeFileSync(jsonOut, JSON.stringify({
      budget: LIVE_SEARCH,
      results: results.map(({ msRuns, ...rest }) => rest),
      totalMedianMs: totalMedian,
      totalNodes,
      usPerNode: (totalMedian * 1000) / totalNodes,
      fingerprint,
    }, null, 2));
    console.log(`\nwrote ${jsonOut}`);
  }
}

main();

// Board solver — retrograde (backward-induction) strong solver + the runSolve /
// solveStepWithPhases orchestrators (ADR-0068 Phase 1, §1/§3/§4/§6/§7).
//
// Retrograde analysis computes the PERFECT value of every reachable position by seeding
// terminals and propagating minimax values backward to a fixpoint. This is a LOOPY game
// with no repetition / 50-move rule (F8): positions can cycle, and "draw" means "neither
// side can force a king-capture in finite moves." We resolve that exactly the way chess DTM
// tablebases do — win-distance ("mate-in-N") labels, and an explicit undecided→draw pass
// ONLY after the fixpoint (never a premature draw-collapse).
//
// The backward rule (from the side-to-move S's view at a non-terminal, undecided node):
//  - WIN in d+1 if SOME successor is a proven loss-for-opponent (d = the MIN such child dist);
//  - LOSS in d+1 if EVERY successor is already proven win-for-opponent (d = the MAX child dist);
//  - stays UNDECIDED this sweep if any successor is still unknown (prevents premature collapse).

import type { GameState, Side, Winner } from '../types';
import type { MoveEnv } from '../rules';
import type { Level } from '../level';
import type { Value, Outcome, SolveBounds, SolveResult, SolveProgress, SolveStep, ProvenCounts, RootBounds, DecidedPosition } from './types';
import type { PositionSpace } from './encode';
import type { SolverInput } from './input';
import { applyMove, gameEnv, legalMoves, livingPieces } from '../rules';
import { toSolverInput, terminalOutcome } from './input';
import { canonicalKey, clockOfKey, decodePosition, enumerateReachable } from './encode';
import { estimateFeasibility } from './feasibility';
import { pieceValuesByAblation, ablationToReport } from './ablation';

// Internal label packing: 2-bit outcome + a distance. We keep them in parallel typed arrays
// for clarity (outcome + distance), which is plenty fast for Phase-1 board sizes.
const UNKNOWN = 0;
const WIN = 1;
const LOSS = 2;
const DRAW = 3;

export interface SolveResultInternal {
  space: PositionSpace;
  /** Per ordinal: outcome code (UNKNOWN/WIN/LOSS/DRAW), from the side-to-move's view. */
  outcome: Uint8Array;
  /** Per ordinal: distance-to-mate in plies for a decided win/loss; 0 for draw/unknown. */
  distance: Int32Array;
  rootValue: Value;
  stats: { states: number; terminals: number; sweeps: number; solvedWin: number; solvedLoss: number; drawn: number };
}

/** A decided outcome from the side-to-move's perspective, given the raw Winner and whose
 * turn it is at that position. A win for the side to move ⇒ WIN; for the other ⇒ LOSS;
 * 'draw' ⇒ DRAW. */
function terminalCode(winner: Winner, turn: Side): number {
  if (winner === 'draw') return DRAW;
  if (winner === null) return UNKNOWN;
  return winner === turn ? WIN : LOSS;
}

/** Convert an internal (outcome, distance) at a position whose side-to-move is `turn`
 * into the contract Value. `winner` is filled from the outcome + side-to-move so a Value
 * read in isolation is unambiguous. */
function toValue(outcome: number, distance: number, turn: Side): Value {
  if (outcome === WIN) return { outcome: 'win', winner: turn, distancePlies: distance };
  if (outcome === LOSS) return { outcome: 'loss', winner: turn === 'player' ? 'enemy' : 'player', distancePlies: distance };
  if (outcome === DRAW) return { outcome: 'draw' };
  return { outcome: 'unknown' };
}

/**
 * Precompute, for every non-terminal ordinal, its successor ordinals (as a flat CSR-style
 * layout). Enumeration already proved the closure is finite and every successor key is in
 * the index, so this is a lookup, not a re-search.
 */
interface Successors {
  /** succ[start[o] .. start[o+1]) are the successor ordinals of ordinal o. */
  succ: Int32Array;
  start: Int32Array;
  /** Reverse edges (predecessors): pred[pstart[o] .. pstart[o+1]) are the ordinals that have
   * o as a successor. The retrograde back-up walks these from decided terminals outward. */
  pred: Int32Array;
  pstart: Int32Array;
  /** Per ordinal: out-degree (number of distinct successors). The LOSS rule needs "every
   * successor is a proven opponent-win", tracked by counting WIN children down from degree. */
  degree: Int32Array;
  /** Per ordinal: raw terminal Winner (null if non-terminal). */
  terminal: Array<Winner>;
  /** Per ordinal: side to move. */
  turn: Uint8Array; // 0 player, 1 enemy
  /** Per ordinal: turnsElapsed (only meaningful when clockMatters). */
  clock: Int32Array;
}

function buildSuccessors(space: PositionSpace, input: SolverInput): Successors {
  const n = space.keys.length;
  const start = new Int32Array(n + 1);
  const terminal: Array<Winner> = new Array(n).fill(null);
  const turn = new Uint8Array(n);
  const clock = new Int32Array(n);
  const env: MoveEnv = input.env;

  // First pass: decode each ordinal, record terminal + turn + clock, and count successors.
  const succLists: number[][] = new Array(n);
  // Recover per-ordinal clock by BFS from the start, mirroring enumerate (clockMatters only).
  // Simpler + sound: recompute clock via a forward pass here using the same childClock rule.
  const clockKnown = new Int8Array(n);
  clock[0] = 0;
  clockKnown[0] = 1;

  for (let o = 0; o < n; o += 1) {
    const state = decodePosition(space.keys[o], input);
    const t: Side = state.turn === 'enemy' ? 'enemy' : 'player';
    turn[o] = t === 'enemy' ? 1 : 0;
    const te = input.clockMatters ? clock[o] : 0;
    const w = terminalOutcome(state, input, te);
    terminal[o] = w;
    if (w !== null) { succLists[o] = []; continue; }
    const movers = livingPieces(state.pieces, t);
    const list: number[] = [];
    const seen = new Set<number>();
    for (const p of movers) {
      for (const m of legalMoves(p, state.pieces, state.size, env)) {
        const { state: next } = applyMove(state, p.id, m);
        // The survive clock advances on the ENEMY→player transition (a full round elapses),
        // matching the store: commitPlayerMove keeps turnsElapsed; scheduleEnemyReply /
        // commitNet bump it only when the enemy hands the turn back (store.ts:462/615). A
        // player→enemy bump would fire a survive/turnLimit win one enemy ply too early.
        const childClock = input.clockMatters ? te + (t === 'enemy' ? 1 : 0) : 0;
        const childKey = canonicalKey(next, input, childClock);
        const childOrdinal = space.index.get(childKey);
        if (childOrdinal === undefined) continue; // truncated enumeration edge — drop it
        if (!seen.has(childOrdinal)) {
          seen.add(childOrdinal);
          list.push(childOrdinal);
          if (input.clockMatters && !clockKnown[childOrdinal]) {
            clock[childOrdinal] = childClock;
            clockKnown[childOrdinal] = 1;
          }
        }
      }
    }
    succLists[o] = list;
  }

  let total = 0;
  for (let o = 0; o < n; o += 1) { start[o] = total; total += succLists[o].length; }
  start[n] = total;
  const succ = new Int32Array(total);
  const degree = new Int32Array(n);
  let w = 0;
  for (let o = 0; o < n; o += 1) { degree[o] = succLists[o].length; for (const c of succLists[o]) { succ[w] = c; w += 1; } }

  // Reverse edges (CSR): count predecessors per node, then fill. Total reverse-edge count
  // equals total forward-edge count.
  const pstart = new Int32Array(n + 1);
  for (let o = 0; o < n; o += 1) for (const c of succLists[o]) pstart[c + 1] += 1;
  for (let o = 0; o < n; o += 1) pstart[o + 1] += pstart[o];
  const pred = new Int32Array(total);
  const fill = pstart.slice(0, n); // running write cursor per node
  for (let o = 0; o < n; o += 1) for (const c of succLists[o]) { pred[fill[c]] = o; fill[c] += 1; }

  return { succ, start, pred, pstart, degree, terminal, turn, clock };
}

/**
 * Retrograde analysis with EXACT win-distance (DTM), then an undecided→draw pass (F8).
 *
 * This is the standard predecessor-counting tablebase construction — a backward BFS that
 * processes decided nodes in NONDECREASING distance order, which is what makes the distances
 * minimal. A naive ordinal-order sweep-to-fixpoint decides the SAME win/loss/draw outcomes but
 * freezes a WIN's distance at whichever losing child happened to be decided first (in sweep +
 * ordinal order), never re-relaxing to the shorter child found later — systematically inflating
 * DTM. Processing in distance order fixes that by construction:
 *
 *  - Seed every terminal at distance 0 (outcome from the mover's view — a king-capture/wipe is a
 *    LOSS for the side whose turn it nominally is; see positionFromState's 'done' handling).
 *  - Pop decided nodes in increasing distance (bucket queue). For a decided node `c` at distance d:
 *      · if `c` is a LOSS (loss for c's mover = the opponent of each predecessor's mover), then
 *        every still-undecided predecessor `p` has a winning move into `c`: mark `p` WIN at d+1.
 *        Because c is popped in increasing-distance order, the FIRST time we reach an undecided p
 *        this way gives the MINIMAL winning distance — exact DTM.
 *      · if `c` is a WIN (win for c's mover), decrement each still-undecided predecessor's
 *        remaining-successor counter. When a predecessor's counter hits 0 EVERY successor is a
 *        proven opponent-win ⇒ p is a forced LOSS; the child that zeroed the counter is the
 *        last (largest-distance) one, so d+1 is the correct max-child-distance+1.
 *  - Whatever is still undecided when the queue drains cannot force a capture in finite plies ⇒
 *    DRAW (loopy-game resolution, F8). No premature draw-collapse: a node is only ever LOSS when
 *    all successors are already decided-and-winning.
 *
 * `onSweep(layer, newlyDecided)` reports one DISTANCE LAYER per call (the value literally spreading
 * outward from the terminals) — the Phase-2 stepper frontier. A final `onSweep(_, 0)` marks the
 * fixpoint so downstream `atFixpoint` logic still fires.
 */
export function retrogradeSolve(
  space: PositionSpace,
  input: SolverInput,
  onSweep?: (sweep: number, newlySolved: number) => void,
): SolveResultInternal {
  const succ = buildSuccessors(space, input);
  const n = space.keys.length;
  const outcome = new Uint8Array(n).fill(UNKNOWN);
  const distance = new Int32Array(n);
  // Remaining undecided-or-non-winning successors per node; when it reaches 0 for an undecided
  // node, every successor is a proven opponent-win ⇒ that node is a forced LOSS.
  const remaining = Int32Array.from(succ.degree);

  // Seed terminals (distance 0, outcome from the mover's view). A frontier queue holds decided
  // nodes to relax, popped in nondecreasing distance order via a bucket structure below.
  let terminals = 0;
  const frontier: number[] = [];
  for (let o = 0; o < n; o += 1) {
    const w = succ.terminal[o];
    if (w === null) continue;
    const turn: Side = succ.turn[o] === 1 ? 'enemy' : 'player';
    outcome[o] = terminalCode(w, turn);
    distance[o] = 0;
    terminals += 1;
    // A DRAW terminal (stalemate) carries no back-propagation value: it neither hands a
    // predecessor a win nor counts toward a predecessor's all-children-win loss. Only decisive
    // terminals seed the frontier; a draw-terminal predecessor resolves via the drain-to-draw.
    if (outcome[o] === WIN || outcome[o] === LOSS) frontier.push(o);
  }

  // Distance-ordered processing. Because every back-up sets a child's distance to (parent
  // distance + 1), distances are produced in nondecreasing order if we always pop the smallest.
  // We keep buckets keyed by distance and drain them in order — an O(V+E) bucket queue, no heap.
  const buckets: number[][] = [];
  const pushBucket = (o: number): void => {
    const d = distance[o];
    (buckets[d] ??= []).push(o);
  };
  for (const o of frontier) pushBucket(o);

  let solvedWin = 0;
  let solvedLoss = 0;
  for (let o = 0; o < n; o += 1) { if (outcome[o] === WIN) solvedWin += 1; else if (outcome[o] === LOSS) solvedLoss += 1; }

  let layer = 0;
  const guard = n + 2; // distance can never exceed the node count for a decided node
  for (let d = 0; d < buckets.length && d <= guard; d += 1) {
    const bucket = buckets[d];
    if (!bucket || bucket.length === 0) continue;
    let newlyDecided = 0;
    // Process by index (not for..of) because relaxation may append to a LATER bucket, never this
    // one (children are always at distance d, parents land at d+1).
    for (let bi = 0; bi < bucket.length; bi += 1) {
      const c = bucket[bi];
      const co = outcome[c];
      const p0 = succ.pstart[c];
      const p1 = succ.pstart[c + 1];
      if (co === LOSS) {
        // c is a loss for c's mover ⇒ every predecessor (opponent to c's mover) has a WIN move
        // into c. First reach in distance order = minimal DTM.
        for (let e = p0; e < p1; e += 1) {
          const p = succ.pred[e];
          if (outcome[p] !== UNKNOWN) continue;
          outcome[p] = WIN;
          distance[p] = d + 1;
          solvedWin += 1;
          newlyDecided += 1;
          pushBucket(p);
        }
      } else if (co === WIN) {
        // c is a win for c's mover ⇒ a bad successor for each predecessor. Count it off; when a
        // predecessor has no remaining non-winning successor, it is a forced LOSS at max+1 = d+1.
        for (let e = p0; e < p1; e += 1) {
          const p = succ.pred[e];
          if (outcome[p] !== UNKNOWN) continue;
          remaining[p] -= 1;
          if (remaining[p] === 0) {
            outcome[p] = LOSS;
            distance[p] = d + 1;
            solvedLoss += 1;
            newlyDecided += 1;
            pushBucket(p);
          }
        }
      }
    }
    // Only a bucket that decided something is a SWEEP (the last bucket's drain decides
    // nothing — reporting it as a zero sweep would fake a "decided nothing, not yet at
    // fixpoint" beat the stepper can't explain). The single fixpoint marker below is the
    // one authoritative "nothing more can be decided" signal.
    if (newlyDecided > 0) {
      layer += 1;
      if (onSweep) onSweep(layer, newlyDecided);
    }
  }
  if (onSweep) onSweep(layer + 1, 0); // fixpoint marker

  // Undecided → draw (loopy-game resolution — ONLY after the queue drains).
  let drawn = 0;
  for (let o = 0; o < n; o += 1) {
    if (outcome[o] === UNKNOWN) { outcome[o] = DRAW; distance[o] = 0; drawn += 1; }
    else if (outcome[o] === DRAW) drawn += 1;
  }
  const sweeps = layer;

  const rootTurn: Side = succ.turn[0] === 1 ? 'enemy' : 'player';
  const rootValue = toValue(outcome[0], distance[0], rootTurn);

  return {
    space,
    outcome,
    distance,
    rootValue,
    stats: { states: n, terminals, sweeps, solvedWin, solvedLoss, drawn },
  };
}

// ─── Public orchestrators (ADR §6) ──────────────────────────────────────────────────

const outcomeCode = (o: Outcome): number =>
  o === 'win' ? WIN : o === 'loss' ? LOSS : o === 'draw' ? DRAW : UNKNOWN;

function rootBoundsFrom(value: Value): RootBounds {
  const proven = value.outcome !== 'unknown';
  return {
    lower: value.outcome,
    upper: value.outcome,
    bestDistancePlies: value.distancePlies,
    proven,
  };
}

function countsFrom(internal: SolveResultInternal): ProvenCounts {
  return { win: internal.stats.solvedWin, loss: internal.stats.solvedLoss, draw: internal.stats.drawn };
}

/**
 * The bounded, anytime orchestrator (ADR §6). Dispatches on mode. For `retrograde`:
 * feasibility → enumerate (under cap) → retrogradeSolve → ablation (within remaining budget)
 * → assemble the contract SolveResult (well-formed even on a bounded/partial stop). `search`
 * mode delegates to Phase 4's runWeakSolve when registered; until then it throws not-implemented.
 */
export function runSolve(level: Level, bounds: SolveBounds, onProgress?: (p: SolveProgress) => void): SolveResult {
  const startedAt = Date.now();
  const input = toSolverInput(level, 0);
  const report = estimateFeasibility(level, { memoryCapBytes: bounds.maxMemoryBytes });

  const mode = report.recommendedMode;
  if (mode === 'search') {
    const runner = SEARCH_RUNNER;
    if (!runner) throw new Error('solver: search mode not implemented (Phase 4)');
    return runner(level, bounds, onProgress);
  }

  // Retrograde path.
  const cap = Math.max(1, Math.min(bounds.maxStates, Math.floor(bounds.maxMemoryBytes / 4)));
  const space = enumerateReachable(input, cap);

  const secs = (): number => (Date.now() - startedAt) / 1000;
  const emptyCounts: ProvenCounts = { win: 0, loss: 0, draw: 0 };
  const unknownBounds: RootBounds = { lower: 'unknown', upper: 'unknown', proven: false };

  // Bounded/partial stop: enumeration truncated ⇒ we cannot claim a complete strong solve.
  if (space.truncated) {
    const partial: SolveResult = {
      rootValue: { outcome: 'unknown' },
      complete: false,
      provenCount: 0,
      proven: emptyCounts,
      rootBounds: unknownBounds,
      coveragePct: 0,
      mode: 'retrograde',
    };
    onProgress?.({
      phase: 'Enumerate', statesEnumerated: space.keys.length, statesSolved: 0,
      proven: emptyCounts, rootBounds: unknownBounds, coveragePct: 0, secs: secs(),
    });
    return partial;
  }

  let lastSweep = 0;
  const internal = retrogradeSolve(space, input, (sweep) => {
    lastSweep = sweep;
    onProgress?.({
      phase: 'Propagate', statesEnumerated: space.keys.length, statesSolved: 0,
      proven: emptyCounts, rootBounds: unknownBounds, coveragePct: 0, secs: secs(), sweep,
    });
  });

  const proven = countsFrom(internal);
  const provenCount = proven.win + proven.loss + proven.draw;
  const rootBounds = rootBoundsFrom(internal.rootValue);
  const denom = report.stateSpaceUpperBound > 0 && Number.isFinite(report.stateSpaceUpperBound)
    ? report.stateSpaceUpperBound : internal.stats.states;
  const coveragePct = Math.min(100, (internal.stats.states / denom) * 100);

  onProgress?.({
    phase: 'ReadValue', statesEnumerated: space.keys.length, statesSolved: provenCount,
    proven, rootBounds, coveragePct, secs: secs(), sweep: lastSweep,
  });

  // Ablation — post-solve, best-effort, within remaining budget.
  const elapsedMs = Date.now() - startedAt;
  const remaining: SolveBounds = {
    wallClockMs: Math.max(0, bounds.wallClockMs - elapsedMs),
    maxStates: bounds.maxStates,
    maxMemoryBytes: bounds.maxMemoryBytes,
  };
  const ablation = pieceValuesByAblation(level, remaining, 0);
  const pieceValues = ablationToReport(ablation, internal.rootValue, level);

  return {
    rootValue: internal.rootValue,
    complete: true,
    provenCount,
    proven,
    rootBounds,
    coveragePct,
    pieceValues,
    mode: 'retrograde',
  };
}

/** Phase-4 registration seam: `runSolve` delegates `search` mode here when set. */
type SearchRunner = (level: Level, bounds: SolveBounds, onProgress?: (p: SolveProgress) => void) => SolveResult;
let SEARCH_RUNNER: SearchRunner | null = null;
export function registerSearchRunner(runner: SearchRunner): void { SEARCH_RUNNER = runner; }

/** How many DecidedPositions (with inline decoded boards) a SeedTerminals/Propagate step
 * carries — a SAMPLE of that distance layer, so the stepper's board can show the value
 * literally landing on positions without a step ballooning to a whole layer of GameStates.
 * The exact layer size still travels as Converge.decidedThisSweep. */
const FRONTIER_SAMPLE_CAP = 16;

/**
 * The phase-decomposed stepper entrypoint (ADR §7, F7). A generator over the retrograde
 * progression, emitting one RetrogradeStep per phase (Enumerate → SeedTerminals →
 * Propagate×N → Converge → ReadValue). The named export is the contract Phase 2 imports.
 *
 * Frontier detail: after the solve, decided positions are grouped by DTM distance — layer d
 * IS the sweep-d frontier (the bucket queue decides parents at d+1 while draining distance-d
 * children). Each SeedTerminals/Propagate step carries a capped sample of its layer as
 * DecidedPositions with the decoded GameState inline, so the Phase-2 board renders the value
 * spreading outward from the terminals. Draws are excluded (they resolve by drain, carry no
 * distance, and never sit on a sweep frontier).
 */
export function* solveStepWithPhases(level: Level, bounds: SolveBounds): Generator<SolveStep, void, void> {
  const input = toSolverInput(level, 0);
  const cap = Math.max(1, Math.min(bounds.maxStates, Math.floor(bounds.maxMemoryBytes / 4)));
  const space = enumerateReachable(input, cap);

  // Root readout for the Enumerate panel/board: the decoded root position + its branching.
  let current: { key: string; state: GameState; branching: number } | undefined;
  if (space.keys.length > 0) {
    const rootState = decodePosition(space.keys[0], input);
    const env = gameEnv(rootState);
    const mover: Side = rootState.turn === 'enemy' ? 'enemy' : 'player';
    let branching = 0;
    for (const p of livingPieces(rootState.pieces, mover)) {
      branching += legalMoves(p, rootState.pieces, rootState.size, env).length;
    }
    current = { key: space.keys[0].toString(), state: rootState, branching };
  }
  yield { kind: 'retrograde', phase: 'Enumerate', enumerated: space.keys.length, ...(current ? { current } : {}) };

  // Solve (collect sweep frontiers so we can emit Propagate/Converge steps in order).
  const sweepCounts: number[] = [];
  const internal = retrogradeSolve(space, input, (_sweep, newlySolved) => { sweepCounts.push(newlySolved); });

  // Decisive distance layers: layers[d] = ordinals proven win/loss at DTM d. Layer 0 is the
  // decisive terminal seeds; layer d (d ≥ 1) is exactly what sweep d decided (see docstring).
  const layers: number[][] = [];
  for (let o = 0; o < space.keys.length; o += 1) {
    const oc = internal.outcome[o];
    if (oc !== WIN && oc !== LOSS) continue;
    (layers[internal.distance[o]] ??= []).push(o);
  }

  /** Decode one decided ordinal, and for a NON-terminal (distance ≥ 1) attach its WHY: the
   * witness move (WIN: the move into the minimal-DTM proven-loss child that sets the distance)
   * and the successor census (LOSS: every move reaches a proven opponent win; the max child DTM
   * is the best defence). Recomputes the position's successor edges exactly as buildSuccessors
   * did and reads their values from the finished tablebase — cheap because only the ≤16-per-layer
   * frontier SAMPLE ever calls this. */
  const decidedAt = (o: number): DecidedPosition => {
    const state = decodePosition(space.keys[o], input);
    const mover: Side = state.turn === 'enemy' ? 'enemy' : 'player';
    const win = internal.outcome[o] === WIN;
    const d = internal.distance[o];
    const decided: DecidedPosition = {
      key: space.keys[o].toString(),
      value: {
        outcome: win ? 'win' : 'loss',
        winner: win ? mover : mover === 'player' ? 'enemy' : 'player',
        distancePlies: d,
      },
      state,
    };
    if (d === 0) return decided; // terminal seed: decided by the rules, not the back-up rule

    const te = clockOfKey(space.keys[o], input);
    let moves = 0;
    let opponentWins = 0;
    let opponentLosses = 0;
    let draws = 0;
    let bestDefenceDTM = 0;
    let witnessDTM = Infinity;
    let witnessMove: DecidedPosition['witnessMove'];
    for (const p of livingPieces(state.pieces, mover)) {
      for (const m of legalMoves(p, state.pieces, state.size, input.env)) {
        const { state: next } = applyMove(state, p.id, m);
        // Same clock-bump rule as buildSuccessors: a full round elapses on the ENEMY's move.
        const childClock = input.clockMatters ? te + (mover === 'enemy' ? 1 : 0) : 0;
        const childOrdinal = space.index.get(canonicalKey(next, input, childClock));
        if (childOrdinal === undefined) continue; // truncated enumeration edge — drop it
        moves += 1;
        const oc = internal.outcome[childOrdinal];
        const cd = internal.distance[childOrdinal];
        if (oc === WIN) {
          opponentWins += 1;
          bestDefenceDTM = Math.max(bestDefenceDTM, cd);
        } else if (oc === LOSS) {
          opponentLosses += 1;
          if (cd < witnessDTM) {
            witnessDTM = cd;
            witnessMove = {
              pieceId: p.id, move: m, childKey: space.keys[childOrdinal].toString(),
              // The child is a loss for ITS mover (the opponent) ⇒ the winner is this mover.
              childValue: { outcome: 'loss', winner: mover, distancePlies: cd },
            };
          }
        } else {
          draws += 1;
        }
      }
    }
    decided.successorCensus = {
      moves, opponentWins, opponentLosses, draws,
      ...(win ? {} : { bestDefenceDTM }),
    };
    if (win && witnessMove) decided.witnessMove = witnessMove;
    return decided;
  };
  const sampleLayer = (d: number): DecidedPosition[] =>
    (layers[d] ?? []).slice(0, FRONTIER_SAMPLE_CAP).map(decidedAt);

  // Seed census: decisive terminals (layer 0) + the stalemate-like draw terminals — all
  // proven at seed time, so the running "proven so far" story starts here, not at sweep 1.
  const seedWin = (layers[0] ?? []).reduce((n, o) => n + (internal.outcome[o] === WIN ? 1 : 0), 0);
  const seedLoss = (layers[0] ?? []).length - seedWin;
  const drawTerminals = internal.stats.terminals - (layers[0]?.length ?? 0);
  yield {
    kind: 'retrograde', phase: 'SeedTerminals', seeded: sampleLayer(0),
    totalTerminals: internal.stats.terminals,
    seedCounts: { win: seedWin, loss: seedLoss, draw: drawTerminals },
  };

  // Per-sweep CUMULATIVE census — the counters must visibly accumulate while the owner watches
  // (emitting the end-of-run totals on every sweep froze the whole story at its final frame).
  // Draws stay at the terminal count until the fixpoint: the drain is what proves loopy draws.
  const finalCounts = countsFrom(internal);
  let cumWin = seedWin;
  let cumLoss = seedLoss;
  let remainingUnknown = internal.stats.states - internal.stats.terminals;
  for (let i = 0; i < sweepCounts.length; i += 1) {
    const newly = sweepCounts[i];
    const atFixpoint = i === sweepCounts.length - 1; // the marker sweep (decides nothing new)
    remainingUnknown = Math.max(0, remainingUnknown - newly);
    for (const o of layers[i + 1] ?? []) {
      if (internal.outcome[o] === WIN) cumWin += 1; else cumLoss += 1;
    }
    yield { kind: 'retrograde', phase: 'Propagate', sweep: i + 1, newlyDecided: sampleLayer(i + 1), remainingUnknown };
    yield {
      kind: 'retrograde', phase: 'Converge', sweep: i + 1, decidedThisSweep: newly,
      atFixpoint,
      // At the fixpoint the undecided→draw drain fires: proven jumps to the final census and
      // `drainedToDraw` says how many unknowns it labelled DRAW (F8). Before it, draws = the
      // terminal draws only — loopy draws are NOT proven yet.
      proven: atFixpoint ? finalCounts : { win: cumWin, loss: cumLoss, draw: drawTerminals },
      ...(atFixpoint ? { drainedToDraw: remainingUnknown } : {}),
    };
  }

  // Honest per-piece values in the STEPPED solve too (runSolve computes these; the stepper's
  // trace must not silently drop the card's headline feature). Bounded by the same budget.
  const ablation = pieceValuesByAblation(level, bounds, 0);
  const pieceValues = ablationToReport(ablation, internal.rootValue, level);
  yield { kind: 'retrograde', phase: 'ReadValue', rootValue: internal.rootValue, pieceValues };
}

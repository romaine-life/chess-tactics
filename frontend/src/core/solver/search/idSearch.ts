// Board solver — the iterative-deepening αβ weak-solver driver (ADR-0068 Phase 4, §1/§3).
//
// The ANYTIME weak-solver from the start: it deepens 1..∞ (bounded), and at every depth it
// (a) yields progressively deeper PROVEN results, (b) carries a transposition table across
// depths so an early stop is useful (the accumulated proofs are the partial tablebase),
// (c) proves draws via path cycle detection (F8), (d) tightens the contract RootBounds
// monotonically, and (e) emits the five watchable search phases through proofNegamax.
//
// It reuses ai.ts:searchBestAction's root-loop shape (re-sort roots by the previous depth's
// scores, full window per root so near-best scores are exact) — a proof-tracking analogue,
// not a reimplementation.
//
// ANYTIME GUARANTEE: at ANY stop (root proven, or a node/wall-clock budget trips) the returned
// WeakSolveResult is well-formed — best line, tightened RootBounds, proven ProvenCounts, the TT
// as the partial tablebase — assignable straight into the public SolveResult.

import type { Side, Move, Winner, PieceType } from '../../types';
import type { Value, RootBounds, ProvenCounts, SolveProgress, Outcome, OrderedMove, SearchWindow } from '../types';
import type { SolverInput } from '../input';
import type { PhaseEmit } from './phaseEvents';
import { applyMove, legalMoves, livingPieces } from '../../rules';
import { captureValue } from '../../ai';
import { terminalOutcome } from '../input';
import { enumerateReachable } from '../encode';
import { retrogradeSolve } from '../retrograde';
import { TranspositionTable, PROVEN_DEPTH } from './transpositionTable';
import { makeProofSearchState, proofNegamax, proofToValue, type ProofBackedValue } from './proofNegamax';

/** Search-mode-INTERNAL caps, derived from the contract SolveBounds inside runSolve's search
 * branch (NOT on the wire). `prover` defaults 'ab'. */
export interface WeakSolveBounds {
  maxDepthPlies?: number;
  maxNodes?: number;
  /** Retained for shape compatibility, but NOT consulted by `runWeakSolve`: the in-loop budget is
   * node-count only so the proof result is deterministic (a `Date.now()` stop would flip the proven
   * outcome/bounds run-to-run). The real-time ceiling lives outside this loop — see the driver's
   * `startedAt` note and `weakBoundsFromSolveBounds` (which no longer forwards it). */
  wallClockMs?: number;
  ttEntryLimit?: number;
  prover?: 'ab' | 'pn' | 'pn2';
}

/** The anytime payload. `rootValue`/`rootBounds`/`proven` are CONTRACT types, so a
 * WeakSolveResult drops straight into the public SolveResult that runSolve's search branch
 * returns. `aborted` = a budget stopped it before the root was proven. */
export interface WeakSolveResult {
  rootValue: Value;
  rootBounds: RootBounds;
  bestLine: OrderedMove[];
  completedDepth: number;
  nodes: number;
  proven: ProvenCounts;
  coverage: { statesSeen: number; ttSize: number };
  aborted: boolean;
}

/** Default iterative-deepening depth ceiling (plies). Exported so the search-mode SolveResult's
 * coverage formula divides by the SAME denominator the streamed SolveProgress coverage uses — the
 * two must stay in lockstep (both are `completedDepth / maxDepth`). `weakBoundsFromSolveBounds`
 * never overrides `maxDepthPlies`, so this is the effective ceiling on every production run. */
export const DEFAULT_MAX_DEPTH = 64;
const DEFAULT_MAX_NODES = 2_000_000;

/** Outcome lattice for monotone bound tightening: loss < draw < win < unknown-open. */
const OUTCOME_RANK: Record<Outcome, number> = { loss: 0, draw: 1, win: 2, unknown: 3 };
const worse = (a: Outcome, b: Outcome): Outcome => (OUTCOME_RANK[a] <= OUTCOME_RANK[b] ? a : b);
const better = (a: Outcome, b: Outcome): Outcome => (OUTCOME_RANK[a] >= OUTCOME_RANK[b] ? a : b);

interface RootMove {
  pieceId: string;
  move: Move;
  orderKey: number;
  /** Proof of the position AFTER this move, from the root side-to-move's view (flipped). */
  proof?: ProofBackedValue;
  /** Score at the last completed depth (side-to-move-positive), for re-ordering. */
  score: number;
}

/**
 * Run the anytime weak-solve from the level's start. Deterministic under node budgets (no RNG;
 * strict argmax). `tt` may be supplied to share/inspect the table; otherwise a fresh one is used.
 */
export function runWeakSolve(
  input: SolverInput,
  bounds: WeakSolveBounds,
  onProgress?: (p: SolveProgress) => void,
  emit?: PhaseEmit,
  tt: TranspositionTable = new TranspositionTable(bounds.ttEntryLimit),
): WeakSolveResult {
  // `startedAt` feeds ONLY the `secs` display field of SolveProgress — never a control-flow decision.
  // The in-loop budget is NODE-COUNT ONLY (deterministic): a `Date.now()` stopping condition would
  // make the PROOF CONTENT (which positions are proven + their values, `rootValue`, `rootBounds`,
  // `complete`) flip run-to-run on identical (level, bounds) near a budget boundary — violating the
  // plan's determinism contract ("no Date.now()/RNG leaks into the proof result; budgets checked on
  // the nodes&1023 cadence"; "two runSolve runs on the same level produce byte-identical labels +
  // root value"). The real-time ceiling (`SolveBounds.wallClockMs`) is honored OUTSIDE this loop —
  // by the Phase-3 Job `activeDeadlineSeconds` and the hard `maxNodes` cap, which bounds termination
  // deterministically. `bounds.wallClockMs` is therefore intentionally NOT consulted here.
  const startedAt = Date.now();
  const maxDepth = bounds.maxDepthPlies ?? DEFAULT_MAX_DEPTH;
  const maxNodes = bounds.maxNodes ?? DEFAULT_MAX_NODES;

  const start = input.start;
  const rootTurn: Side = start.turn === 'enemy' ? 'enemy' : 'player';
  const startTurns = 0;

  // If the ROOT is already terminal, it is proven at DTM 0 with no line.
  const rootTerminal = terminalOutcome(start, input, startTurns);
  if (rootTerminal !== null) {
    const v = terminalToValue(rootTerminal, rootTurn);
    return {
      rootValue: v,
      rootBounds: { lower: v.outcome, upper: v.outcome, bestDistancePlies: v.distancePlies, proven: true },
      bestLine: [],
      completedDepth: 0,
      nodes: 0,
      proven: countsPlusRoot(tt.provenCounts(), v),
      coverage: { statesSeen: 0, ttSize: tt.size },
      aborted: false,
    };
  }

  // Root move list (MVV pre-order, like searchBestAction).
  let roots: RootMove[] = [];
  for (const p of livingPieces(start.pieces, rootTurn)) {
    for (const move of legalMoves(p, start.pieces, start.size, input.env)) {
      roots.push({ pieceId: p.id, move, orderKey: captureValue(move, start.pieces, defaultValues()), score: captureValue(move, start.pieces, defaultValues()) });
    }
  }

  // No legal root move: stuck-side terminal handled by terminalOutcome above only when the oracle
  // fires; a bare no-move at the root is a loss (checkmate) or draw (stalemate) — resolve via a
  // single proofNegamax at depth 0, which routes the stuck rule.
  if (roots.length === 0) {
    const pstate = makeProofSearchState(input, { maxNodes, ttEntryLimit: bounds.ttEntryLimit, tt, emit });
    const pv = proofNegamax(pstate, start, 0, 0, -Infinity, Infinity, startTurns);
    const v = proofToValue(pv, rootTurn);
    return {
      rootValue: v,
      rootBounds: { lower: v.outcome, upper: v.outcome, bestDistancePlies: v.distancePlies, proven: v.outcome !== 'unknown' },
      bestLine: [], completedDepth: 0, nodes: pstate.s.nodes,
      proven: countsPlusRoot(tt.provenCounts(), v),
      coverage: { statesSeen: pstate.s.nodes, ttSize: tt.size }, aborted: false,
    };
  }

  const pstate = makeProofSearchState(input, { maxNodes, ttEntryLimit: bounds.ttEntryLimit, tt, emit });

  let bestLine: OrderedMove[] = [{ pieceId: roots[0].pieceId, move: roots[0].move, orderKey: roots[0].orderKey }];
  let rootValue: Value = { outcome: 'unknown' };
  let rootBounds: RootBounds = { lower: 'loss', upper: 'win', proven: false };
  let completedDepth = 0;
  let aborted = false;

  // Node-count-only budget (deterministic; see `startedAt` note above — no wall-clock term).
  const budgetTripped = (): boolean => pstate.s.aborted || pstate.s.nodes >= maxNodes;

  for (let depth = 1; depth <= maxDepth; depth += 1) {
    // Re-sort roots by the previous depth's score (proven wins first, then higher score).
    roots = [...roots].sort((a, b) => b.score - a.score || a.move.y - b.move.y || a.move.x - b.move.x || a.pieceId.localeCompare(b.pieceId));

    // The ROOT's own phase events — without these the trace never shows the move list the
    // driver iterates, where one deepening iteration ends and the next begins, or (below)
    // the tightened root bounds, so a stepped solve could run to completion with the
    // StatusStrip still reading "root unknown".
    const rootWindow: SearchWindow = { alpha: -Infinity, beta: Infinity, depth, ply: 0 };
    emit?.({ kind: 'search', phase: 'Generate', window: rootWindow, line: [], generated: roots.length });
    emit?.({
      kind: 'search', phase: 'Order', window: rootWindow,
      ordered: roots.map((r) => ({ pieceId: r.pieceId, move: r.move, orderKey: r.orderKey })),
    });

    const scored: RootMove[] = [];
    let depthAborted = false;
    for (const root of roots) {
      if (budgetTripped()) { depthAborted = true; break; }
      pstate.s.nodes += 1;
      const res = applyMove(start, root.pieceId, root.move);
      // Clock advances whenever the ENEMY moves — the same rule as enumerateReachable / retrograde /
      // proofNegamax, so every store keys positions identically (see proofNegamax's childTurns note).
      const childTurns = startTurns + (start.turn === 'enemy' ? 1 : 0);
      const rootMove: OrderedMove = { pieceId: root.pieceId, move: root.move, orderKey: root.orderKey };
      emit?.({ kind: 'search', phase: 'Descend', window: rootWindow, into: rootMove, line: [rootMove] });
      const rawChild = proofNegamax(pstate, res.state, depth - 1, 1, -Infinity, Infinity, childTurns, [{ pieceId: root.pieceId, move: root.move, orderKey: root.orderKey }]);
      if (pstate.s.aborted) { depthAborted = true; break; }
      // Flip the child's STM value to the ROOT side-to-move's view. A proven win/loss gains ONE
      // ply — the root move itself — so DTM counts from the root, not from the child (mirroring
      // proofNegamax's internal `1 + child.distancePlies` back-up). A capture directly into a
      // terminal (child DTM 0) is thus a mate-in-1 at the root, not mate-in-0.
      const flippedProof = rawChild.proof === 'win' ? 'loss' : rawChild.proof === 'loss' ? 'win' : rawChild.proof;
      const fromRoot: ProofBackedValue = {
        value: -rawChild.value,
        proof: flippedProof,
        distancePlies: (flippedProof === 'win' || flippedProof === 'loss') ? rawChild.distancePlies + 1 : rawChild.distancePlies,
        pathDependent: rawChild.pathDependent,
        exact: rawChild.exact, // an exact child DTM makes the root-move DTM exact (1 + exact = exact).
      };
      scored.push({ ...root, proof: fromRoot, score: fromRoot.value });
      // Root-level back-up: this root move's value folding into the root.
      emit?.({ kind: 'search', phase: 'BackUp', window: rootWindow, childValue: proofToValue(fromRoot, rootTurn), cutoff: false });
    }

    if (depthAborted || scored.length !== roots.length) { aborted = true; break; }

    roots = scored;
    completedDepth = depth;

    // Update best line + bounds from this fully-completed depth.
    const ranked = [...roots].sort((a, b) => b.score - a.score || a.move.y - b.move.y || a.move.x - b.move.x || a.pieceId.localeCompare(b.pieceId));
    const top = ranked[0];
    bestLine = [{ pieceId: top.pieceId, move: top.move, orderKey: top.orderKey }];

    const bd = boundsFromRoots(ranked, rootTurn);
    // Monotone tightening: never widen a previously-proven bound.
    rootBounds = {
      lower: better(rootBounds.lower, bd.bounds.lower),
      upper: worse(rootBounds.upper, bd.bounds.upper),
      bestDistancePlies: bd.bounds.bestDistancePlies ?? rootBounds.bestDistancePlies,
      proven: bd.proven || rootBounds.proven,
    };
    if (bd.proven) { rootBounds = bd.bounds; rootValue = bd.rootValue; }
    else rootValue = bd.rootValue;

    // Depth-complete root BackUp CARRYING rootBounds — the one event the stepper's fold reads
    // the root answer from (rootBounds/rootValue would otherwise never reach the trace).
    emit?.({ kind: 'search', phase: 'BackUp', window: rootWindow, childValue: rootValue, cutoff: false, rootBounds });

    onProgress?.(makeProgress(pstate, depth, rootBounds, startedAt, maxDepth, maxNodes));

    // Stop only when the outcome is proven AND its distance is exact (retrograde-minimal). A proven
    // outcome whose DTM is still a cutoff-inflated upper bound keeps deepening — the anytime bounds
    // above already reflect the proven outcome, so an early budget stop still returns it; a clean
    // finish returns the minimal distance. (A draw has no distance ⇒ exactDistance is always true.)
    if ((bd.proven && bd.exactDistance) || budgetTripped()) break;
  }

  // ── DRAW-PROOF fallback (backward induction over the reachable set). ──
  // Iterative-deepening αβ finds WINS/LOSSES fast (shortest-DTM first) and gives anytime bounds, but
  // it cannot soundly PROVE a loopy DRAW by forward search (F8 + the GHI trap): a repetition on the
  // path is only a draw for the side that can FORCE it, which a single forward pass can't decide
  // without re-search. Backward induction (retrograde) resolves the loopy value EXACTLY — a position
  // is drawn iff neither side can force a king-capture in finite plies — so when the root is still
  // unresolved AND the reachable set is small enough to ENUMERATE within the node/state budget, we
  // complete the proof by backward induction over that set (sound + terminating, and it agrees with
  // the Phase-1 strong solver by construction — the same enumerate+retrograde it uses). A board too
  // big to enumerate within budget leaves the root honestly `unknown` (the anytime partial). This is
  // the principled division the ADR draws: αβ for the parts search resolves, exact backward induction
  // for the rest when it fits.
  //
  // EN-PASSANT REFUSAL (F6). The fallback is `enumerateReachable + retrogradeSolve` — the SAME
  // lastMove-free strong solve that `estimateFeasibility` REFUSES on an en-passant-capable board
  // (`enPassantUnsound`), because the decoded move graph is missing every EP successor. Running it
  // here would launder that unsound strong solve back out through the search runner as a PROVEN root
  // value — exactly the soundness invariant feasibility exists to protect. So on an EP-unsound board
  // we DO NOT fall back: the root stays at the search's honest bounds (`unknown` when unproven), the
  // anytime partial. (α/β search itself is EP-safe: its leaf and terminal checks are the live rules.)
  if (!rootBounds.proven && !budgetTripped() && !input.enPassantUnsound) {
    const remainingStates = Math.max(0, maxNodes - pstate.s.nodes);
    if (remainingStates > 0) {
      const space = enumerateReachable(input, remainingStates);
      if (!space.truncated) {
        const solved = retrogradeSolve(space, input);
        pstate.s.nodes += space.keys.length;
        rootValue = solved.rootValue;
        rootBounds = {
          lower: rootValue.outcome, upper: rootValue.outcome,
          bestDistancePlies: rootValue.distancePlies, proven: rootValue.outcome !== 'unknown',
        };
        // Fold the exact tablebase into the shared TT (the partial-tablebase / proven-position store).
        for (let o = 0; o < space.keys.length; o += 1) {
          const code = solved.outcome[o];
          if (code === 0) continue; // still unknown (shouldn't happen after the undecided→draw pass)
          const flag = code === 1 ? 'proven-win' : code === 2 ? 'proven-loss' : 'proven-draw';
          tt.put({ key: space.keys[o].toString(), flag, value: 0, depth: PROVEN_DEPTH, distancePlies: solved.distance[o] });
        }
        // The fallback just proved the root — the trace must say so (same event shape as the
        // per-depth root BackUp, so the stepper's fold picks the bounds up identically).
        emit?.({
          kind: 'search', phase: 'BackUp',
          window: { alpha: -Infinity, beta: Infinity, depth: completedDepth, ply: 0 },
          childValue: rootValue, cutoff: false, rootBounds,
        });
      } else {
        // Too big to enumerate within budget: honestly leave the root unknown (anytime partial).
        pstate.s.nodes += space.keys.length;
      }
    }
    onProgress?.(makeProgress(pstate, completedDepth, rootBounds, startedAt, maxDepth, maxNodes));
  }

  if (!aborted && rootBounds.proven) aborted = false;
  else if (budgetTripped() && !rootBounds.proven) aborted = true;

  const proven = countsPlusRoot(tt.provenCounts(), rootValue);
  return {
    rootValue,
    rootBounds,
    bestLine,
    completedDepth,
    nodes: pstate.s.nodes,
    proven,
    coverage: { statesSeen: pstate.s.nodes, ttSize: tt.size },
    aborted,
  };
}

/** Bounds + proven-root from the ranked root moves (root side-to-move's view). `proven` is the
 * OUTCOME proof (win/loss/draw settled); `exactDistance` is true when the reported win/loss DTM is
 * the retrograde-minimal distance (not a cutoff-inflated upper bound). The driver stops iterating
 * only when the outcome is proven AND its distance is exact (a draw needs no distance) — so it never
 * freezes a non-minimal win-distance, matching retrograde's distance-ordered guarantee. */
function boundsFromRoots(
  ranked: RootMove[],
  rootTurn: Side,
): { bounds: RootBounds; rootValue: Value; proven: boolean; exactDistance: boolean } {
  const otherWinner: Side = rootTurn === 'player' ? 'enemy' : 'player';

  // A WIN if some move gives STM a proven win. The root win-distance is the MIN over winning moves;
  // it is EXACT-final iff a move achieving that minimum is itself exact (iterative deepening surfaces
  // the shortest mate first, as an exact proof, so an exact min is the true minimal DTM). Until then
  // the outcome is still proven-win, but the distance keeps refining across deeper iterations.
  const winMoves = ranked.filter((r) => r.proof?.proof === 'win');
  if (winMoves.length) {
    const dtm = Math.min(...winMoves.map((r) => r.proof!.distancePlies));
    const exactDistance = winMoves.some((r) => r.proof!.distancePlies === dtm && r.proof!.exact === true);
    return {
      bounds: { lower: 'win', upper: 'win', bestDistancePlies: dtm, proven: true },
      rootValue: { outcome: 'win', winner: rootTurn, distancePlies: dtm },
      proven: true,
      exactDistance,
    };
  }

  const allResolved = ranked.every((r) => r.proof && r.proof.proof !== 'bound');
  const anyDraw = ranked.some((r) => r.proof?.proof === 'draw');
  const allLoss = ranked.every((r) => r.proof?.proof === 'loss');

  if (allResolved && allLoss) {
    // Every move loses ⇒ proven LOSS at 1 + max child DTM (best defence). The distance is exact only
    // when every defence is exact (the max over exact best-defences is the true best defence).
    const dtm = Math.max(...ranked.map((r) => r.proof!.distancePlies));
    const exactDistance = ranked.every((r) => r.proof!.exact === true);
    return {
      bounds: { lower: 'loss', upper: 'loss', bestDistancePlies: dtm, proven: true },
      rootValue: { outcome: 'loss', winner: otherWinner, distancePlies: dtm },
      proven: true,
      exactDistance,
    };
  }

  if (allResolved && anyDraw) {
    // No win, all resolved, a draw available ⇒ proven DRAW. (Path-dependence at the root is the
    // true value here: with no repetition/50-move rule, STM cannot force a capture ⇒ draw, F8.) A
    // draw carries no distance, so it is always "exact" (nothing to refine).
    return {
      bounds: { lower: 'draw', upper: 'draw', proven: true },
      rootValue: { outcome: 'draw' },
      proven: true,
      exactDistance: true,
    };
  }

  // UNRESOLVED: some move is still a heuristic bound. Tighten what we can:
  //  - lower = the best PROVEN outcome STM can force (a proven win handled above; else draw if a
  //    proven-draw move exists, else loss).
  //  - upper = 'win' (a bound move might yet be a win).
  const lower: Outcome = anyDraw ? 'draw' : 'loss';
  const upper: Outcome = 'win';
  return { bounds: { lower, upper, proven: false }, rootValue: { outcome: 'unknown' }, proven: false, exactDistance: false };
}

function terminalToValue(winner: Exclude<Winner, null>, rootTurn: Side): Value {
  if (winner === 'draw') return { outcome: 'draw' };
  const iWin = winner === rootTurn;
  return iWin
    ? { outcome: 'win', winner: rootTurn, distancePlies: 0 }
    : { outcome: 'loss', winner: rootTurn === 'player' ? 'enemy' : 'player', distancePlies: 0 };
}

/** The proven counts, plus the root itself if proven (so a solved root always shows ≥1 in its bucket). */
function countsPlusRoot(counts: ProvenCounts, rootValue: Value): ProvenCounts {
  const out = { ...counts };
  if (rootValue.outcome === 'win') out.win += 1;
  else if (rootValue.outcome === 'loss') out.loss += 1;
  else if (rootValue.outcome === 'draw') out.draw += 1;
  return out;
}

function makeProgress(
  pstate: ReturnType<typeof makeProofSearchState>,
  depth: number,
  rootBounds: RootBounds,
  startedAt: number,
  maxDepth: number,
  maxNodes: number,
): SolveProgress {
  const proven = pstate.tt.provenCounts();
  const statesSolved = proven.win + proven.loss + proven.draw;
  // Search-mode coverage is a bounded-progress proxy (states/total is degenerate for an
  // Infinity feasibility bound): max(depth/maxDepth, nodes/maxNodes, bounds-collapse) ×100.
  const collapse = rootBounds.proven ? 1 : rootBounds.lower === rootBounds.upper ? 1 : 0;
  const coveragePct = Math.min(100, 100 * Math.max(depth / maxDepth, pstate.s.nodes / maxNodes, collapse));
  return {
    phase: 'BackUp',
    statesEnumerated: pstate.s.nodes,
    statesSolved,
    proven,
    rootBounds,
    coveragePct,
    secs: (Date.now() - startedAt) / 1000,
    depth,
  };
}

function defaultValues(): Record<PieceType, number> {
  return { pawn: 1, knight: 3, bishop: 3, rook: 5, queen: 9, king: 4, rock: 0, 'random-rock': 0 };
}

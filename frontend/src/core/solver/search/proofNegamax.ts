// Board solver — proof-tracking negamax (ADR-0068 Phase 4). A fork of ai.ts:negamax that turns the
// heuristic search into an anytime WEAK-SOLVER: it distinguishes a game-theoretic PROOF
// (win/loss/draw resolved within the horizon) from a depth-limited heuristic BOUND, accumulates
// proofs in a transposition table, and marks path REPETITIONS as draws (F8).
//
// It reuses the live engine wholesale — `legalMoves`/`applyMove` (move graph), `captureValue` (MVV
// ordering), `sideInCheck` (the stuck-side rule), and the exported `quiesce` (the leaf) — so its
// play is byte-identical to ai.ts wherever it falls back to a bound. The ONE deliberate divergence:
// terminality routes through the Phase-1 victory-rule oracle `terminalOutcome` (resolveVictory +
// level.victory — F1), NOT `evaluateObjective`, so an authored `level.victory` decides correctly.
// (ai.ts's own negamax calls evaluateObjective; the solver must not.)
//
// This is the iterative-deepening driver's per-node worker (idSearch.runWeakSolve). It PROVES
// wins/losses (shortest-DTM first, exact against retrograde) and gives tightening bounds; it does
// NOT attempt to prove loopy DRAWS by forward search — that is unsound by a single forward pass
// (the GHI trap: a repetition is a draw only for the side that can FORCE it). Draw proving is
// delegated to exact backward induction over the reachable set when it fits the budget
// (idSearch's fallback) — the sound, retrograde-agreeing completion.
//
// VALUE CONVENTION: `ProofBackedValue.value` is side-to-move-positive — the exact ai.ts negamax
// convention — so scoring/ordering reuse is byte-compatible and the α/β window plumbing is
// unchanged. It converts to the contract `Value` (player-anchored winner + DTM) at the module
// boundary (proofToValue).
//
// GHI SOUNDNESS: a draw discovered by a PATH cycle is path-relative — the same position may be a
// win via a non-repeating line. A cycle draw is marked `pathDependent` and is NEVER written to the
// global TT (only terminal/stalemate draws — path-INDEPENDENT — are). This keeps a path-scoped
// cycle draw from ever being looked up as equal to a retrograde tablebase draw.

import type { GameState, Side, Winner, Move } from '../../types';
import type { Value, OrderedMove, SearchWindow } from '../types';
import type { SolverInput } from '../input';
import type { PhaseEmit } from './phaseEvents';
import type { MoveEnv } from '../../rules';
import { applyMove, legalMoves, livingPieces, sideInCheck } from '../../rules';
import { makeSearchState, quiesce, captureValue, evaluateGameState, WIN_SCORE, type SearchState } from '../../ai';
import { terminalOutcome } from '../input';
import { canonicalKey } from '../encode';
import { TranspositionTable, PROVEN_DEPTH, type TTEntry } from './transpositionTable';
import { PathHistory } from './cycleDetection';

/** The proof-tracking return. `value` is side-to-move-positive (ai.ts convention). `proof`:
 * `win`/`loss` are game-theoretic proofs; `draw` is a proven (terminal/stalemate) or a path-scoped
 * (repetition) draw — the latter flagged `pathDependent`; `bound` is the depth-limited α/β heuristic
 * (NOT a proof). `distancePlies` is the DTM for a proven win/loss (0 for draw/bound). */
export interface ProofBackedValue {
  value: number;
  proof: 'win' | 'loss' | 'draw' | 'bound';
  distancePlies: number;
  /** GHI: true when this draw came from a path repetition ⇒ path-scoped, never globally cached. */
  pathDependent?: boolean;
  /**
   * EXACT-DTM flag (win/loss only). True iff `distancePlies` is provably the MINIMAL distance-to-mate
   * — the retrograde-agreeing value — and NOT merely an upper bound that an α/β cutoff left behind.
   *
   * α/β pruning is sound for the game-theoretic OUTCOME but not for the DTM: a cutoff can prune a
   * sibling holding a SHORTER mate, so a win aggregated across a truncated child set carries a
   * distance that is only an upper bound. `exact` propagates that distinction up the tree: a terminal
   * is exact (DTM 0); an aggregated win/loss is exact only when NO cutoff truncated it AND the
   * distance-determining child is itself exact. Only an `exact` proof is written to the proven-sticky
   * TT (so every cached DTM is minimal) and only an `exact` root proof stops the iterative-deepening
   * driver with a final distance — an inexact win/loss keeps its sound outcome but defers the distance
   * to a deeper iteration, where the minimal line is searched without the pruning that hid it.
   */
  exact?: boolean;
}

/** proofNegamax's mutable state: the live `SearchState` (budget/eval/ordering) plus the TT, the
 * resolved victory oracle input (F1), the path history for cycle detection, an entry cap, and an
 * optional phase-event sink. `SearchState` is not constructed here — `makeSearchState` (the shared
 * factory) builds it so the solver and the live engine agree byte-for-byte. */
export interface ProofSearchState {
  s: SearchState;
  input: SolverInput;
  tt: TranspositionTable;
  path: PathHistory;
  ttEntryLimit: number;
  emit?: PhaseEmit;
  /** Monotone count of cycle-detection (path-repetition) events over the whole search. A node
   * snapshots it before searching its children and compares after: any increase means a repetition
   * fired somewhere in that subtree, so the node's win/loss DISTANCE is path-dependent (the true
   * shortest line may have been cycle-pruned) — see the GHI taint in the aggregation. */
  repetitions: number;
}

/** Build the proof-search state. The objective frames the reused eval/quiesce. */
export function makeProofSearchState(
  input: SolverInput,
  opts: { maxNodes?: number; ttEntryLimit?: number; tt?: TranspositionTable; emit?: PhaseEmit } = {},
): ProofSearchState {
  const sctx = { objective: input.level.objective, ctx: input.ctx, turnsElapsed: 0 };
  // No time budget (a solve is deterministic; budgets are node-count only — §Determinism).
  const s = makeSearchState(input.env, sctx, { maxNodes: opts.maxNodes });
  return {
    s,
    input,
    tt: opts.tt ?? new TranspositionTable(opts.ttEntryLimit),
    path: new PathHistory(),
    ttEntryLimit: opts.ttEntryLimit ?? 1_000_000,
    emit: opts.emit,
    repetitions: 0,
  };
}

const QUIESCE_MAX_PLY = 8;

/** Convert a raw terminal Winner into the side-to-move proof at ply `ply` (DTM 0 at terminal). A
 * terminal distance is EXACT (0 — nothing shorter exists). */
function terminalProof(winner: Winner, turn: Side, ply: number): ProofBackedValue {
  if (winner === 'draw') return { value: 0, proof: 'draw', distancePlies: 0 };
  const iWin = winner === turn;
  const mag = WIN_SCORE - ply;
  return { value: iWin ? mag : -mag, proof: iWin ? 'win' : 'loss', distancePlies: 0, exact: true };
}

/** Flip a child's side-to-move-positive value to the parent's view (negamax). Win↔loss, draw/bound
 * fixed, distance + path-dependence + DTM-exactness preserved. */
function flipChild(v: ProofBackedValue): ProofBackedValue {
  const proof = v.proof === 'win' ? 'loss' : v.proof === 'loss' ? 'win' : v.proof;
  return { value: -v.value, proof, distancePlies: v.distancePlies, pathDependent: v.pathDependent, exact: v.exact };
}

/** A TT entry's proof flag → a side-to-move-positive ProofBackedValue (proofs are stored STM-positive).
 * Only EXACT-DTM proofs are ever written to the TT (see storeProof), so a cached win/loss is exact. */
function proofFromTT(e: TTEntry): ProofBackedValue | null {
  if (e.flag === 'proven-win') return { value: WIN_SCORE - e.distancePlies, proof: 'win', distancePlies: e.distancePlies, exact: true };
  if (e.flag === 'proven-loss') return { value: -(WIN_SCORE - e.distancePlies), proof: 'loss', distancePlies: e.distancePlies, exact: true };
  if (e.flag === 'proven-draw') return { value: 0, proof: 'draw', distancePlies: 0 };
  return null;
}


/** The MVV-ordered move list at a node — the exact ai.ts ordering, exposed for the phase trace. */
function orderedMoves(pstate: ProofSearchState, state: GameState, side: Side): { pieceId: string; move: Move; orderKey: number }[] {
  const values = pstate.s.weights.pieceValues;
  const entries: { pieceId: string; move: Move; orderKey: number }[] = [];
  for (const piece of livingPieces(state.pieces, side)) {
    for (const move of legalMoves(piece, state.pieces, state.size, pstate.input.env)) {
      entries.push({ pieceId: piece.id, move, orderKey: captureValue(move, state.pieces, values) });
    }
  }
  entries.sort((a, b) => b.orderKey - a.orderKey || a.move.y - b.move.y || a.move.x - b.move.x || a.pieceId.localeCompare(b.pieceId));
  return entries;
}

/**
 * Proof-tracking negamax at a node.
 * @param pstate  shared proof-search state (budget, TT, path, oracle, emit)
 * @param state   the position
 * @param depth   remaining search depth (plies); 0 ⇒ quiescence leaf
 * @param ply     plies from the search root (for DTM + mate-score ply adjustment)
 * @param alpha,beta  the α/β window (side-to-move-positive)
 * @param turnsElapsed  the survive/turnLimit clock reading at this node
 * @param line    the current move line (for the phase trace; may be empty when tracing is off)
 * Returns the side-to-move-positive ProofBackedValue.
 */
export function proofNegamax(
  pstate: ProofSearchState,
  state: GameState,
  depth: number,
  ply: number,
  alpha: number,
  beta: number,
  turnsElapsed: number,
  line: OrderedMove[] = [],
): ProofBackedValue {
  const { s } = pstate;
  if (s.nodes >= s.maxNodes) { s.aborted = true; return { value: 0, proof: 'bound', distancePlies: 0 }; }

  const turn: Side = state.turn === 'enemy' ? 'enemy' : state.turn === 'player' ? 'player' : (state.winner === 'player' ? 'enemy' : 'player');
  const key = canonicalKey(state, pstate.input, pstate.input.clockMatters ? turnsElapsed : 0).toString();
  const window: SearchWindow = { alpha, beta, depth, ply };

  // ── TT probe (proven flag → return the proof; a bound at ≥ depth tightens the window). ──
  const hit = pstate.tt.get(key);
  if (hit) {
    const proven = proofFromTT(hit);
    if (proven) {
      // A cached proof is game-theoretically final AND (for win/loss) EXACT-DTM by construction —
      // storeProof only ever writes an exact proof — so it returns directly, at any depth/ply. Its
      // exact minimal distance flows into the parent's aggregation unchanged (a cached win/loss does
      // not depend on the reusing node's horizon, so reusing it never inflates the parent's DTM).
      pstate.emit?.({ kind: 'search', phase: 'Order', window, ordered: [], ttHit: { key, value: proofToValue(proven, turn) } });
      return proven;
    }
    if (hit.depth >= depth) {
      if (hit.flag === 'exact') return { value: hit.value, proof: 'bound', distancePlies: 0 };
      if (hit.flag === 'lower' && hit.value > alpha) alpha = hit.value;
      else if (hit.flag === 'upper' && hit.value < beta) beta = hit.value;
      if (alpha >= beta) return { value: hit.value, proof: 'bound', distancePlies: 0 };
    }
  }

  // ── Terminal check via the victory-rule oracle (F1) — BEFORE cycle/leaf. ──
  const winner = terminalOutcome(state, pstate.input, turnsElapsed);
  if (winner !== null) {
    const tv = terminalProof(winner, turn, ply);
    storeProof(pstate, key, tv); // a terminal is path-INDEPENDENT ⇒ safe to cache.
    return tv;
  }

  // ── Cycle detection (F8): a repeat on the current path is a path-scoped DRAW. NOT cached (GHI). ──
  if (pstate.path.repeats(key)) {
    pstate.repetitions += 1; // record the event so ancestors know their subtree hit a repetition.
    return { value: 0, proof: 'draw', distancePlies: 0, pathDependent: true };
  }

  // ── Depth-0 leaf: the exported ai.ts quiesce (byte-identical). ──
  // A quiescence mate score is NOT a proof: `quiesce` extends CAPTURES ONLY (up to
  // QUIESCE_MAX_PLY) and reports the mate score of a capture-forced line, whose length is not
  // the perfect-play minimum. Recovering a DTM from it (`dtmFromScore(|qv|) - ply`) inflates
  // the win-distance and — because a leaf proof is stored proven-sticky and short-circuited on
  // later iterations — that inflated DTM never converges to the exact value (it would violate
  // the "exact against retrograde" contract). So a quiescence mate is returned as a heuristic
  // BOUND carrying the mate-magnitude value (α/β still prefers it, so the driver descends the
  // winning line), and the win/loss is PROVEN only when the full-width recursion reaches the
  // objective terminal via `terminalOutcome` at the exact depth — where the DTM is measured, not
  // guessed. Iterative deepening then proves the mate at the depth equal to its true DTM.
  if (depth <= 0) {
    // The Quiesce phase event: the leaf's stand-pat (the same static eval quiesce anchors on —
    // declining every capture is always an option) plus the MVV-ordered capture list the
    // capture-only extension is about to resolve. Emitted BEFORE the quiescence run so the
    // stepper shows the leaf's starting arithmetic, not a post-hoc summary.
    if (pstate.emit) {
      const color = state.turn === 'player' ? 1 : -1;
      const env: MoveEnv = { terrain: s.terrainEnv, fences: s.fences, lastMove: undefined };
      const standPat = color * evaluateGameState(state, { ...s.sctx, turnsElapsed }, s.weights, env);
      const pending = orderedMoves(pstate, state, turn).filter((e) => e.orderKey >= 0);
      pstate.emit({ kind: 'search', phase: 'Quiesce', window, standPat, pending });
    }
    const qv = quiesce(s, state, undefined, ply, alpha, beta, turnsElapsed, QUIESCE_MAX_PLY);
    if (s.aborted) return { value: 0, proof: 'bound', distancePlies: 0 };
    return { value: qv, proof: 'bound', distancePlies: 0 };
  }

  const side = turn;
  const entries = orderedMoves(pstate, state, side);
  if (entries.length === 0) {
    // No legal action: checkmate (loss for the stuck side) if in check, else stalemate (draw).
    if (sideInCheck(state, side, pstate.input.env)) {
      const lv: ProofBackedValue = { value: -(WIN_SCORE - ply), proof: 'loss', distancePlies: 0, exact: true };
      storeProof(pstate, key, lv);
      return lv;
    }
    const dv: ProofBackedValue = { value: 0, proof: 'draw', distancePlies: 0 };
    storeProof(pstate, key, dv); // a stalemate is path-INDEPENDENT ⇒ safe to cache.
    return dv;
  }

  pstate.emit?.({ kind: 'search', phase: 'Generate', window, line, generated: entries.length });
  pstate.emit?.({
    kind: 'search', phase: 'Order', window,
    ordered: entries.map((e) => ({ pieceId: e.pieceId, move: e.move, orderKey: e.orderKey })),
  });

  pstate.path.push(key);
  const repsBefore = pstate.repetitions; // snapshot: did THIS node's subtree hit any repetition?

  let best = -Infinity;
  let bestProof: ProofBackedValue = { value: -Infinity, proof: 'bound', distancePlies: 0 };
  // Aggregation trackers for the minimax proof rule.
  let winDTM = Infinity;         // min DTM among children that give ME a proven win
  let winDTMExact = false;       // is the CURRENT min-DTM winning child an exact-DTM proof?
  let winDeterminerPathDep = false; // is the CURRENT min-DTM winning child path-dependent?
  let sawWin = false;
  let allLoss = true;            // every child so far is a proven loss for me (opponent win)
  let maxLossDTM = 0;            // max child loss DTM (for LOSS distance = 1 + max)
  let allLossExact = true;       // is EVERY loss child an exact-DTM proof? (loss exact ⇒ every defence exact)
  let anyLossPathDep = false;    // is ANY loss child path-dependent?
  let sawDraw = false;           // some child is a draw
  let sawBound = false;          // some child is unresolved (a heuristic bound)
  let drawTaint = false;         // a contributing draw was path-dependent (cycle) ⇒ taint

  let cutoff = false;
  for (let i = 0; i < entries.length; i += 1) {
    const entry = entries[i];
    s.nodes += 1;
    const res = applyMove(state, entry.pieceId, entry.move);
    // The survive/turnLimit clock advances whenever the ENEMY moves — the SAME rule
    // enumerateReachable (encode.ts) and retrograde (retrograde.ts) key on, so the search TT and the
    // retrograde tablebase the draw-proof fallback folds into it key every position identically. A
    // narrower `enemy→player` test would MISS the enemy's game-ending WIPE move (which sets
    // turn='done', not 'player'), keying that terminal leaf one clock-tick short of the tablebase and
    // breaking the store interchange. The wipe child is terminal (clock-inert for its value), so
    // matching encode's `enemy-moving` bump is value-safe and restores key compatibility.
    const childTurns = turnsElapsed + (state.turn === 'enemy' ? 1 : 0);
    const childLine = pstate.emit ? [...line, { pieceId: entry.pieceId, move: entry.move, orderKey: entry.orderKey }] : line;
    pstate.emit?.({ kind: 'search', phase: 'Descend', window, into: { pieceId: entry.pieceId, move: entry.move, orderKey: entry.orderKey }, line: childLine });

    const childRaw = proofNegamax(pstate, res.state, depth - 1, ply + 1, -beta, -alpha, childTurns, childLine);
    if (s.aborted) { pstate.path.pop(key); return { value: 0, proof: 'bound', distancePlies: 0 }; }
    const child = flipChild(childRaw); // now from MY view

    if (child.proof === 'win') {
      sawWin = true;
      const dtm = 1 + child.distancePlies;
      // Track the exactness AND path-dependence of the child that DETERMINES winDTM (the shortest
      // mate). A strictly shorter win adopts its properties; a tie keeps exactness/clears taint if
      // either candidate is exact/clean (a clean short mate proves the node clean at that distance).
      if (dtm < winDTM) { winDTM = dtm; winDTMExact = child.exact === true; winDeterminerPathDep = child.pathDependent === true; }
      else if (dtm === winDTM) {
        if (child.exact === true) winDTMExact = true;
        if (child.pathDependent !== true) winDeterminerPathDep = false;
      }
      allLoss = false;
    } else if (child.proof === 'loss') {
      maxLossDTM = Math.max(maxLossDTM, 1 + child.distancePlies);
      if (child.exact !== true) allLossExact = false;
      if (child.pathDependent === true) anyLossPathDep = true;
    } else if (child.proof === 'draw') {
      sawDraw = true;
      allLoss = false;
      if (child.pathDependent) drawTaint = true;
    } else {
      sawBound = true;
      allLoss = false;
    }

    if (child.value > best) { best = child.value; bestProof = child; }
    if (child.value > alpha) alpha = child.value;

    // FULL-WIDTH proof search — NO α/β cutoff, NO first-win break. α/β pruning is sound for the
    // game-theoretic OUTCOME but INCOMPATIBLE with EXACT DTM: a cutoff prunes siblings, any of which
    // could hold a SHORTER mate (higher value than the α that triggered the cut) or a longer
    // best-defence, so a distance aggregated across a truncated child set is only an upper bound —
    // and, cached proven-sticky, that non-minimal distance would never converge to the retrograde
    // value. The ADR "exact against retrograde" contract requires the true MIN over ALL winning
    // children and MAX over ALL losing children on the mate line, which needs a full-width scan.
    // (A mate-safe cutoff — prune only on non-mate values — was tried and REJECTED: it barely fires
    // on drawish boards, whose values hover near 0 and rarely collapse the window, so it did not
    // recover the pruning speed, while its interaction with the exact/stop logic broke the driver's
    // early termination on clean wins. Full-width is the correct, predictable rule here.) This is a
    // WEAK-SOLVER for small/hard boards where the transposition table (a proof searched once, reused
    // everywhere) keeps a full-width proof search affordable; the α/β window is still threaded for
    // the quiescence leaf's own pruning and for value ordering, just never used to prune a proof
    // node. (`cutoff` therefore stays false; kept for the aggregation rule's shape and as a guard.)
    pstate.emit?.({ kind: 'search', phase: 'BackUp', window, childValue: proofToValue(child, turn), cutoff: false });
  }

  pstate.path.pop(key);

  // ── Minimax proof aggregation. ──
  //
  // OUTCOME vs EXACT DTM. The full-width scan makes every win/loss OUTCOME sound and every distance the
  // true minimax distance OVER THE SEARCHED-AND-CACHED GRAPH. Three things can still make a freshly
  // aggregated distance NON-minimal versus the retrograde ground truth, so `exact` (which gates both
  // caching and the driver's stop) requires all three to be clear:
  //   1. HORIZON ADEQUACY (`distancePlies <= depth`). A distance LONGER than this node's own remaining
  //      depth was assembled using the shared TT's proofs for DEEPER positions, while a SHORTER line
  //      through a child that needs more plies than are left here stays unresolved (returns a bound) —
  //      so this node did NOT verify there is no shorter mate. Committing such a distance lets a shallow
  //      visit "prove" a mate-in-N with horizon < N and freeze that non-minimal value in the sticky TT,
  //      where it short-circuits every deeper visit and never converges (the KR-4×4 defect). A distance
  //      that fits the horizon (`<= depth`) WAS fully searched here, so it is minimal. (A directly
  //      TT-returned proof skips this aggregation entirely — it was proven exact when cached, so reusing
  //      it at a shallow node still yields its minimal distance; only FRESH aggregation is gated.)
  //   2. EXACTNESS — a distance-determining child that is itself only a bound-DTM proof makes this node
  //      inexact: WIN ⇔ the shortest-mate child is exact; LOSS ⇔ every losing defence is exact.
  //   3. PATH-DEPENDENCE (the GHI trap, extended to WIN/LOSS distance). Cycle detection is PATH-relative:
  //      it scores a position that repeats a search-path ancestor as a draw, which can FORBID the true
  //      shortest mating line and force a longer one — a path-scoped, non-minimal distance. Any
  //      repetition in this node's subtree (`subtreeRepetition`), a path-dependent distance-determining
  //      child, or a cycle-draw sibling that could have masked a shorter mate (`drawTaint`) marks the
  //      win/loss PATH-DEPENDENT: sound outcome, not exact, not cached. The clean shortest line (no
  //      position repeats on it — a repeating defence would be a draw, not a loss) proves the minimal
  //      distance untainted; the retrograde fallback resolves whatever the search leaves open.
  // Only an EXACT, path-INDEPENDENT win/loss is cached, so every proven-sticky TT DTM is the
  // retrograde-minimal value, and only such a root proof stops the driver with a final distance.
  const subtreeRepetition = pstate.repetitions > repsBefore;

  let result: ProofBackedValue;
  if (sawWin) {
    const winTainted = winDeterminerPathDep || drawTaint || subtreeRepetition;
    const exact = !cutoff && winDTMExact && !winTainted && winDTM <= depth;
    result = { value: WIN_SCORE - winDTM, proof: 'win', distancePlies: winDTM, exact: exact || undefined, pathDependent: winTainted || undefined };
    if (exact) storeProof(pstate, key, result);
  } else if (cutoff || sawBound) {
    // Unresolved: a cutoff pruned siblings (can't claim a proof) OR a child is a bound. Return the
    // best VALUE as a heuristic bound (never a proof). A bound influenced by ANY path-dependence — a
    // cycle-draw that is the best child, OR any repetition in the subtree — is itself path-scoped, so
    // do NOT cache it (GHI: a path-relative value must never be looked up as a global one).
    const pathDep = (bestProof.proof === 'draw' && bestProof.pathDependent === true) || subtreeRepetition;
    result = { value: best, proof: 'bound', distancePlies: 0, pathDependent: pathDep || undefined };
    if (!pathDep && !cutoff) storeBound(pstate, key, best, depth);
  } else if (allLoss) {
    // Every move loses ⇒ proven LOSS at 1 + the longest (best-defence) child DTM. The outcome is
    // path-independent (every child is a proven opponent-win), but the DISTANCE is exact only when it
    // fits the horizon, every defence is exact, and no path-dependence tainted it.
    const lossTainted = anyLossPathDep || subtreeRepetition;
    const exact = allLossExact && !lossTainted && maxLossDTM <= depth;
    result = { value: -(WIN_SCORE - maxLossDTM), proof: 'loss', distancePlies: maxLossDTM, exact: exact || undefined, pathDependent: lossTainted || undefined };
    if (exact) storeProof(pstate, key, result);
  } else {
    // No win, no unresolved child, not all-loss ⇒ a draw within this horizon. If any contributing
    // draw was a path repetition (`drawTaint`) OR a repetition fired anywhere in the subtree
    // (`subtreeRepetition`), this draw is path-dependent (GHI) and must NOT be cached — only a draw
    // built purely from terminal/stalemate (path-independent) draws is cached and looked up as a
    // global proven-draw (interchangeable with a retrograde tablebase draw under the same key).
    const drawPathDep = drawTaint || subtreeRepetition;
    result = { value: 0, proof: 'draw', distancePlies: 0, pathDependent: drawPathDep || undefined };
    if (!drawPathDep && sawDraw) storeProof(pstate, key, result);
  }
  return result;
}

// ── TT stores. ──

/** Store a PROVEN value (win/loss/draw), proven-sticky. Never stores a path-dependent draw (GHI). */
function storeProof(pstate: ProofSearchState, key: string, v: ProofBackedValue): void {
  if (v.pathDependent) return;
  const flag = v.proof === 'win' ? 'proven-win' : v.proof === 'loss' ? 'proven-loss' : v.proof === 'draw' ? 'proven-draw' : null;
  if (!flag) return;
  pstate.tt.put({ key, flag, value: v.value, depth: PROVEN_DEPTH, distancePlies: v.distancePlies });
}

/** Store a heuristic exact bound (a full window was searched without a cutoff). */
function storeBound(pstate: ProofSearchState, key: string, value: number, depth: number): void {
  pstate.tt.put({ key, flag: 'exact', value, depth, distancePlies: 0 });
}

/** Convert a side-to-move-positive ProofBackedValue into the contract player-anchored Value. A win
 * for STM means STM wins; the contract `winner` is filled from that. Draw → no winner/distance; a
 * `bound` maps to `unknown` (it is not a proof). */
export function proofToValue(v: ProofBackedValue, turn: Side): Value {
  if (v.proof === 'win') return { outcome: 'win', winner: turn, distancePlies: v.distancePlies };
  if (v.proof === 'loss') return { outcome: 'loss', winner: turn === 'player' ? 'enemy' : 'player', distancePlies: v.distancePlies };
  if (v.proof === 'draw') return { outcome: 'draw' };
  return { outcome: 'unknown' };
}

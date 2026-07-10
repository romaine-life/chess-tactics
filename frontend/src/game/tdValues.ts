// From-scratch per-board piece values via self-play — afterstate TD(λ), the TD-Gammon
// shape (Tesauro 1992–95), in the Beal & Smith (1997) "learn piece values from random
// play" lineage. The lead direction of the per-board AI research map: start every piece
// value EQUAL (no chess prior), play noisy shallow self-play, learn V(position) ≈
// expected outcome, anneal the noise — then read the learned weights back as THIS
// board's own piece values.
//
// One thing at a time (the map's rule): the model is deliberately the smallest thing
// that can learn piece values — a LINEAR value over per-type living-count differences,
//     V(s) = σ(w · f(s)),   f[t] = playerCount[t] − enemyCount[t]
// over the 6 playable types (rocks are scenery — neutral, never counted). V is read as
// P(player win). Weights are therefore in LOG-ODDS (logit) units: near a level position
// one extra net piece of type t shifts P(player win) by ≈ w_t/4 (σ′(0) = ¼) — the
// "outcome-delta" gauge. Absolute magnitudes depend on that gauge; the piece-value
// story is the RATIOS, so report relative (see `pawnRelativeValues`, pawn = 1).
//
// Play policy: 1-ply greedy over V of the successor — each legal (piece, move) is
// applied via the real applyMove and the side to move picks the argmax (the enemy
// minimizes, V being player-positive), with ε-random exploration annealed over games.
// A terminal successor scores its EXACT outcome (win 1 / draw ½ / loss 0), so a mating
// move always outranks any heuristic value and a stalemate is dodged whenever a
// better-than-½ quiet move exists. Promotions take the promotion rule's DEFAULT piece
// (no underpromotion in self-play — same as selfplay and the search AI).
//
// Learning: afterstate TD(λ) — after each game, run eligibility traces over the game's
// afterstate sequence (the position AFTER each committed move) with the final target
// set to the game outcome; α is annealed over games. `monteCarlo: true` swaps in the
// plain Monte-Carlo update (every afterstate regresses straight to the outcome — the
// λ = 1 limit) as an A/B lever.
//
// Terminality is the live triple: (a) applyMove's last-side-standing winner, (b)
// resolveVictory over `level.victory ?? victoryRulesForObjective(...)` (reused, not
// forked — note game/selfplay.ts still routes through evaluateObjective, which ignores
// authored level.victory; on authored-victory levels this file matches the SOLVER),
// (c) the stuck-side rule (checkmate/stalemate); plus the committed-move chess draw
// rules (ruleDraw) and a hard ply cap scored as a draw. Ordering: mid-game is
// core/solver/input.ts `terminalOutcome` exactly ((a)→(b)→(c)); at PLY 0 the live game
// checks stuck FIRST (store.newSkirmish's resolveIfPlayerStuck, selfplay's pre-loop
// check) and playGame does the same — the solver keeps victory-first even at the root,
// the one spot the repo's references disagree (observable only on double-terminal
// authored starts).
//
// Pure + deterministic (no DOM, no Date, no Math.random): every random draw comes from
// core/rng seeded per game, so a given (level, opts) reproduces bit-for-bit on one JS
// engine (sigmoid's Math.exp is the lone op with no cross-engine bit guarantee; the
// rng itself is integer-exact).
//
// Named debt (ADR-0059): playGame is the repo's THIRD turn-loop skeleton (store,
// selfplay, here) and terminalWinner re-states the solver's terminalOutcome. Blind
// reuse was semantically wrong today — selfplay hard-codes searchBestAction and
// evaluateObjective (no policy hook, no authored victory) and the solver's stuck env
// omits lastMove (en-passant boards are refused upstream) where this learner must
// thread it — but the shared extraction (a policy-pluggable turn loop / an
// env-parameterized terminalOutcome) is owed, not waived.

import type { GameState, Move, Side, Vec, Winner } from '../core/types';
import type { Level, VictoryRules } from '../core/level';
import type { MoveEnv } from '../core/rules';
import { applyMove, gameEnv, legalMoves, livingPieces, recordPosition, ruleDraw, sideInCheck } from '../core/rules';
import { kingSideOf, objectiveContextForLevel, resolveVictory, victoryRulesForObjective, type ObjectiveContext } from '../core/objectives';
import { PLAYABLE_PIECE_TYPES, type PlayablePieceType } from '../core/pieces';
import { createFromLevel } from './setup';
import { createRng, type Rng } from '../core/rng';
import type { RecordedMove } from './selfplay';

/** Per-type value weights, JSON-safe. Logit units (see the gauge note above): ratios are
 * the piece-value reading, `pawnRelativeValues` gives the pawn = 1 display. */
export type ValueWeights = Record<PlayablePieceType, number>;

/** Linear anneal from `start` (game 0) to `end` (last game). */
export interface AnnealSchedule {
  start: number;
  end: number;
}

export interface TrainOptions {
  /** Self-play training games to run. */
  games: number;
  /** Master seed; every game's rng derives deterministically from (seed, gameIndex). */
  seed: number;
  /** Hard game-length cap; hitting it scores a draw (mirrors selfplay's cap). */
  maxPlies?: number;
  /** TD(λ) trace decay. Ignored when `monteCarlo` is set. */
  lambda?: number;
  /** Learning-rate schedule, annealed linearly over games. */
  alpha?: AnnealSchedule;
  /** Exploration schedule: probability of a uniform-random move, annealed over games. */
  epsilon?: AnnealSchedule;
  /** Equal starting weight for every type — "everything starts at 1", scaled to a small
   * logit so early values sit near ½ and gradients don't saturate. */
  initialWeight?: number;
  /** Plain Monte-Carlo updates (afterstates regress straight to the outcome) instead of
   * TD(λ) — the λ = 1 limit, kept as a named A/B lever. */
  monteCarlo?: boolean;
  /** Snapshot the trajectory every K games (0 = final snapshot only). */
  probeEvery?: number;
  /** Games per win-rate probe vs the frozen-random opponent (0 = skip the probe;
   * defaults to 16 when probeEvery is set, else 0). */
  probeGames?: number;
}

/** One trajectory point: the weights, the root's value, and (when probed) the win rate
 * vs the frozen-random opponent — the learning curve's raw material. */
export interface TrainSnapshot {
  /** Training games completed when this snapshot was taken. */
  game: number;
  weights: ValueWeights;
  /** V(start position) under the snapshot weights — should drift toward the board's
   * true value (≈1 on a proven player win, ≈½ on a proven draw). */
  rootValue: number;
  /** Greedy-with-these-weights vs frozen-random score over probeGames (draw = ½). */
  winRateVsRandom?: number;
}

export interface TrainResult {
  /** Learned weights, logit units (see gauge note). JSON-safe. */
  weights: ValueWeights;
  trajectory: TrainSnapshot[];
  games: number;
  seed: number;
  /** Outcome split of the TRAINING games themselves (exploration on) — a coarse
   * health readout, e.g. all-draws means the board never generated a win signal. */
  outcomes: { playerWins: number; draws: number; enemyWins: number };
}

/** "Everything starts at 1", scaled: 0.1 logit per net piece keeps the initial value
 * near ½ for any realistic material count, so the sigmoid starts unsaturated. */
export const DEFAULT_INITIAL_WEIGHT = 0.1;
const DEFAULT_LAMBDA = 0.8;
const DEFAULT_ALPHA: AnnealSchedule = { start: 0.1, end: 0.01 };
const DEFAULT_EPSILON: AnnealSchedule = { start: 0.25, end: 0.02 };
const DEFAULT_MAX_PLIES = 120;
/** Games per win-rate probe when a probe is due but no count was given — exported so
 * the stepping session (lab/tdSession.ts) and any driving surface derive from HERE
 * instead of re-stating the literal (ADR-0057: baselines are derived, never copied). */
export const DEFAULT_PROBE_GAMES = 16;
/** The engine-baseline knob set, exported so a driving surface's Reset derives from
 * HERE (ADR-0057: reset to the committed baseline, never a hand-copied literal). */
export const DEFAULT_TRAIN_OPTIONS = {
  maxPlies: DEFAULT_MAX_PLIES,
  lambda: DEFAULT_LAMBDA,
  alpha: { ...DEFAULT_ALPHA },
  epsilon: { ...DEFAULT_EPSILON },
  initialWeight: DEFAULT_INITIAL_WEIGHT,
} as const;
/** Frozen probe opponent's seed base — a CONSTANT (not derived from the training seed)
 * so every run, every snapshot, and every seed in runSeeds is probed over the SAME
 * seeded game set. Not literally the same enemy MOVE stream across weight vectors: one
 * rng per game serves both sides and greedy tie-breaks consume draws, so the ε=1
 * enemy's picks shift as the probed weights change. The guarantee is "same fair
 * uniform-random opponent, same seeds" — deterministic per (level, weights, games). */
const PROBE_SEED_BASE = 0x50524f42; // 'PROB'
/** Greedy tie window: successor values within this are one equivalence class and the
 * pick among them is seeded-random (decorrelates games; matches ai.ts's near-best pick). */
const TIE_EPS = 1e-12;

const TYPE_COUNT = PLAYABLE_PIECE_TYPES.length;
const TYPE_INDEX = new Map<string, number>(PLAYABLE_PIECE_TYPES.map((t, i) => [t, i]));

const sigmoid = (x: number): number => 1 / (1 + Math.exp(-x));
const outcomeValue = (winner: Side | 'draw'): number => (winner === 'player' ? 1 : winner === 'draw' ? 0.5 : 0);
const lerp = (s: AnnealSchedule, t: number): number => s.start + (s.end - s.start) * t;
/** Per-game rng seed: a fixed 32-bit scramble of the master seed, offset by game index. */
const gameSeed = (seed: number, game: number): number => (Math.imul(seed, 0x9e3779b1) + game) >>> 0;

function toRecord(w: Float64Array): ValueWeights {
  const out = {} as ValueWeights;
  PLAYABLE_PIECE_TYPES.forEach((t, i) => { out[t] = w[i]; });
  return out;
}

function fromRecord(r: ValueWeights): Float64Array {
  const w = new Float64Array(TYPE_COUNT);
  PLAYABLE_PIECE_TYPES.forEach((t, i) => { w[i] = r[t]; });
  return w;
}

/** f[t] = living playerCount[t] − enemyCount[t] over the 6 playable types. Rocks and
 * every neutral piece are excluded; a promoted pawn counts as what it is NOW. */
function featuresOf(state: GameState): Float64Array {
  const f = new Float64Array(TYPE_COUNT);
  for (const p of state.pieces) {
    if (!p.alive || (p.side !== 'player' && p.side !== 'enemy')) continue;
    const idx = TYPE_INDEX.get(p.type);
    if (idx === undefined) continue; // rock / random-rock — scenery, not material
    f[idx] += p.side === 'player' ? 1 : -1;
  }
  return f;
}

function valueOf(f: Float64Array, w: Float64Array): number {
  let x = 0;
  for (let i = 0; i < TYPE_COUNT; i += 1) x += f[i] * w[i];
  return sigmoid(x);
}

/** Everything about a game that never changes across its plies, built once per game
 * (the solver's SolverInput shape, reduced to what the turn loop needs). */
interface GameFrame {
  start: GameState;
  /** Static terrain + fences env; lastMove layered on per ply (like selfplay). */
  baseEnv: MoveEnv;
  /** { ...objectiveContextForLevel, kingSide } — the spread is mandatory (solver F2). */
  ctx: ObjectiveContext;
  /** level.victory ?? victoryRulesForObjective(objective, ctx) (solver F1). */
  rules: VictoryRules;
}

function frameFor(level: Level, seed: number): GameFrame {
  const start = createFromLevel(level, seed);
  const ctx: ObjectiveContext = { ...objectiveContextForLevel(level), kingSide: kingSideOf(start.pieces) };
  const rules: VictoryRules = level.victory ?? victoryRulesForObjective(level.objective, ctx);
  return { start, baseEnv: gameEnv(start), ctx, rules };
}

/**
 * The stuck-side rule on its own: the side to move has no legal move — loses in
 * check (checkmate), draws otherwise (stalemate). Null when a move exists (or no
 * playable side is on turn). Split out because start-of-game resolution checks
 * this BEFORE the victory rules (the live order — see playGame), while every
 * later ply checks it after.
 */
function stuckWinner(state: GameState, frame: GameFrame): Winner {
  const side = state.turn;
  if (side !== 'player' && side !== 'enemy') return null;
  const env: MoveEnv = { ...frame.baseEnv, lastMove: state.lastMove };
  for (const p of livingPieces(state.pieces, side)) {
    if (legalMoves(p, state.pieces, state.size, env).length > 0) return null;
  }
  return sideInCheck(state, side, env) ? (side === 'player' ? 'enemy' : 'player') : 'draw';
}

/**
 * The mid-game terminal triple on a settled position (reproduces core/solver/input.ts
 * `terminalOutcome` exactly): (a) applyMove's last-side-standing winner, (b)
 * resolveVictory over the frame's rules with the clock threaded, (c) the stuck-side
 * rule (checkmate/stalemate). Null while undecided. Committed-move draw rules
 * (ruleDraw) are the turn loop's job, not this function's — they need the committed
 * threefold table.
 */
function terminalWinner(state: GameState, frame: GameFrame, turnsElapsed: number): Winner {
  if (state.winner) return state.winner;
  const { winner } = resolveVictory(state, frame.rules, { ...frame.ctx, turnsElapsed });
  if (winner) return winner;
  return stuckWinner(state, frame);
}

interface Action {
  pieceId: string;
  move: Move;
}

/** One side's decision rule: greedy over V(successor) under `weights`, exploring
 * uniformly at random with probability `epsilon` (ε = 1 is the pure-random opponent). */
interface SidePolicy {
  weights: Float64Array;
  epsilon: number;
}

function actionsFor(state: GameState, side: Side, env: MoveEnv): Action[] {
  const out: Action[] = [];
  for (const p of livingPieces(state.pieces, side)) {
    for (const move of legalMoves(p, state.pieces, state.size, env)) out.push({ pieceId: p.id, move });
  }
  return out;
}

/**
 * 1-ply greedy with ε-exploration. Each candidate is applied through the real
 * applyMove; a terminal successor scores its exact outcome, a live one scores
 * σ(w·f). Committed-move chess draws are INVISIBLE at this depth (the threefold
 * table needs committed history this lookahead doesn't have), so a draw-completing
 * move is valued σ(w·f) here and scored ½ by the loop one ply later — a
 * policy-quality nuance near draw boundaries (core/ai.ts does see its halfmove
 * clock in-tree), never a wrong learning target. The player maximizes, the enemy
 * minimizes (V is player-positive). Ties (within TIE_EPS) are broken by a seeded
 * pick, so equal-value positions — ubiquitous under the all-equal start — still
 * explore.
 */
function chooseAction(
  state: GameState,
  side: 'player' | 'enemy',
  actions: Action[],
  policy: SidePolicy,
  rng: Rng,
  frame: GameFrame,
  turnsElapsed: number,
): Action {
  if (policy.epsilon >= 1 || (policy.epsilon > 0 && rng.next() < policy.epsilon)) return rng.pick(actions);
  let best: Action[] = [];
  let bestScore = side === 'player' ? -Infinity : Infinity;
  for (const action of actions) {
    const next = applyMove(state, action.pieceId, action.move).state;
    // Round bookkeeping mirrors the loop's: an enemy move that ends its half completes
    // a round, and turnLimit/survive terminality must read that advanced clock.
    const turnsAfter = side === 'enemy' && next.turn !== 'enemy' ? turnsElapsed + 1 : turnsElapsed;
    const winner = terminalWinner(next, frame, turnsAfter);
    const v = winner ? outcomeValue(winner) : valueOf(featuresOf(next), policy.weights);
    const better = side === 'player' ? v > bestScore + TIE_EPS : v < bestScore - TIE_EPS;
    if (better) {
      bestScore = v;
      best = [action];
    } else if (Math.abs(v - bestScore) <= TIE_EPS) {
      best.push(action);
    }
  }
  return best.length === 1 ? best[0] : rng.pick(best);
}

interface PlayedGame {
  winner: Side | 'draw';
  /** Feature vector of the position AFTER each committed move — the afterstate
   * sequence TD(λ) learns on (terminal position included). */
  afterstates: Float64Array[];
  plies: number;
  /** Every committed move, selfplay's RecordedMove shape — replayStates(level,
   * { seed, moves }) reconstructs the exact per-ply positions (the game starts
   * from createFromLevel(level, seed), same as replayStates). Pure observation:
   * recording consumes no rng, so it cannot perturb the learning. */
  moves: RecordedMove[];
}

/**
 * Play one full game under per-side policies. The turn loop mirrors game/selfplay.ts:
 * start-of-game resolution, then per ply choose → applyMove → recordPosition →
 * terminal triple → committed draw rules, with the ply cap scored as a draw.
 */
function playGame(level: Level, seed: number, policy: Record<'player' | 'enemy', SidePolicy>, maxPlies: number): PlayedGame {
  const frame = frameFor(level, seed);
  const rng = createRng(seed);
  let game = frame.start;
  const afterstates: Float64Array[] = [];
  const moves: RecordedMove[] = [];
  let turnsElapsed = 0;
  let plies = 0;

  // Start-of-game resolution (a degenerate level can be over before any move).
  // Ply-0 ORDER follows the live game — stuck FIRST, then victory rules (the store's
  // newSkirmish runs resolveIfPlayerStuck before anything else; selfplay's pre-loop
  // check does the same) — where the solver's terminalOutcome keeps victory-first
  // even at the root. The repo's references disagree only there, and only on
  // degenerate double-terminal authored starts.
  let winner: Winner = stuckWinner(game, frame) ?? terminalWinner(game, frame, turnsElapsed);

  while (!winner && plies < maxPlies && (game.turn === 'player' || game.turn === 'enemy')) {
    const side = game.turn;
    const env: MoveEnv = { ...frame.baseEnv, lastMove: game.lastMove };
    // Non-empty: terminalWinner returned null, so the side to move has a legal move.
    const actions = actionsFor(game, side, env);
    const chosen = chooseAction(game, side, actions, policy[side], rng, frame, turnsElapsed);

    // Record before applying (selfplay's shape): `from` is the mover's pre-move square.
    const mover = game.pieces.find((p) => p.id === chosen.pieceId);
    const from: Vec = mover ? { x: mover.x, y: mover.y } : { x: chosen.move.x, y: chosen.move.y };
    const prevTurn = game.turn;
    const res = applyMove(game, chosen.pieceId, chosen.move);
    game = recordPosition(res.state, { ...frame.baseEnv, lastMove: res.state.lastMove });
    plies += 1;
    afterstates.push(featuresOf(game));
    moves.push({ pieceId: chosen.pieceId, side, from, move: chosen.move });
    // A full player→enemy round completes when the enemy's move ends its half (the
    // selfplay bookkeeping, counted even when that move decides the game).
    if (prevTurn === 'enemy' && game.turn !== 'enemy') turnsElapsed += 1;

    winner = terminalWinner(game, frame, turnsElapsed);
    if (!winner) {
      const draw = ruleDraw(game, { ...frame.baseEnv, lastMove: game.lastMove });
      if (draw) winner = 'draw';
    }
  }

  // Ply cap reached with no decision: a draw, exactly like selfplay.
  return { winner: winner ?? 'draw', afterstates, plies, moves };
}

/**
 * Afterstate TD(λ) over one game's trajectory, updating `w` in place. Online form:
 * step k's value and its successor target are both read under the weights as already
 * updated through step k−1 (the TD-Gammon shape). ∇w σ(w·f) = v(1−v)·f feeds the
 * eligibility trace; the last step's target is the game outcome z. The TERMINAL
 * afterstate is in the sequence — a deliberate deviation from the textbook "last
 * PREDICTION targets z" form: the pre-terminal step bootstraps from σ(w·f_terminal)
 * and the final step regresses that terminal value to z, whose δ still reaches every
 * earlier afterstate through the λ-trace. With material-only features a mate is
 * indistinguishable from a live position of equal material anyway, so pinning the
 * terminal feature vector toward the outcome loses nothing (convergence on the
 * win/draw/loss fixtures is asserted in the tests).
 */
function tdUpdate(w: Float64Array, afterstates: Float64Array[], z: number, alpha: number, lambda: number): void {
  const trace = new Float64Array(TYPE_COUNT);
  for (let k = 0; k < afterstates.length; k += 1) {
    const f = afterstates[k];
    const v = valueOf(f, w);
    const grad = v * (1 - v);
    for (let j = 0; j < TYPE_COUNT; j += 1) trace[j] = lambda * trace[j] + grad * f[j];
    const target = k === afterstates.length - 1 ? z : valueOf(afterstates[k + 1], w);
    const delta = target - v;
    for (let j = 0; j < TYPE_COUNT; j += 1) w[j] += alpha * delta * trace[j];
  }
}

/** Plain Monte-Carlo variant: every afterstate regresses straight to the outcome
 * (TD(λ)'s λ = 1 limit, without bootstrapping between adjacent values). */
function mcUpdate(w: Float64Array, afterstates: Float64Array[], z: number, alpha: number): void {
  for (const f of afterstates) {
    const v = valueOf(f, w);
    for (let j = 0; j < TYPE_COUNT; j += 1) w[j] += alpha * (z - v) * v * (1 - v) * f[j];
  }
}

/** TrainOptions with every default applied — the ONE normalization the batch trainer,
 * the stepping session, and scheduleAt all share, so they cannot drift. */
interface TrainConfig {
  games: number;
  seed: number;
  maxPlies: number;
  lambda: number;
  alpha: AnnealSchedule;
  epsilon: AnnealSchedule;
  initialWeight: number;
  monteCarlo: boolean;
}

function trainConfigOf(opts: TrainOptions): TrainConfig {
  return {
    games: opts.games,
    seed: opts.seed,
    maxPlies: opts.maxPlies ?? DEFAULT_MAX_PLIES,
    lambda: opts.lambda ?? DEFAULT_LAMBDA,
    alpha: opts.alpha ?? DEFAULT_ALPHA,
    epsilon: opts.epsilon ?? DEFAULT_EPSILON,
    initialWeight: opts.initialWeight ?? DEFAULT_INITIAL_WEIGHT,
    monteCarlo: opts.monteCarlo === true,
  };
}

/** Train game `g` of `cfg.games` in place: one seeded self-play game under the
 * annealed schedules, then the TD(λ)/MC update on `w`. THE per-game body —
 * trainValues and runTrainingGames both run exactly this, which is what makes
 * game-granular stepping reproduce the batch run bit-for-bit (each game's rng
 * derives from (seed, gameIndex) alone; no random stream crosses games).
 * Returns the played game so a driving surface can inspect how it went. */
function runOneGame(level: Level, cfg: TrainConfig, w: Float64Array, g: number, outcomes: TrainResult['outcomes']): PlayedGame {
  const t = cfg.games > 1 ? g / (cfg.games - 1) : 0;
  const pol: SidePolicy = { weights: w, epsilon: lerp(cfg.epsilon, t) };
  const played = playGame(level, gameSeed(cfg.seed, g), { player: pol, enemy: pol }, cfg.maxPlies);
  if (played.winner === 'player') outcomes.playerWins += 1;
  else if (played.winner === 'draw') outcomes.draws += 1;
  else outcomes.enemyWins += 1;
  const z = outcomeValue(played.winner);
  const alpha = lerp(cfg.alpha, t);
  if (cfg.monteCarlo) mcUpdate(w, played.afterstates, z, alpha);
  else tdUpdate(w, played.afterstates, z, alpha, cfg.lambda);
  return played;
}

/** One training game as an inspectable record — how the game was actually played.
 * `replayStates(level, { seed, moves })` reconstructs the exact per-ply positions
 * (a training game starts from createFromLevel(level, seed), replayStates' own
 * convention). JSON-safe, worker-transportable. */
export interface TdGameRecord {
  /** 1-based index in the run — equals `state.game` right after this game. */
  game: number;
  /** The game's own rng seed (gameSeed(master, game−1)) — replayStates' seed. */
  seed: number;
  winner: Side | 'draw';
  plies: number;
  moves: RecordedMove[];
}

/** The annealed (ε, α) at `game` games completed — what the NEXT game will use,
 * clamped to the last game's values once the budget is done. The schedules lerp on
 * t = g/(games−1), so the TOTAL budget is part of the schedule: a driving surface
 * must treat `opts.games` as fixed per run (reset to change it). */
export function scheduleAt(opts: TrainOptions, game: number): { epsilon: number; alpha: number } {
  const cfg = trainConfigOf(opts);
  const g = Math.max(0, Math.min(game, cfg.games - 1));
  const t = cfg.games > 1 ? g / (cfg.games - 1) : 0;
  return { epsilon: lerp(cfg.epsilon, t), alpha: lerp(cfg.alpha, t) };
}

export interface ProbeOptions {
  /** Probe seed base (defaults to the frozen PROBE_SEED_BASE — keep the default for
   * comparable trajectories). */
  seed?: number;
  maxPlies?: number;
  /** Play the PLAYER side uniformly at random too — the no-learning baseline the
   * "does training separate from random?" comparison needs. */
  randomPlayer?: boolean;
}

/**
 * Score greedy-with-`weights` (player) against the frozen-random opponent (enemy) over
 * `games` seeded games. Returns the mean outcome — win 1, draw ½, loss 0 — so 0.5 reads
 * as parity and 1.0 as a clean sweep. Deterministic.
 */
export function evaluateVsRandom(level: Level, weights: ValueWeights, games: number, opts: ProbeOptions = {}): number {
  const w = fromRecord(weights);
  const seedBase = opts.seed ?? PROBE_SEED_BASE;
  const maxPlies = opts.maxPlies ?? DEFAULT_MAX_PLIES;
  let score = 0;
  for (let i = 0; i < games; i += 1) {
    const played = playGame(level, (seedBase + i) >>> 0, {
      player: { weights: w, epsilon: opts.randomPlayer ? 1 : 0 },
      enemy: { weights: w, epsilon: 1 },
    }, maxPlies);
    score += outcomeValue(played.winner);
  }
  return games > 0 ? score / games : 0;
}

/** One exploration-free game, BOTH sides greedy on `weights` — "does the learned value
 * actually convert this board from the root?" (the post-training acceptance check). */
export function playGreedyGame(
  level: Level,
  weights: ValueWeights,
  opts: { seed?: number; maxPlies?: number } = {},
): { winner: Side | 'draw'; plies: number } {
  const w = fromRecord(weights);
  const pol: SidePolicy = { weights: w, epsilon: 0 };
  const played = playGame(level, (opts.seed ?? 1) >>> 0, { player: pol, enemy: pol }, opts.maxPlies ?? DEFAULT_MAX_PLIES);
  return { winner: played.winner, plies: played.plies };
}

/**
 * Train per-board piece values from scratch by noisy greedy self-play + afterstate
 * TD(λ). All types start EQUAL; every game is seeded from (seed, gameIndex); ε and α
 * anneal linearly over games. Returns the learned weights (logit units — see the gauge
 * note atop this file), the probe trajectory, and the training-game outcome split.
 */
export function trainValues(level: Level, opts: TrainOptions): TrainResult {
  const cfg = trainConfigOf(opts);
  const games = cfg.games;
  const probeEvery = opts.probeEvery ?? 0;
  const probeGames = opts.probeGames ?? (probeEvery > 0 ? DEFAULT_PROBE_GAMES : 0);

  const w = new Float64Array(TYPE_COUNT).fill(cfg.initialWeight);
  // Root features read the MASTER-seed deal; each training game re-deals from
  // gameSeed(seed, g) (selfplay's convention), so on levels whose seeded spawn zones
  // truncate a roster differently per deal, rootValue is "the master deal's value" —
  // a readout nuance, not a rules fork (fixed-placement levels are identical anyway).
  const rootF = featuresOf(frameFor(level, opts.seed).start);
  const trajectory: TrainSnapshot[] = [];
  const outcomes = { playerWins: 0, draws: 0, enemyWins: 0 };

  const snapshot = (gamesDone: number): TrainSnapshot => {
    const weights = toRecord(w);
    return {
      game: gamesDone,
      weights,
      rootValue: valueOf(rootF, w),
      ...(probeGames > 0 ? { winRateVsRandom: evaluateVsRandom(level, weights, probeGames, { maxPlies: cfg.maxPlies }) } : {}),
    };
  };

  for (let g = 0; g < games; g += 1) {
    runOneGame(level, cfg, w, g, outcomes);
    if (probeEvery > 0 && (g + 1) % probeEvery === 0) trajectory.push(snapshot(g + 1));
  }
  // Always end on a final snapshot (unless the loop just took one at exactly `games`).
  if (trajectory.length === 0 || trajectory[trajectory.length - 1].game !== games) trajectory.push(snapshot(games));

  return { weights: toRecord(w), trajectory, games, seed: opts.seed, outcomes };
}

/** The resumable training state between games: games done, the weights, and the
 * outcome split. JSON-safe (records, no Float64Array) — the worker-transport shape.
 * The OPTIONS are deliberately NOT in here: they are the fixed schedule this state
 * is a position inside (see scheduleAt), so the caller carries (level, opts, state)
 * and must hold `opts` constant across a run. */
export interface TrainSessionState {
  /** Games completed — also the index of the next game to play. */
  game: number;
  weights: ValueWeights;
  outcomes: TrainResult['outcomes'];
}

/** Game 0 of a run: the all-equal start, nothing played yet. */
export function createTrainingSession(opts: TrainOptions): TrainSessionState {
  const cfg = trainConfigOf(opts);
  return {
    game: 0,
    weights: toRecord(new Float64Array(TYPE_COUNT).fill(cfg.initialWeight)),
    outcomes: { playerWins: 0, draws: 0, enemyWins: 0 },
  };
}

/**
 * Advance the session by up to `n` games (clamped to the `opts.games` budget) and
 * return the new state. Chunking is INVISIBLE to the learning: stepping 1 + 7 + rest
 * reproduces trainValues({games}) bit-for-bit — each game's rng derives from
 * (seed, gameIndex) alone and the weights round-trip losslessly through the record.
 * Asserted in tdValues.test.ts (the load-bearing equivalence). `onGame` observes each
 * game's record as it completes (pure observation — it cannot change the learning).
 */
export function runTrainingGames(
  level: Level,
  opts: TrainOptions,
  state: TrainSessionState,
  n: number,
  onGame?: (record: TdGameRecord) => void,
): TrainSessionState {
  const cfg = trainConfigOf(opts);
  const w = fromRecord(state.weights);
  const outcomes = { ...state.outcomes };
  const end = Math.min(cfg.games, state.game + Math.max(0, Math.floor(n)));
  let g = state.game;
  for (; g < end; g += 1) {
    const played = runOneGame(level, cfg, w, g, outcomes);
    onGame?.({ game: g + 1, seed: gameSeed(cfg.seed, g), winner: played.winner, plies: played.plies, moves: played.moves });
  }
  return { game: g, weights: toRecord(w), outcomes };
}

export interface SeedSummary {
  seeds: number[];
  perSeed: Array<{ seed: number; weights: ValueWeights }>;
  /** Per-type mean across seeds. */
  mean: ValueWeights;
  /** Per-type population standard deviation across seeds — the ± spread. */
  spread: ValueWeights;
}

/** The k seeds runSeeds trains — seed i = master + i·7919 (i = 0 is the master
 * itself). Exported so a stepping surface reproduces the exact same seed family
 * for its own mean ± spread fold. */
export function derivedSeeds(seed: number, k: number): number[] {
  return Array.from({ length: k }, (_, i) => (seed + i * 7919) >>> 0);
}

/** Fold per-seed weight vectors into the mean ± population-spread summary — the
 * "is this value real or seed noise?" arithmetic, shared by runSeeds and any
 * caller that already holds trained vectors. */
export function summarizeSeeds(perSeed: SeedSummary['perSeed']): SeedSummary {
  const mean = {} as ValueWeights;
  const spread = {} as ValueWeights;
  for (const type of PLAYABLE_PIECE_TYPES) {
    const values = perSeed.map((r) => r.weights[type]);
    const m = values.reduce((s, v) => s + v, 0) / (values.length || 1);
    mean[type] = m;
    spread[type] = Math.sqrt(values.reduce((s, v) => s + (v - m) * (v - m), 0) / (values.length || 1));
  }
  return { seeds: perSeed.map((r) => r.seed), perSeed, mean, spread };
}

/**
 * Train `k` independent runs from derived seeds and summarize: per-seed weight vectors
 * plus mean ± spread per type — the "is this value real or seed noise?" readout.
 * Probing is inherited from `opts` (pass probeEvery/probeGames 0 to keep runs lean).
 */
export function runSeeds(level: Level, k: number, opts: TrainOptions): SeedSummary {
  const perSeed = derivedSeeds(opts.seed, k).map((seed) => ({ seed, weights: trainValues(level, { ...opts, seed }).weights }));
  return summarizeSeeds(perSeed);
}

/**
 * Pawn = 1 display: the logit gauge cancels in ratios, so dividing by the pawn weight
 * gives classic-style relative piece values. Only meaningful on boards that FIELD
 * pawns (an untouched type keeps its initial weight — dividing by that would be
 * noise); returns null when the pawn weight is too small to normalize by.
 */
export function pawnRelativeValues(weights: ValueWeights): ValueWeights | null {
  const pawn = weights.pawn;
  if (!Number.isFinite(pawn) || Math.abs(pawn) < 1e-6) return null;
  const out = {} as ValueWeights;
  for (const type of PLAYABLE_PIECE_TYPES) out[type] = weights[type] / pawn;
  return out;
}

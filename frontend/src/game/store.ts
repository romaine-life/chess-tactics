// Skirmish store (Zustand) — the single source of truth for the new game UI.
// It owns a GameState and applies intents through the pure core (intents in,
// new state out). The renderer and HUD subscribe to it; neither mutates state.

import { create } from 'zustand';
import { PROMOTION_PIECE_TYPES, type GameEvent, type GameState, type Move, type Piece, type PromotionPieceType, type Side, type Winner } from '../core/types';
import { applyMove, gameEnv, legalMoves, promotionRuleForMove, recordPosition, sideInCheck, type MoveEnv, type RuleDrawKind } from '../core/rules';
import { settleCommittedPosition, type Adjudication } from '../core/adjudication';
import { adoptedWeightsFor } from './adoptedWeights';
import { premoveTargets, provisionalBoard, type PremoveStep } from './premoves';
import { requestEnemyReply } from './aiWorkerClient';
import { objectiveBriefingForSide, victoryRuleDetailForSide } from './objectiveBriefing';
import type { PlayingSide } from './clientPerspective';
import { kingSideOf, objectiveContextForLevel, objectiveSummary, victoryRulesForObjective, type ObjectiveContext } from '../core/objectives';
import type { Level, ObjectiveType, TimeControl, VictoryRules } from '../core/level';
import { DEFAULT_TIME_CONTROL } from '../core/clock';
import { terrainAt } from '../core/terrain';
import { ARRIVAL_BAKED, playArrival, playTerrain } from '../sfx';
import { createSkirmish, type SkirmishOptions } from './setup';
import { persistMatch, type PersistedMatch } from './matchPersistence';
import { loadShippedAiWeights } from '../net/aiWeights';
import { PIECE_LABEL } from '../core/pieces';
import { clearPersistedNetIntent, loadPersistedNetIntent, persistNetIntent } from './netIntentPersistence';

// Seed the shipped-AI-weights cache once so the live enemy AI picks up any weights an
// admin shipped for a level (ship-to-everyone). Best-effort; a failure leaves the
// cache empty and the AI falls back to the player's personal adoption or DEFAULT.
void loadShippedAiWeights();

// ---- Multiplayer (netplay) --------------------------------------------------
// A skirmish is normally single-player: the local human controls 'player' and a
// deterministic local AI (scheduleEnemyReply) answers as 'enemy'. In a lobby match
// BOTH sides are human — the host controls 'player', the guest controls 'enemy',
// and each side's moves are relayed to the other over the lobby channel. The core
// is pure and seeded (applyMove + createRng), so both clients that build from the
// same (level, seed) and apply the same ordered moves stay byte-identical WITHOUT
// running the AI. See docs / ADR-0050 and frontend/src/net/lobbies.ts.

/** Per-match multiplayer context. `null` = single-player (local AI opponent). */
export interface NetState {
  lobbyId: string;
  /** The board side THIS client controls ('player' = host, 'enemy' = guest). */
  localSide: PlayingSide;
  /** Moves applied to this client's board so far — the next expected relay index. */
  moveCount: number;
  /** One local intent awaiting the authoritative relay at `expectedMoveCount`. The board
   *  remains unchanged until that echo/backfill is committed. */
  pendingMove: PendingNetMove | null;
  /** A deterministic gameplay result derived from the committed relay. Both clients report
   *  the same value so the lobby can retain it across reconnect/leave like resignation. */
  terminalResult: NetTerminalResult | null;
  /** First terminal frame published by the server. Once present, later conflicting
   *  frames are stale; before it exists, a dispute-resolution resignation may override
   *  this client's independently derived terminal verdict. */
  authoritativeResult?: { winner: Winner; reason: 'resign' | NetGameResultReason } | null;
}

export interface PendingNetMove {
  /** Stable idempotency key for this exact gesture. Every retry reuses it, so request
   *  arrival order can never turn one gesture into two different relay entries. */
  intentId: string;
  createdAt: number;
  expectedMoveCount: number;
  pieceId: string;
  move: RelayMove;
  /** POST and immediate recovery both failed. The client keeps input locked and retries
   *  this same idempotent intent until echo/backfill settles the relay slot. */
  uncertain: boolean;
}

export type NetGameResultReason = Adjudication['kind'];
export interface NetTerminalResult {
  expectedMoveCount: number;
  winner: PlayingSide | 'draw';
  reason: NetGameResultReason;
}

export interface NetMatchOptions {
  lobbyId: string;
  localSide: PlayingSide;
  level: Level;
  seed: number;
}

/** The minimal identifier for a relayed move: the destination cell plus an optional promotion
 *  choice. The receiver re-derives the canonical Move (capture id, en-passant flag) from its own
 *  identical board via legalMoves; promotion choice is the one move detail the rules cannot infer. */
export interface RelayMove { x: number; y: number; promotion?: PromotionPieceType }

function sameRelayMove(a: RelayMove, b: RelayMove): boolean {
  return a.x === b.x && a.y === b.y && a.promotion === b.promotion;
}

/** Relay hook: in a netplay match the store calls this with each LOCAL move so the
 *  netplay layer (Skirmish) can POST it to the lobby relay. Null in single-player. */
export type NetMoveSink = (pieceId: string, move: RelayMove, expectedMoveCount: number, intentId: string) => void;
let netMoveSink: NetMoveSink | null = null;
export function setNetMoveSink(sink: NetMoveSink | null): void { netMoveSink = sink; }

let fallbackNetIntentSequence = 0;
function createNetIntentId(): string {
  if (typeof globalThis.crypto?.randomUUID === 'function') return globalThis.crypto.randomUUID();
  fallbackNetIntentSequence += 1;
  return `intent-${Date.now().toString(36)}-${fallbackNetIntentSequence.toString(36)}`;
}

/** Relay hook: fired when the local player resigns, so the netplay layer POSTs the
 *  resignation to the lobby. Like moves, the game only ENDS when the server echoes the
 *  result back over the lobby channel (concludeNet) — never optimistically. */
export type NetResignSink = () => void;
let netResignSink: NetResignSink | null = null;
export function setNetResignSink(sink: NetResignSink | null): void { netResignSink = sink; }

// Turn tempo (ms). A move isn't one simultaneous swap — it's a rhythm: your move
// lands, the board settles for a beat, the enemy "thinks", then answers. This
// delay stages that read-beat + thinking pause before the enemy reply resolves.
const ENEMY_REPLY_DELAY = 520;

// A queued premove does NOT fire the instant the enemy reply resolves — it waits this
// beat first, so the player sees the enemy's move land AND their own queued arrow sitting
// on the board before it executes. Without it, a fast reply makes the premove invisible:
// the arrow and the move happen in the same frame. Roughly the enemy's move-glide, so the
// premove reads as "the enemy moved, then I answered", not two moves at once.
const PREMOVE_FIRE_DELAY = 620;

// Landing-SFX timing. The move tween runs ~170ms (see SkirmishBoard); fire the
// terrain footstep a beat into it so the sound lands as the piece *seats*, not as
// it lifts off. Several enemy moves resolved in one reply are spread out so their
// footsteps read as a sequence rather than one muddy stack; spawned units deploy as
// a soft staggered roll-call.
const LANDING_SFX_DELAY = 150;
const ENEMY_LANDING_STAGGER = 130;
const SPAWN_SFX_BASE_DELAY = 220;
const SPAWN_SFX_STAGGER = 70;

/** Movement environment for a state: its static terrain + fence env (gameEnv) plus lastMove. */
function envFor(game: GameState): MoveEnv {
  return { ...gameEnv(game), lastMove: game.lastMove };
}

/**
 * Fire the terrain "footstep" for a piece arriving at (x, y): read the destination
 * tile's material from the indexed terrain and play its one-shot. A no-op when the
 * board has no terrain authored there; `playTerrain` itself stays silent when
 * effects are muted or the AudioContext isn't armed yet, so callers never need to
 * know the audio state. `delayMs` aligns the sound with the move tween; `gain`
 * (<1) softens secondary footsteps (enemy replies, spawn roll-call).
 */
function playLandingTerrain(env: MoveEnv, x: number, y: number, gain?: number): void {
  if (!env.terrain) return;
  const cell = terrainAt(env.terrain, x, y);
  if (!cell) return;
  const opts = gain !== undefined ? { gain } : undefined;
  playTerrain(cell.terrain, opts);
}

function describeEvent(ev: GameEvent): string | null {
  switch (ev.kind) {
    case 'captured': return 'A piece falls.';
    case 'promoted': return `A pawn ascends to a ${PIECE_LABEL[ev.to] ?? ev.to}.`;
    case 'castled': return 'Castled — the King and Rook regroup.';
    default: return null;
  }
}

/** Log copy for a draw forced by the chess draw rules (ADR-0072), same on every surface. */
const DRAW_RULE_COPY: Record<RuleDrawKind, string> = {
  'fifty-move': 'Draw — 50 moves have passed without a capture or pawn move.',
  threefold: 'Draw — the same position has occurred three times.',
};

/** Result-screen "how it ended" line per draw kind (see resultDetail). */
const DRAW_RESULT_DETAIL: Record<Exclude<Adjudication['kind'], 'victory-rule'>, string | null> = {
  checkmate: 'Checkmate — the side to move has no legal escape.',
  stalemate: 'Stalemate — no legal moves remain.',
  'fifty-move': '50 moves passed without a capture or pawn move.',
  threefold: 'The same position occurred three times.',
};

function movePromotesPawn(game: GameState, piece: Piece, move: Move): boolean {
  return !!promotionRuleForMove(game, piece, { x: move.x, y: move.y });
}

function promotionChoicesForMove(game: GameState, piece: Piece, move: Move): readonly PromotionPieceType[] {
  return promotionRuleForMove(game, piece, { x: move.x, y: move.y })?.choices ?? PROMOTION_PIECE_TYPES;
}

function firstPlayerId(game: GameState): string | null {
  return game.pieces.find((p) => p.side === 'player' && p.alive)?.id ?? null;
}

/** First living piece of a given side (netplay pre-selects the side this client owns). */
function firstOwnId(game: GameState, side: Side): string | null {
  return game.pieces.find((p) => p.side === side && p.alive)?.id ?? null;
}

/**
 * The current selection if that piece is still a living piece of `side`, else null.
 * Lets the selection FOLLOW the piece the player is working with across a turn instead
 * of resetting — an enemy capture of that piece drops it, so callers fall back to a
 * default (the first own piece).
 */
function livingSelected(game: GameState, selectedId: string | null, side: Side): string | null {
  return game.pieces.some((p) => p.id === selectedId && p.alive && p.side === side) ? selectedId : null;
}

/** Result copy from THIS client's seat: in netplay 'you' is the local side, not 'player'. */
function netOutcomeCopy(winner: Winner, localSide: PlayingSide): string {
  if (winner === 'draw') return 'Draw — the skirmish is even.';
  return winner === localSide ? 'Victory — the field is yours.' : 'Defeat — your force has fallen.';
}

function adjudicationResultDetail(adjudication: Adjudication | null, localSide: PlayingSide, authored: boolean): string | null {
  if (!adjudication) return null;
  if (adjudication.kind === 'victory-rule') {
    return authored
      ? adjudication.rule.name?.trim() || null
      : victoryRuleDetailForSide(adjudication.rule, localSide);
  }
  return DRAW_RESULT_DETAIL[adjudication.kind];
}

function adjudicationCopy(
  adjudication: Adjudication,
  localSide: PlayingSide,
  authored: boolean,
): string {
  if (adjudication.kind === 'victory-rule') {
    const detail = authored
      ? adjudication.rule.name?.trim()
      : victoryRuleDetailForSide(adjudication.rule, localSide);
    return `${adjudication.winner === localSide ? 'Victory' : 'Defeat'}${detail ? ` — ${detail}.` : '.'}`;
  }
  if (adjudication.kind === 'checkmate') {
    return adjudication.winner === localSide ? 'Checkmate — victory!' : 'Checkmate — defeat.';
  }
  if (adjudication.kind === 'stalemate') return 'Stalemate — the skirmish is a draw.';
  return DRAW_RULE_COPY[adjudication.kind];
}

/** Enemy decision policies (dev A/B lever: `?ai=greedy` on the skirmish route). The live reply
 *  is resolved OFF the main thread — see game/enemyReply (the pure resolver) and
 *  game/aiWorkerClient (the worker client), so a deep search never freezes the board. */
export type AiMode = 'search' | 'greedy';

/** The player's battle clock (per-level time control; the enemy is untimed). */
export interface ClockState {
  /** Remaining ms. While running this is display-quantized (whole seconds; tenths
   * under 10s) so subscribers re-render only when the readout changes — the exact
   * deadline lives outside state and is re-read whenever the clock pauses. */
  remainingMs: number;
  /** True while the clock is counting down — the player's live turn only. */
  running: boolean;
  /** Fischer increment (ms) banked after every completed player move. */
  incrementMs: number;
}

export interface PendingPromotion {
  mode: 'move' | 'premove';
  pieceId: string;
  move: Move;
  choices: readonly PromotionPieceType[];
}

export interface SkirmishState {
  game: GameState;
  /** Indexed terrain for the current game; movement generation reads this. */
  env: MoveEnv;
  selectedId: string | null;
  focusedId: string | null;
  seed: number;
  tick: number;
  log: string[];
  /** Win condition for this game. A free skirmish defaults to capture-king. */
  objective: ObjectiveType;
  /** Static objective context for the current game — the survive clock target, the
   * reach destination cells, and which side fields THE King (kingSide, computed from
   * the starting pieces for level AND free games alike). */
  objectiveCtx: ObjectiveContext;
  /** An authored win/lose OVERRIDE for this game (ADR-0064): `level.victory` when the level
   * carried one, else null to fall back to the `objective` preset (victoryRulesForObjective,
   * resolved at eval time). Stored as the override — not the resolved rules — so `objective` +
   * `objectiveCtx` stay the single source of truth for preset games; the eval sites derive the
   * preset rules each turn, matching how evaluateObjective always worked. */
  victoryOverride: VictoryRules | null;
  /** The name of the victory rule that just ENDED this game (ADR-0064), for the result screen's
   * "how it ended" line — set the moment a rule fires, null otherwise (fresh game, or a win by
   * checkmate / clock / draw / resignation, which the screen shows as the plain objective goal). */
  resultDetail: string | null;
  /** Completed player→enemy rounds — the clock the `survive` objective counts. */
  turnsElapsed: number;
  /** True once newSkirmish has built a real game (vs the module-load placeholder). */
  started: boolean;
  /** Level this game is testing (null = free skirmish). Lets the screen tell
   * "resume the same board" from "launch a different level". */
  levelId: string | null;
  /** Enemy decision policy for this game. 'search' is the rung-1 objective-aware
   * search AI (core/ai); 'greedy' keeps the legacy capture-else-random policy
   * reachable for A/B feel comparison via `?ai=greedy`. */
  aiMode: AiMode;
  /** The battle clock, when the level authored one (null = untimed). */
  clock: ClockState | null;
  /** A local pawn has chosen a promotion-zone move and is waiting for the piece choice. */
  pendingPromotion: PendingPromotion | null;
  /** Monotonic match-session identity. Every delayed callback captures this value and
   *  no-ops after any new/resumed/network match replaces its owner. */
  sessionEpoch: number;
  /** Multiplayer context (null = single-player). When set, the AI never fires and
   *  input is gated to `net.localSide` instead of 'player'. */
  net: NetState | null;
  newSkirmish: (opts: SkirmishOptions) => void;
  /** Start a multiplayer match: build the shared (level, seed) board, record which
   *  side this client controls, disable the local AI + clock, and route local moves
   *  to the relay sink. Both clients call this with the SAME level + seed. */
  newNetMatch: (opts: NetMatchOptions) => void;
  /** Apply the next move that arrived over the relay, including this seat's own echo
   *  (no AI, no re-emit). Re-validates legality before applying. */
  applyRemoteMove: (pieceId: string, move: RelayMove, intentId?: string) => void;
  /** Clear a rejected/authoritatively absent local move intent, iff it still belongs to
   *  `expectedMoveCount`. Restores the selected piece when it remains locally owned. */
  rejectNetMove: (expectedMoveCount: number) => void;
  /** Mark a move whose POST and recovery GET both failed. It stays locked while the
   *  transport retries the exact same stable intent id. */
  markNetMoveUncertain: (expectedMoveCount: number) => void;
  /** Freeze gesture-local input when server authority stops the relay (result agreement,
   *  dispute, or desync) without discarding an unresolved durable move identity. */
  freezeNetInput: () => void;
  /** Invalidate and clear a lobby-owned local session when its route is left. */
  leaveNetSession: (lobbyId: string) => void;
  /** Concede a multiplayer match: relay the resignation to the lobby. The game itself
   *  ends only when the server's terminal result echoes back via `concludeNet`. No-op
   *  outside netplay or once the game is decided. */
  resign: () => void;
  /** Concede the current single-player board immediately. Netplay uses `resign` above
   *  because its terminal result must be sequenced by the lobby server. */
  resignLocal: () => void;
  /** End a netplay match by a non-move terminal event (a resignation relayed by the
   *  server). Sets the winner directly and logs the outcome from this seat. Idempotent —
   *  a duplicate/redelivered lobby frame is ignored once the game is decided. */
  concludeNet: (winner: Winner, reason: 'resign' | NetGameResultReason) => void;
  /** Rehydrate a match saved to disk (see matchPersistence) — used to resume the
   * live board after a page reload instead of starting a fresh game. */
  resumeMatch: (match: PersistedMatch) => void;
  select: (id: string | null) => void;
  focus: (id: string | null) => void;
  movesForSelected: () => Move[];
  tryMoveTo: (x: number, y: number) => void;
  choosePromotion: (type: PromotionPieceType) => void;
  /** Moves queued while the opponent is thinking (premoves), fired one-per-turn as
   *  control returns. Ephemeral — dropped on reload, never persisted. */
  premoves: PremoveStep[];
  /** True during the short post-enemy-reply landing beat. The rules board has already
   *  advanced back to the player, but input still belongs to premove generation until
   *  the opponent's visible move settles. */
  premoveInputOpen: boolean;
  /** Append a premove for `pieceId` → (x, y) to the chain, validated against the
   *  provisional board (current board + the moves already queued). No-op on the
   *  player's own live turn unless the post-reply premove input window is open. */
  queueMove: (pieceId: string, x: number, y: number) => void;
  /** Drop the whole queued chain (bound to Escape). */
  clearPremoves: () => void;
  /** Test-board only: true while playing a `?mode=test` board, which surfaces the Test Board's
   *  controls (the CPU-delay floor). False for real/campaign play. */
  testMode: boolean;
  /** Test-board only: a MINIMUM CPU think time (ms) floored onto ENEMY_REPLY_DELAY to widen the
   *  premove window for testing. 0 = off, and forced to 0 outside test mode so real play is
   *  untouched. The player's clock is already paused across the reply, so the extra wait costs
   *  the tester nothing — a deliberate softball. */
  testMinCpuDelayMs: number;
  /** Enter/leave test-board mode. Leaving resets the CPU-delay floor so it can never leak into
   *  real play. */
  setTestMode: (on: boolean) => void;
  /** Set the test-board CPU-delay floor (ms); no-op outside test mode. */
  setTestMinCpuDelay: (ms: number) => void;
}

/**
 * Decide whether entering the skirmish screen should build a fresh game or
 * resume the one already in the store. The store is a module singleton that
 * survives route changes, so navigating to the menu and back must NOT restart a
 * live board. Start fresh only when there is nothing worth resuming: no game has
 * been started, the last one already finished, or a different level is opened.
 */
export function shouldStartFreshSkirmish(
  state: Pick<SkirmishState, 'started' | 'game' | 'levelId'> & { net?: NetState | null },
  requestedLevelId: string | null,
): boolean {
  return !!state.net || !state.started || state.game.winner !== null || state.levelId !== requestedLevelId;
}

const INITIAL_GAME = createSkirmish({ seed: 1 });

export const useSkirmish = create<SkirmishState>((set, get) => {
  let matchEpoch = 0;
  let enemyReplyTimer: ReturnType<typeof setTimeout> | null = null;
  let premoveFireTimer: ReturnType<typeof setTimeout> | null = null;
  const sessionEffectTimers = new Set<ReturnType<typeof setTimeout>>();

  // ---- Battle clock ----------------------------------------------------------
  // Standard chess-clock rules for the PLAYER only: the clock runs while it's their
  // live turn, pauses the moment their move applies (banking the Fischer increment),
  // and resumes when the enemy reply hands the turn back. The truth is a wall-clock
  // DEADLINE, not a decremented counter — ticks just re-derive the remainder, so a
  // throttled background tab can't stretch the player's time. The store is a module
  // singleton, so the ticker survives route changes exactly like the staged enemy
  // reply does; time honestly keeps running if the player wanders off mid-turn.
  let clockDeadline = 0;
  let clockTicker: ReturnType<typeof setInterval> | null = null;

  const stopClockTicker = () => {
    if (clockTicker !== null) { clearInterval(clockTicker); clockTicker = null; }
  };

  const cancelSessionAsync = () => {
    stopClockTicker();
    if (enemyReplyTimer !== null) { clearTimeout(enemyReplyTimer); enemyReplyTimer = null; }
    if (premoveFireTimer !== null) { clearTimeout(premoveFireTimer); premoveFireTimer = null; }
    for (const timer of sessionEffectTimers) clearTimeout(timer);
    sessionEffectTimers.clear();
  };

  /** Invalidate every callback owned by the previous match and return the new epoch. */
  const beginSession = (): number => {
    cancelSessionAsync();
    matchEpoch += 1;
    return matchEpoch;
  };

  /** Schedule cosmetic work in the current match generation. New/resume/net/conclude
   * cancels the handle, and the epoch check is a second guard against a racing callback. */
  const scheduleSessionEffect = (callback: () => void, delayMs: number): void => {
    const epoch = get().sessionEpoch;
    const timer = setTimeout(() => {
      sessionEffectTimers.delete(timer);
      if (get().sessionEpoch === epoch) callback();
    }, Math.max(0, delayMs));
    sessionEffectTimers.add(timer);
  };

  const playLandingSfx = (env: MoveEnv, x: number, y: number, delayMs: number, gain?: number): void => {
    if (delayMs > 0) scheduleSessionEffect(() => playLandingTerrain(env, x, y, gain), delayMs);
    else playLandingTerrain(env, x, y, gain);
  };

  // Flag fall: losing on time is a defeat like any other — turn locks, result copy
  // names the clock.
  const expireClock = () => {
    const cur = get();
    if (!cur.clock || cur.game.winner) return;
    const epoch = beginSession();
    set({
      game: { ...cur.game, winner: 'enemy', turn: 'done' },
      clock: { ...cur.clock, remainingMs: 0, running: false },
      selectedId: null,
      focusedId: null,
      sessionEpoch: epoch,
      pendingPromotion: null,
      premoves: [],
      premoveInputOpen: false,
      testMode: false,
      testMinCpuDelayMs: 0,
      log: ['Defeat — your clock ran out.', ...cur.log].slice(0, 12),
    });
    persistMatch(get()); // game decided → drops the saved copy
  };

  const tickClock = (epoch: number) => {
    const cur = get();
    if (cur.sessionEpoch !== epoch) { stopClockTicker(); return; }
    if (!cur.clock?.running) { stopClockTicker(); return; }
    const remaining = clockDeadline - Date.now();
    if (remaining <= 0) { expireClock(); return; }
    // Publish only when the READOUT would change (seconds; tenths under 10s), so the
    // 100ms ticker doesn't re-render subscribers ten times a second.
    const quantum = remaining < 10_000 ? 100 : 1000;
    const shown = Math.ceil(remaining / quantum) * quantum;
    if (shown !== cur.clock.remainingMs) set({ clock: { ...cur.clock, remainingMs: shown } });
  };

  /** Run the clock — a no-op unless the game is timed, live, and on the player's turn. */
  const startClock = () => {
    const cur = get();
    if (!cur.clock || cur.clock.running || cur.game.winner || cur.game.turn !== 'player') return;
    const epoch = cur.sessionEpoch;
    clockDeadline = Date.now() + cur.clock.remainingMs;
    stopClockTicker();
    clockTicker = setInterval(() => tickClock(epoch), 100);
    set({ clock: { ...cur.clock, running: true } });
  };

  /** Pause at the moment the player's move applies, banking the increment. Reads the
   * exact remainder off the deadline — not the quantized display value — so repeated
   * pause/resume cycles never drift. */
  const pauseClockWithIncrement = () => {
    const cur = get();
    if (!cur.clock?.running) return;
    stopClockTicker();
    const remainingMs = Math.max(0, clockDeadline - Date.now()) + cur.clock.incrementMs;
    set({ clock: { ...cur.clock, remainingMs, running: false } });
  };

  const finishPremoveInputBeat = (gameRef: GameState, epoch: number) => {
    const s = get();
    if (s.sessionEpoch !== epoch || s.game !== gameRef || s.game.winner || !s.premoveInputOpen) return;
    premoveFireTimer = null;
    if (s.premoves.length > 0) {
      const fired = drainPremove();
      if (fired) return;
    }
    set({ premoveInputOpen: false });
    startClock();
    persistMatch(get());
  };

  const schedulePremoveInputBeat = (gameRef: GameState) => {
    const epoch = get().sessionEpoch;
    if (premoveFireTimer !== null) clearTimeout(premoveFireTimer);
    premoveFireTimer = setTimeout(() => finishPremoveInputBeat(gameRef, epoch), PREMOVE_FIRE_DELAY);
  };

  // Stage the enemy half-turn after a beat so it reads as a reply, not a mirror
  // of the player's click. The turn is already flipped to 'enemy' (which locks
  // player input) before this fires.
  const scheduleEnemyReply = () => {
    // A Test Board can floor the CPU's think time (testMinCpuDelayMs) to widen the premove
    // window; real/campaign play leaves it 0, so this is exactly ENEMY_REPLY_DELAY.
    const scheduled = get();
    const epoch = scheduled.sessionEpoch;
    const gameRef = scheduled.game;
    const delay = Math.max(ENEMY_REPLY_DELAY, scheduled.testMinCpuDelayMs);
    if (enemyReplyTimer !== null) clearTimeout(enemyReplyTimer);
    enemyReplyTimer = setTimeout(() => {
      enemyReplyTimer = null;
      const cur = get();
      // Bail if a new game reset the turn, or it somehow already resolved.
      if (cur.sessionEpoch !== epoch || cur.game !== gameRef || cur.net || cur.game.turn !== 'enemy' || cur.game.winner) return;
      // Resolve the reply OFF the main thread (game/aiWorker) so the board stays live —
      // animation AND premove input — for the whole think. The search is node-bounded and
      // deterministic, so the worker returns the identical move to an inline resolve; only
      // WHERE it computes changes. The live opponent uses this level's ADOPTED weights when the
      // Training Gym has adopted a champion for it (else the shipped defaults), resolved here on
      // the main thread and passed into the worker; the search needs the objective framing so it
      // plays the MODE (hunt the King, rush the survive clock, garrison the reach zone).
      requestEnemyReply(
        {
          game: cur.game,
          seed: cur.seed,
          tick: cur.tick,
          aiMode: cur.aiMode,
          objective: cur.objective,
          ctx: cur.objectiveCtx ?? {},
          turnsElapsed: cur.turnsElapsed ?? 0,
          victoryRules: cur.victoryOverride ?? victoryRulesForObjective(cur.objective, cur.objectiveCtx ?? {}),
          weights: adoptedWeightsFor(cur.levelId),
        },
        (enemyRes) => {
          // The worker computed while the board was live; make sure nothing replaced the board
          // meanwhile (a new game / a resume) before applying its move. Premove selection can
          // legitimately change while the worker thinks, so read the latest live slice here.
          const live = get();
          if (live.sessionEpoch !== epoch || live.game !== cur.game || live.net) return;
          const msgs = enemyRes.events.map(describeEvent).filter((m): m is string => m !== null);
          const afterEnv = envFor(enemyRes.game);
          // A full player→enemy round just elapsed: advance the survive clock, then re-check the
          // objective — survive reached, or a player wipe = defeat.
          const turnsElapsed = (cur.turnsElapsed ?? 0) + 1;
          const ctx = { ...(cur.objectiveCtx ?? {}), turnsElapsed };
          const settled = settleCommittedPosition(enemyRes.game, {
            victoryRules: cur.victoryOverride ?? victoryRulesForObjective(cur.objective, ctx),
            ctx,
            turnsElapsed,
            env: afterEnv,
          });
          const game = settled.state;
          const resultDetail = adjudicationResultDetail(settled.adjudication, 'player', !!cur.victoryOverride);
          if (settled.adjudication) {
            msgs.push(adjudicationCopy(settled.adjudication, 'player', !!cur.victoryOverride));
          } else if (sideInCheck(game, 'player', afterEnv)) msgs.push('Your King is in check!');
          // Turn returns to the player: keep the piece they were working with selected so the
          // board reads continuously. That can change while the enemy reply is in flight when the
          // player picks a premove unit, so use the latest store selection rather than `cur`.
          // A null latest selection is deliberate (the player clicked away while the reply
          // was in flight), so preserve it. Only fall back when a selected unit existed but
          // the reply captured it.
          const keep = live.selectedId === null
            ? null
            : livingSelected(game, live.selectedId, 'player') ?? firstPlayerId(game);
          const openPremoveInput = !game.winner && game.turn === 'player';
          set({
            game,
            env: envFor(game),
            tick: enemyRes.tick,
            turnsElapsed,
            resultDetail,
            selectedId: keep,
            focusedId: keep,
            log: [...msgs.reverse(), ...live.log].slice(0, 12),
            premoveInputOpen: openPremoveInput,
          });
          // Footsteps for the enemy half-turn: one per piece that moved, spread out so a
          // multi-move reply reads as a sequence, not one muddy stack. Terrain is static, so the
          // pre-reply env indexes the same board the pieces landed on.
          enemyRes.events
            .filter((e): e is Extract<GameEvent, { kind: 'moved' }> => e.kind === 'moved')
            .forEach((e, i) => playLandingSfx(cur.env, e.to.x, e.to.y, LANDING_SFX_DELAY + i * ENEMY_LANDING_STAGGER));
          // The rules board is back with the player, but input still belongs to premove
          // generation for the enemy landing beat. The clock resumes only when that beat closes
          // without an auto-fired premove.
          // Persist the settled post-reply position now (a reload here resumes it; the queued
          // premove is ephemeral and intentionally not saved).
          persistMatch(get());
          // A queued premove fires after a visible beat rather than in this same frame, so the
          // player sees the enemy's move land with their queued arrow still on the board before
          // it executes. Premoves queued during that landing beat are accepted too.
          if (openPremoveInput) schedulePremoveInputBeat(game);
          else startClock();
        },
      );
    }, delay);
  };

  /** Submit one server-sequenced local intent without mutating the board. */
  const submitNetMove = (pieceId: string, move: RelayMove): boolean => {
    const s = get();
    if (!s.net || s.net.pendingMove || s.game.winner || s.game.turn !== s.net.localSide || !netMoveSink) return false;
    const durable = loadPersistedNetIntent(s.net.lobbyId, s.net.localSide);
    if (durable && durable.expectedMoveCount >= s.net.moveCount) {
      // Another tab or a just-reloaded instance already owns this seat's unresolved
      // gesture. Restore and (only at its exact current slot) retry that identity instead
      // of allowing this new click to race it.
      const restored: PendingNetMove = {
        intentId: durable.intentId,
        createdAt: durable.createdAt,
        expectedMoveCount: durable.expectedMoveCount,
        pieceId: durable.pieceId,
        move: durable.move,
        uncertain: true,
      };
      set({ net: { ...s.net, pendingMove: restored }, premoveInputOpen: false });
      if (durable.expectedMoveCount === s.net.moveCount) {
        try {
          netMoveSink(durable.pieceId, durable.move, durable.expectedMoveCount, durable.intentId);
        } catch (error) {
          console.warn('[netplay] restored move sink threw before relay retry', error);
        }
      }
      return false;
    }
    // The local board has authoritatively advanced past this journal entry (normally the
    // matching relay already cleared it); discard only that stale identity.
    if (durable) clearPersistedNetIntent(s.net.lobbyId, durable.intentId);
    const expectedMoveCount = s.net.moveCount;
    const intentId = createNetIntentId();
    const createdAt = Date.now();
    const pendingMove: PendingNetMove = { intentId, createdAt, expectedMoveCount, pieceId, move, uncertain: false };
    const persisted = persistNetIntent({
      lobbyId: s.net.lobbyId,
      localSide: s.net.localSide,
      intentId,
      createdAt,
      expectedMoveCount,
      pieceId,
      move,
    });
    if (!persisted) {
      console.error('[netplay] move blocked because no reload-durable intent journal is available');
      set({ log: ['Move not sent — browser storage is unavailable, so safe multiplayer retry is disabled.', ...s.log].slice(0, 12) });
      return false;
    }
    set({
      net: { ...s.net, pendingMove },
      premoveInputOpen: false,
    });
    try {
      netMoveSink(pieceId, move, expectedMoveCount, intentId);
      return true;
    } catch (error) {
      console.warn('[netplay] move sink threw before relay submission', error);
      const live = get();
      if (live.net?.pendingMove === pendingMove) {
        clearPersistedNetIntent(live.net.lobbyId, intentId);
        set({ net: { ...live.net, pendingMove: null } });
      }
      return false;
    }
  };

  // Apply a legal player move and run the full post-move pipeline: bank the clock
  // increment, apply, sound the footstep, evaluate the objective, detect checkmate/
  // stalemate/check on the enemy now to move, commit, stage the enemy reply, persist.
  // Shared by the live path (tryMoveTo) and the premove drain so an auto-fired premove
  // is byte-for-byte the same move a click would have made.
  const commitPlayerMove = (piece: Piece, mv: Move, promotion?: PromotionPieceType) => {
    const s = get();
    pauseClockWithIncrement();
    const playerRes = applyMove(s.game, piece.id, mv, { promotion });
    // The settled position joins the threefold table BEFORE the terminal checks read it
    // (a no-op unless this game enforces threefold). enemyEnv matches the post-move state.
    const enemyEnv = envFor(playerRes.state);
    const committed = recordPosition(playerRes.state, enemyEnv);
    // Footstep: only when the piece actually relocates, at the mover's real landing
    // square (a castle's gesture square can differ from where the king lands).
    if (playerRes.events.some((e) => e.kind === 'moved')) {
      playLandingSfx(s.env, mv.castle?.kingTo.x ?? mv.x, mv.castle?.kingTo.y ?? mv.y, LANDING_SFX_DELAY);
    }
    const msgs = playerRes.events.map(describeEvent).filter((m): m is string => m !== null);
    const ctx = { ...(s.objectiveCtx ?? {}), turnsElapsed: s.turnsElapsed ?? 0 };
    const settled = settleCommittedPosition(committed, {
      victoryRules: s.victoryOverride ?? victoryRulesForObjective(s.objective, ctx),
      ctx,
      turnsElapsed: s.turnsElapsed ?? 0,
      env: enemyEnv,
    });
    const game = settled.state;
    const resultDetail = adjudicationResultDetail(settled.adjudication, 'player', !!s.victoryOverride);
    if (settled.adjudication) {
      msgs.push(adjudicationCopy(settled.adjudication, 'player', !!s.victoryOverride));
    } else if (game.turn === 'enemy' && sideInCheck(game, 'enemy', enemyEnv)) {
      msgs.push('Check!');
    }
    // Keep the moved piece selected (the mover always survives its own move) so its
    // highlight carries through the enemy turn — input is gated by turn, so it shows no
    // move-dots and isn't actionable, it just keeps the player's context visible.
    set({
      game,
      env: enemyEnv,
      resultDetail,
      pendingPromotion: null,
      premoveInputOpen: false,
      selectedId: piece.id,
      focusedId: piece.id,
      log: [...msgs.reverse(), ...s.log].slice(0, 12),
    });
    if (game.turn === 'enemy' && !game.winner) scheduleEnemyReply();
    persistMatch(get());
  };

  // Drain one premove as control returns to this client. Returns true iff a premove was
  // applied locally or submitted as the next authoritative net intent. The head is
  // re-validated against the REAL board the opponent produced —
  // if its piece was captured or the square is no longer reachable, the WHOLE chain is
  // dropped (chess default: one illegal step kills the queue). A decided game clears the
  // queue too. When a premove fires, its move re-stages the enemy reply, so the next
  // reply's drain pops the next step and the chain plays out as a back-and-forth flurry.
  function drainPremove(): boolean {
    const s = get();
    if (s.premoves.length === 0) return false;
    const side = s.net ? s.net.localSide : 'player';
    if (s.net?.pendingMove) return false;
    if (s.game.turn !== side || s.game.winner) { set({ premoves: [], premoveInputOpen: false }); return false; }
    const [head, ...rest] = s.premoves;
    const p = s.game.pieces.find((q) => q.id === head.pieceId && q.alive && q.side === side);
    const mv = p ? legalMoves(p, s.game.pieces, s.game.size, s.env).find((m) => m.x === head.x && m.y === head.y) : undefined;
    if (!p || !mv) { set({ premoves: [], premoveInputOpen: false }); return false; }
    if (s.net) {
      if (!submitNetMove(p.id, { x: mv.x, y: mv.y, promotion: head.promotion })) return false;
      set({ premoves: rest, premoveInputOpen: false });
      return true;
    }
    set({ premoves: rest });
    commitPlayerMove(p, mv, head.promotion);
    // A premove that ended the game leaves the rest of the chain moot — drop it.
    if (get().game.winner) set({ premoves: [], premoveInputOpen: false });
    return true;
  }

  // Apply ONE ordered move to a netplay board. Netplay is SERVER-SEQUENCED: the local
  // player's own move comes back through the server echo like any other, so this is the
  // single apply path for both sides (no optimistic local apply → no rollback/desync).
  // Mirrors the bookkeeping tail of tryMoveTo (SFX, objective + terminal + check, log)
  // but NEVER runs the AI or the clock, and is side-agnostic. Returns true iff it applied.
  const commitNet = (pieceId: string, move: RelayMove, intentId?: string): boolean => {
    const s = get();
    if (!s.net || s.game.winner) return false;
    const piece = s.game.pieces.find((q) => q.id === pieceId && q.alive);
    if (!piece) { console.warn('[netplay] relayed move references a missing piece', pieceId); return false; }
    // Turn integrity: only the side whose turn it is may move. legalMoves ignores whose
    // turn it is and applyMove derives the next turn from piece.side, so without this a
    // tampered peer could move on our turn or move our pieces. Dropped identically on both
    // boards (deterministic), so they stay in lockstep.
    if (piece.side !== s.game.turn) { console.warn('[netplay] dropping out-of-turn relayed move', pieceId, s.game.turn, piece.side); return false; }
    const mv = legalMoves(piece, s.game.pieces, s.game.size, s.env).find((m) => m.x === move.x && m.y === move.y);
    if (!mv) { console.warn('[netplay] dropping illegal relayed move', pieceId, move); return false; }

    const localSide = s.net.localSide;
    const prevTurn = s.game.turn;
    const res = applyMove(s.game, piece.id, mv, { promotion: move.promotion });
    // Both clients fold the settled position into the threefold table here — the single
    // netplay apply path — so a rule draw fires identically on both boards.
    const postEnv = envFor(res.state);
    const committed = recordPosition(res.state, postEnv);
    const moved = res.events.some((event) => event.kind === 'moved');
    const msgs = res.events.map(describeEvent).filter((m): m is string => m !== null);
    // A full enemy turn completing (enemy→player) advances the survive-clock round count.
    const turnsElapsed = (s.turnsElapsed ?? 0) + (prevTurn === 'enemy' && committed.turn === 'player' ? 1 : 0);
    const ctx = { ...(s.objectiveCtx ?? {}), turnsElapsed };
    const settled = settleCommittedPosition(committed, {
      victoryRules: s.victoryOverride ?? victoryRulesForObjective(s.objective, ctx),
      ctx,
      turnsElapsed,
      env: postEnv,
    });
    const game = settled.state;
    const resultDetail = adjudicationResultDetail(settled.adjudication, localSide, !!s.victoryOverride);
    if (settled.adjudication) {
      msgs.push(adjudicationCopy(settled.adjudication, localSide, !!s.victoryOverride));
    } else if (game.turn === 'player' || game.turn === 'enemy') {
      if (sideInCheck(game, game.turn, postEnv)) msgs.push(game.turn === localSide ? 'Your King is in check!' : 'Check delivered.');
    }

    const selectedId = s.selectedId === null ? null : livingSelected(game, s.selectedId, localSide);
    const focusedId = game.pieces.some((candidate) => candidate.id === s.focusedId && candidate.alive)
      ? s.focusedId
      : selectedId;
    const pending = s.net.pendingMove;
    const clearsPending = pending?.expectedMoveCount === s.net.moveCount;
    if (clearsPending && (
      pending.intentId !== intentId
      || pending.pieceId !== pieceId
      || !sameRelayMove(pending.move, move)
    )) {
      console.warn('[netplay] authoritative relay replaced a different pending local intent', pending, { intentId, pieceId, move });
    }
    if (clearsPending && pending) clearPersistedNetIntent(s.net.lobbyId, pending.intentId);
    const returnedToLocal = !game.winner && prevTurn !== localSide && game.turn === localSide;
    const nextEpoch = game.winner ? beginSession() : s.sessionEpoch;
    set({
      game,
      env: postEnv,
      resultDetail,
      turnsElapsed,
      selectedId,
      focusedId,
      sessionEpoch: nextEpoch,
      pendingPromotion: null,
      premoves: game.winner ? [] : s.premoves,
      premoveInputOpen: returnedToLocal,
      log: [...msgs.reverse(), ...s.log].slice(0, 12),
      net: {
        ...s.net,
        moveCount: s.net.moveCount + 1,
        pendingMove: clearsPending ? null : pending,
        terminalResult: settled.adjudication
          ? {
              expectedMoveCount: s.net.moveCount + 1,
              winner: settled.adjudication.winner,
              reason: settled.adjudication.kind,
            }
          : s.net.terminalResult,
      },
    });
    if (moved) playLandingSfx(s.env, mv.castle?.kingTo.x ?? mv.x, mv.castle?.kingTo.y ?? mv.y, LANDING_SFX_DELAY);
    if (returnedToLocal) schedulePremoveInputBeat(game);
    return true;
  };

  return {
  game: INITIAL_GAME,
  env: envFor(INITIAL_GAME),
  selectedId: null,
  focusedId: null,
  seed: 1,
  tick: 0,
  log: [`Skirmish begins — ${objectiveSummary('capture-king')}.`],
  objective: 'capture-king',
  objectiveCtx: {},
  victoryOverride: null,
  resultDetail: null,
  turnsElapsed: 0,
  started: false,
  levelId: null,
  aiMode: 'search',
  clock: null,
  pendingPromotion: null,
  sessionEpoch: 0,
  net: null,
  premoves: [],
  premoveInputOpen: false,
  testMode: false,
  testMinCpuDelayMs: 0,

  newSkirmish: (opts) => {
    const epoch = beginSession();
    const created = createSkirmish(opts);
    const env = envFor(created);
    const objective: ObjectiveType = opts.level?.objective ?? 'capture-king';
    // Uniform for level AND free games (ADR-0050): the level's static context (survive
    // clock / reach cells) plus kingSide read off the ACTUAL starting pieces — a free
    // skirmish fields the King on the enemy side, so its copy stays "Capture the enemy
    // King", while a level whose author gave the player the King flips to "Protect".
    const objectiveCtx: ObjectiveContext = {
      ...(opts.level ? objectiveContextForLevel(opts.level) : {}),
      kingSide: kingSideOf(created.pieces),
    };
    // The level's authored win/lose lists override the preset (ADR-0064); null ⇒ the eval sites
    // derive the `objective` preset each turn from objectiveCtx (kingSide / survive target).
    const victoryOverride: VictoryRules | null = opts.level?.victory ?? null;
    const initial = settleCommittedPosition(created, {
      victoryRules: victoryOverride ?? victoryRulesForObjective(objective, objectiveCtx),
      ctx: objectiveCtx,
      turnsElapsed: 0,
      env,
    });
    const game = initial.state;
    const resultDetail = adjudicationResultDetail(initial.adjudication, 'player', !!victoryOverride);
    const intro = opts.level
      ? `Test play begins — objective: ${objectiveSummary(objective, objectiveCtx.kingSide)}.`
      : `Skirmish begins — ${objectiveSummary(objective, objectiveCtx.kingSide)}.`;
    const selectedId = game.winner ? null : firstPlayerId(game);
    const log = initial.adjudication
      ? [adjudicationCopy(initial.adjudication, 'player', !!victoryOverride), intro]
      : [intro];
    // Arm the battle clock. An explicit opts.timeControl wins (the HUD's clock control /
    // "New skirmish" — a TimeControl times the game, null plays it untimed). Otherwise a
    // level uses its authored control (undefined ⇒ untimed), and a FREE skirmish (no
    // level) defaults to DEFAULT_TIME_CONTROL (5:00) so random battles are timed like a
    // real game rather than open-ended.
    const tc: TimeControl | null = opts.timeControl !== undefined
      ? opts.timeControl
      : opts.level
        ? opts.level.timeControl ?? null
        : DEFAULT_TIME_CONTROL;
    const clock: ClockState | null = tc
      ? { remainingMs: tc.initialSeconds * 1000, running: false, incrementMs: tc.incrementSeconds * 1000 }
      : null;
    // An explicit opts.ai wins; otherwise keep the running mode (a HUD retry
    // preserves the A/B lever the route set on entry).
    set({ game, env, seed: opts.seed, tick: 0, turnsElapsed: 0, objectiveCtx, victoryOverride, resultDetail, selectedId, focusedId: selectedId, log, objective, started: true, levelId: opts.level?.id ?? null, aiMode: opts.ai ?? get().aiMode, clock, pendingPromotion: null, sessionEpoch: epoch, net: null, premoves: [], premoveInputOpen: false });
    // The clock starts with the game — it is the player's move from the first beat
    // (a degenerate instant-draw start is guarded inside startClock).
    startClock();
    // "Units come onto the board": a soft staggered roll-call as the player's force
    // deploys. Each unit sounds the terrain it lands on (softer, gain 0.7) layered
    // with the authored "arrival" thump (playArrival) — the landing.mp3 that plays
    // when a unit first arrives, combined with its terrain. Spread out so a whole
    // squad arriving reads as a roll-call swell, not one loud stack. Silent until a
    // gesture arms the AudioContext — entering a skirmish is one, so the navigating
    // click covers it.
    game.pieces
      .filter((pc) => pc.alive && pc.side === 'player')
      .forEach((pc, i) => {
        const delay = SPAWN_SFX_BASE_DELAY + i * SPAWN_SFX_STAGGER;
        playLandingSfx(env, pc.x, pc.y, delay, 0.7);
        scheduleSessionEffect(() => playArrival({ gain: ARRIVAL_BAKED.gain }), delay);
      });
    // Snapshot the fresh board immediately, so a reload before the first move
    // resumes THIS game rather than re-rolling a different random start.
    persistMatch(get());
  },

  newNetMatch: ({ lobbyId, localSide, level, seed }) => {
    const epoch = beginSession();
    // Both clients build the SAME board from (level, seed); with the AI disabled the
    // only randomness is initial placement, so the two boards are byte-identical.
    const created = createSkirmish({ seed, level });
    const env = envFor(created);
    const objective: ObjectiveType = level.objective ?? 'capture-king';
    const objectiveCtx: ObjectiveContext = { ...objectiveContextForLevel(level), kingSide: kingSideOf(created.pieces) };
    const victoryOverride = level.victory ?? null;
    const victoryRules = victoryOverride ?? victoryRulesForObjective(objective, objectiveCtx);
    const initial = settleCommittedPosition(created, {
      victoryRules,
      ctx: objectiveCtx,
      turnsElapsed: 0,
      env,
    });
    const game = initial.state;
    const localTurn = !game.winner && game.turn === localSide;
    const selectedId = localTurn ? firstOwnId(game, localSide) : null;
    const youCommand = localSide === 'player' ? 'the vanguard' : 'the challenger';
    const intro = `Multiplayer skirmish — ${objectiveBriefingForSide(victoryRules, localSide).summary}. You command ${youCommand}.`;
    const log = initial.adjudication
      ? [adjudicationCopy(initial.adjudication, localSide, !!victoryOverride), intro]
      : [intro];
    const durableIntent = loadPersistedNetIntent(lobbyId, localSide);
    if (initial.adjudication && durableIntent) clearPersistedNetIntent(lobbyId, durableIntent.intentId);
    const restoredPending: PendingNetMove | null = !initial.adjudication && durableIntent
      ? {
          intentId: durableIntent.intentId,
          createdAt: durableIntent.createdAt,
          expectedMoveCount: durableIntent.expectedMoveCount,
          pieceId: durableIntent.pieceId,
          move: durableIntent.move,
          uncertain: true,
        }
      : null;
    set({
      game,
      env,
      seed,
      tick: 0,
      turnsElapsed: 0,
      objective,
      objectiveCtx,
      // Netplay honours the level's own authored victory (else the objective preset); resetting it
      // here also stops a prior single-player game's override leaking into the match.
      victoryOverride,
      resultDetail: adjudicationResultDetail(initial.adjudication, localSide, !!victoryOverride),
      selectedId,
      focusedId: selectedId,
      log,
      started: true,
      levelId: level.id,
      clock: null, // netplay is untimed in v1 (a shared wall-clock is future work)
      pendingPromotion: null,
      sessionEpoch: epoch,
      premoves: [],
      premoveInputOpen: false,
      testMode: false,
      testMinCpuDelayMs: 0,
      net: {
        lobbyId,
        localSide,
        moveCount: 0,
        pendingMove: restoredPending,
        terminalResult: initial.adjudication
          ? { expectedMoveCount: 0, winner: initial.adjudication.winner, reason: initial.adjudication.kind }
          : null,
        authoritativeResult: null,
      },
    });
    // Deploy roll-call for the pieces this client commands (cosmetic; each client
    // voices only its own side).
    created.pieces
      .filter((pc) => pc.alive && pc.side === localSide)
      .forEach((pc, i) => {
        const delay = SPAWN_SFX_BASE_DELAY + i * SPAWN_SFX_STAGGER;
        playLandingSfx(env, pc.x, pc.y, delay, 0.7);
        scheduleSessionEffect(() => playArrival({ gain: 0.55 }), delay);
      });
  },

  applyRemoteMove: (pieceId, move, intentId) => { commitNet(pieceId, move, intentId); },

  rejectNetMove: (expectedMoveCount) => {
    const s = get();
    const pending = s.net?.pendingMove;
    if (!s.net || !pending || pending.expectedMoveCount !== expectedMoveCount) return;
    const selectedId = livingSelected(s.game, s.selectedId, s.net.localSide)
      ?? livingSelected(s.game, pending.pieceId, s.net.localSide);
    const focusedId = s.game.pieces.some((piece) => piece.id === s.focusedId && piece.alive)
      ? s.focusedId
      : selectedId;
    clearPersistedNetIntent(s.net.lobbyId, pending.intentId);
    set({
      net: { ...s.net, pendingMove: null },
      selectedId,
      focusedId,
      pendingPromotion: null,
      premoveInputOpen: false,
    });
  },

  markNetMoveUncertain: (expectedMoveCount) => {
    const s = get();
    const pending = s.net?.pendingMove;
    if (!s.net || !pending || pending.expectedMoveCount !== expectedMoveCount || pending.uncertain) return;
    set({ net: { ...s.net, pendingMove: { ...pending, uncertain: true } } });
  },

  freezeNetInput: () => {
    const s = get();
    if (!s.net) return;
    set({
      selectedId: null,
      pendingPromotion: null,
      premoves: [],
      premoveInputOpen: false,
    });
  },

  leaveNetSession: (lobbyId) => {
    const s = get();
    if (!s.net || s.net.lobbyId !== lobbyId) return;
    const epoch = beginSession();
    set({
      started: false,
      levelId: null,
      victoryOverride: null,
      resultDetail: null,
      turnsElapsed: 0,
      selectedId: null,
      focusedId: null,
      sessionEpoch: epoch,
      pendingPromotion: null,
      premoves: [],
      premoveInputOpen: false,
      testMode: false,
      testMinCpuDelayMs: 0,
      clock: null,
      net: null,
    });
  },

  resign: () => {
    const s = get();
    // Only meaningful in a live netplay match. The winner isn't set here — the server
    // echoes the terminal result back over the lobby channel and concludeNet ends the
    // game on both boards symmetrically (same single-apply discipline as moves).
    if (!s.net || s.game.winner) return;
    if (netResignSink) netResignSink();
  },

  resignLocal: () => {
    const s = get();
    if (s.net || s.game.winner || !s.started) return;
    const epoch = beginSession();
    set({
      game: { ...s.game, winner: 'enemy', turn: 'done' },
      selectedId: null,
      focusedId: null,
      sessionEpoch: epoch,
      premoves: [],
      premoveInputOpen: false,
      pendingPromotion: null,
      resultDetail: null,
      clock: s.clock ? { ...s.clock, running: false } : null,
      testMode: false,
      testMinCpuDelayMs: 0,
      log: ['Defeat — you resigned.', ...s.log].slice(0, 12),
    });
    persistMatch(get()); // game decided → drops the saved copy
  },

  concludeNet: (winner, reason) => {
    const s = get();
    if (!s.net || s.net.authoritativeResult) return; // first published server frame wins
    if (s.game.winner === winner && reason !== 'resign') {
      set({ net: { ...s.net, authoritativeResult: { winner, reason } } });
      return;
    }
    const epoch = beginSession();
    const localSide = s.net.localSide;
    if (s.net.pendingMove) clearPersistedNetIntent(s.net.lobbyId, s.net.pendingMove.intentId);
    const copy = reason === 'resign'
      ? (winner === localSide ? 'Victory — your opponent resigned.' : 'Defeat — you resigned.')
      : netOutcomeCopy(winner, localSide);
    set({
      game: { ...s.game, winner, turn: 'done' },
      selectedId: null,
      focusedId: null,
      sessionEpoch: epoch,
      pendingPromotion: null,
      resultDetail: reason === 'resign' ? null : s.resultDetail,
      premoves: [],
      premoveInputOpen: false,
      testMode: false,
      testMinCpuDelayMs: 0,
      net: {
        ...s.net,
        pendingMove: null,
        terminalResult: reason === 'resign' ? null : s.net.terminalResult,
        authoritativeResult: { winner, reason },
      },
      log: [copy, ...s.log].slice(0, 12),
    });
  },

  resumeMatch: (match) => {
    const epoch = beginSession();
    const env = envFor(match.game);
    const victoryOverride = match.victoryOverride ?? null;
    const settled = settleCommittedPosition(match.game, {
      victoryRules: victoryOverride ?? victoryRulesForObjective(match.objective, match.objectiveCtx),
      ctx: match.objectiveCtx,
      turnsElapsed: match.turnsElapsed,
      env,
    });
    const game = settled.state;
    const selectedId = game.winner ? null : firstPlayerId(game);
    const log = settled.adjudication
      ? [adjudicationCopy(settled.adjudication, 'player', !!victoryOverride), ...match.log].slice(0, 12)
      : match.log;
    set({
      game,
      env,
      seed: match.seed,
      tick: match.tick,
      turnsElapsed: match.turnsElapsed,
      objective: match.objective,
      objectiveCtx: match.objectiveCtx,
      // Back-compat: a match saved before ADR-0064 has no override → preset (null).
      victoryOverride,
      resultDetail: adjudicationResultDetail(settled.adjudication, 'player', !!victoryOverride),
      log,
      levelId: match.levelId,
      // Restore the enemy policy so the ?ai=greedy A/B lever survives a reload
      // (older snapshots predate the field ⇒ default to the search AI).
      aiMode: match.aiMode ?? 'search',
      selectedId,
      focusedId: selectedId,
      started: true,
      // A queued premove is ephemeral thinking-time intent — a reload drops it, like
      // navigating away mid-plan.
      premoves: [],
      premoveInputOpen: false,
      pendingPromotion: null,
      sessionEpoch: epoch,
      // Resume with the clock paused; startClock re-arms the deadline from the
      // banked remainder when it's the player's live turn. A reload isn't thinking
      // time, so the player keeps the time they had at their last move.
      clock: match.clock ? { ...match.clock, running: false } : null,
      net: null, // netplay disables persistence, so a disk-resumed match is single-player
      testMode: false,
      testMinCpuDelayMs: 0,
    });
    startClock();
    // If the reload caught the game mid enemy-reply (the player had just moved, the
    // turn was handed to 'enemy', but the staged setTimeout died with the old page),
    // re-stage it — otherwise the board soft-locks: player input is locked on the
    // enemy turn with no reply pending. The enemy is deterministic on (game, seed,
    // tick), all restored, so the re-staged reply is exactly the one that was lost.
    if (game.turn === 'enemy' && !game.winner) scheduleEnemyReply();
  },

  select: (id) => {
    if (id === null) { set({ selectedId: null, focusedId: null }); return; }
    const s = get();
    const side = s.net ? s.net.localSide : 'player';
    const p = s.game.pieces.find((q) => q.id === id && q.alive);
    if (p && p.side === side) set({ selectedId: id, focusedId: id });
  },

  focus: (id) => {
    if (id === null) { set({ focusedId: get().selectedId }); return; }
    const s = get();
    const side = s.net ? s.net.localSide : 'player';
    const p = s.game.pieces.find((q) => q.id === id && q.alive);
    if (!p) return;
    set({ focusedId: id, selectedId: p.side === side ? id : s.selectedId });
  },

  movesForSelected: () => {
    const { game, selectedId, env, net, pendingPromotion } = get();
    if (pendingPromotion || net?.pendingMove) return [];
    const side = net ? net.localSide : 'player';
    if (game.turn !== side || game.winner) return [];
    const p = game.pieces.find((q) => q.id === selectedId && q.alive && q.side === side);
    return p ? legalMoves(p, game.pieces, game.size, env) : [];
  },

  tryMoveTo: (x, y) => {
    const s = get();
    const side = s.net ? s.net.localSide : 'player';
    if (s.pendingPromotion || s.net?.pendingMove) return;
    if (s.game.turn !== side || s.game.winner) return;
    const p = s.game.pieces.find((q) => q.id === s.selectedId && q.alive && q.side === side);
    if (!p) return;
    const mv = legalMoves(p, s.game.pieces, s.game.size, s.env).find((m) => m.x === x && m.y === y);
    if (!mv) return;
    if (movePromotesPawn(s.game, p, mv)) {
      set({ pendingPromotion: { mode: 'move', pieceId: p.id, move: mv, choices: promotionChoicesForMove(s.game, p, mv) }, premoves: [], premoveInputOpen: false });
      return;
    }
    // Netplay is server-sequenced: DON'T apply locally — relay the target cell and let
    // the server's echo apply it in order on both boards (no optimistic apply, so a
    // dropped POST is a no-op the seat can retry, never a permanent desync). Clear the
    // selection for immediate "click registered" feedback; the echo sets the next one.
    if (s.net) { submitNetMove(p.id, { x: mv.x, y: mv.y }); return; }
    // A deliberate manual move overrides any premove queued during the fire-beat — the
    // player took the wheel, so drop the chain rather than firing it a beat later.
    if (s.premoves.length || s.premoveInputOpen) set({ premoves: [], premoveInputOpen: false });
    // Single-player: the move's rhythm — it lands on its own so it animates and reads, then
    // a beat, then the enemy answers — lives in commitPlayerMove, shared with the premove
    // drain so an auto-fired premove is byte-for-byte the same move a click would make.
    commitPlayerMove(p, mv);
  },

  choosePromotion: (type) => {
    const s = get();
    const pending = s.pendingPromotion;
    if (!pending || !pending.choices.includes(type)) return;
    const side = s.net ? s.net.localSide : 'player';

    if (pending.mode === 'premove') {
      const projected = provisionalBoard(s.game, s.premoves, side);
      const p = projected.pieces.find((q) => q.id === pending.pieceId && q.alive && q.side === side);
      const mv = premoveTargets(s.game, s.premoves, pending.pieceId, side)
        .find((move) => move.x === pending.move.x && move.y === pending.move.y);
      if (!p || !mv || !movePromotesPawn(projected, p, mv)) {
        set({ pendingPromotion: null });
        return;
      }
      set({
        pendingPromotion: null,
        premoves: [...s.premoves, { pieceId: p.id, x: mv.x, y: mv.y, promotion: type }],
      });
      return;
    }

    const p = s.game.pieces.find((q) => q.id === pending.pieceId && q.alive && q.side === side);
    const mv = p
      ? legalMoves(p, s.game.pieces, s.game.size, s.env).find((m) => m.x === pending.move.x && m.y === pending.move.y)
      : undefined;
    if (!p || !mv || !movePromotesPawn(s.game, p, mv)) {
      set({ pendingPromotion: null, premoveInputOpen: false });
      return;
    }
    if (s.net) {
      if (submitNetMove(p.id, { x: mv.x, y: mv.y, promotion: type })) set({ pendingPromotion: null });
      return;
    }
    if (s.premoves.length || s.premoveInputOpen) set({ premoves: [], premoveInputOpen: false });
    commitPlayerMove(p, mv, type);
  },

  queueMove: (pieceId, x, y) => {
    const s = get();
    const side = s.net ? s.net.localSide : 'player';
    // Premoves are the opponent-turn action for whichever side this client controls. The
    // only local-turn exception is the short post-reply landing beat.
    if (s.pendingPromotion || s.net?.pendingMove || (s.game.turn === side && !s.premoveInputOpen) || s.game.winner) return;
    // Validate against the PROVISIONAL board (current board + the moves already queued)
    // so the chain builds on itself; the tip stays legal for the click that follows.
    const mv = premoveTargets(s.game, s.premoves, pieceId, side).find((m) => m.x === x && m.y === y);
    if (!mv) return;
    const projected = provisionalBoard(s.game, s.premoves, side);
    const p = projected.pieces.find((q) => q.id === pieceId && q.alive && q.side === side);
    if (p && movePromotesPawn(projected, p, mv)) {
      set({
        pendingPromotion: {
          mode: 'premove',
          pieceId,
          move: mv,
          choices: promotionChoicesForMove(projected, p, mv),
        },
      });
      return;
    }
    set({ premoves: [...s.premoves, { pieceId, x, y }] });
  },

  clearPremoves: () => {
    if (get().premoves.length) set({ premoves: [] });
  },

  setTestMode: (on) => {
    // Leaving test mode clears the CPU-delay floor so it can never affect real/campaign play.
    set(on ? { testMode: true } : { testMode: false, testMinCpuDelayMs: 0 });
  },

  setTestMinCpuDelay: (ms) => {
    if (!get().testMode) return; // test-board only — never floors real play
    // Generous ceiling (10 min) so a tester can set whatever floor they like, while an absurd
    // typo still can't hang the turn forever.
    set({ testMinCpuDelayMs: Math.max(0, Math.min(600_000, Math.round(ms))) });
  },
  };
});

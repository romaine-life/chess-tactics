// Skirmish store (Zustand) — the single source of truth for the new game UI.
// It owns a GameState and applies intents through the pure core (intents in,
// new state out). The renderer and HUD subscribe to it; neither mutates state.

import { useStore, type StateCreator } from 'zustand';
import { createStore } from 'zustand/vanilla';
import { PROMOTION_PIECE_TYPES, type GameEvent, type GameState, type Move, type Piece, type PromotionPieceType, type Side, type Vec, type Winner } from '../core/types';
import { applyMove, gameEnv, legalMoves, promotionRuleForMove, recordPosition, sideInCheck, type MoveEnv, type RuleDrawKind } from '../core/rules';
import { settleCommittedPosition, type Adjudication } from '../core/adjudication';
import { adoptedWeightsFor } from './adoptedWeights';
import { premoveTargets, provisionalBoard, type PremoveStep } from './premoves';
import { requestEnemyReply } from './aiWorkerClient';
import { objectiveBriefingForSide, victoryRuleDetailForSide } from './objectiveBriefing';
import type { PlayingSide } from './clientPerspective';
import { kingSideOf, objectiveContextForLevel, objectiveSummary, victoryRulesForObjective, type ObjectiveContext } from '../core/objectives';
import type { Level, ObjectiveType, TimeControl, VictoryRules } from '../core/level';
import { DEFAULT_TIME_CONTROL, readElapsedClockMs, type ElapsedClockState } from '../core/clock';
import { terrainAt } from '../core/terrain';
import { playArrival, playInterface, playTerrain } from '../sfx';
import { createSkirmish, type SkirmishOptions } from './setup';
import { persistMatch, type PersistedMatch } from './matchPersistence';
import { loadShippedAiWeights } from '../net/aiWeights';
import { PIECE_LABEL } from '../core/pieces';
import { clearPersistedNetIntent, loadPersistedNetIntent, persistNetIntent } from './netIntentPersistence';
import { adminMoveTargets, killUnitForAdmin } from './adminBattle';
import { sanForMove } from './sanNotation';
import {
  clampReviewIndex,
  openingPosition,
  recordPositions,
  snapshotOf,
  steppedReviewIndex,
  truncatePositions,
  type PositionSnapshot,
  type RecordedPosition,
} from './moveReview';
import type { RunBattleNotice, RunBattleUndoCheckpoint } from '../run/model';

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

/**
 * What the Run did to the committed board, and what the Battle is to say about it.
 *
 * The transform is the one place a surrounding Run may reach into a live Battle — it pays
 * en passant bounties and lands Reservists — and the board store has no view of a Run
 * document, so it cannot detect those changes itself. That is exactly why they do not
 * travel alone: the transform's ONLY return channel carries the notices with the board, and
 * every caller below folds `notices` into the Battle log in the same `set` that commits
 * `game`. There is no way to come back from the transform having changed the Run and said
 * nothing; a silent Run change is not a possible state, not merely a discouraged one.
 */
export interface RunBattleTransformResult {
  game: GameState;
  notices: readonly RunBattleNotice[];
}

/**
 * Run Battles may add an ordinarily behaving Reservist after a capture, and pay a bounty for
 * an en passant. The hook transforms only the committed board between move mechanics and
 * adjudication; it is never consulted by legal move generation, so lipsana cannot change
 * piece behavior.
 */
export type RunBattleTransformSink = (game: GameState, events: readonly GameEvent[]) => RunBattleTransformResult;

/** One board-seated gold marker: what a Run notice's economy delta looks like on the board. */
export interface BattleGoldNotice {
  id: string;
  at: Vec;
  goldTenths: number;
}

let battleGoldNoticeSequence = 0;

/**
 * Turn the notices from one committed transition into their board markers. Only the notices
 * that moved gold get one — the amount is the whole content of the marker, and a notice
 * without an amount (a Reservist arriving) is already shown by the board change itself.
 */
export function battleGoldNoticesFrom(notices: readonly RunBattleNotice[]): BattleGoldNotice[] {
  return notices.flatMap((notice) => {
    if (notice.goldTenths === undefined || notice.goldTenths === 0) return [];
    battleGoldNoticeSequence += 1;
    return [{ id: `gold-notice-${battleGoldNoticeSequence}`, at: notice.at, goldTenths: notice.goldTenths }];
  });
}

/** Run economy/runtime ownership paired with the board store's move checkpoint. */
export interface RunBattleUndoAdapter {
  capture: () => RunBattleUndoCheckpoint | null;
  canRestore: (checkpoint: RunBattleUndoCheckpoint) => boolean;
  restore: (checkpoint: RunBattleUndoCheckpoint) => boolean;
  /** Re-price a checkpoint older than one just restored, for the Undo that restoring it
   * cost. The board store holds the history but names no price — the Run owns the
   * economy, here as everywhere else. */
  chargeEarlier: (checkpoint: RunBattleUndoCheckpoint) => RunBattleUndoCheckpoint;
}

/** One browser-resumable checkpoint immediately before a committed player move. */
export interface PlayerMoveUndoCheckpoint {
  game: GameState;
  tick: number;
  log: LogEntry[];
  resultDetail: string | null;
  turnsElapsed: number;
  selectedId: string | null;
  focusedId: string | null;
  clock: ClockState | null;
  run: RunBattleUndoCheckpoint;
}

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

// Landing-SFX timing. The player move tween runs 360ms (see promotionPresentation);
// fire the terrain footstep a beat into it so the sound lands as the piece *seats*, not as
// it lifts off. Several enemy moves resolved in one reply are spread out so their
// footsteps read as a sequence rather than one muddy stack; spawned units deploy as
// a soft staggered roll-call.
const LANDING_SFX_DELAY = 150;
// The bounty is a consequence of the capture, so its coin lands after the footstep rather
// than under it — far enough back to read as a second beat, close enough to still belong
// to the same move.
const GOLD_NOTICE_SFX_DELAY = 430;
const ENEMY_LANDING_STAGGER = 130;
const SPAWN_SFX_BASE_DELAY = 220;
const SPAWN_SFX_STAGGER = 70;

/** Movement environment for a state: its static terrain + fence env (gameEnv) plus lastMove. */
function envFor(game: GameState): MoveEnv {
  return { ...gameEnv(game), lastMove: game.lastMove };
}

/**
 * What a commit does to a review in progress. Ordinarily nothing: the score sheet grows
 * underneath the cursor and the player keeps reading where they were. The exception is the
 * commit that DECIDES the game — a result has to land on the real board rather than under an
 * older one, so that single moment returns to live. Reviewing the finished game is free from
 * there, which is when a player most wants it.
 */
function reviewAfterCommit(before: GameState, after: GameState, index: number | null): number | null {
  return after.winner && !before.winner ? null : index;
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

/**
 * One Event Log row. A played move carries its chess notation as the line itself, plus
 * the side that played it and its half-move index, so the log reads as a score sheet
 * rather than a list of things that vaguely happened — `Nxe5+` says capture, mover,
 * square, and check at once, where "A piece falls." said none of them. Every other line
 * (the opening briefing, an adjudication, a resignation, an admin action) is prose and
 * carries neither field.
 */
export interface LogEntry {
  /** The line as shown: a chess-notation token for a move, prose otherwise. */
  text: string;
  /** The side that played this move. Move entries only. */
  side?: Side;
  /** 0-based half-move index, which numbers the score sheet. Move entries only. */
  ply?: number;
}

/** Plain prose — a line that is not a move. */
export const logNote = (text: string): LogEntry => ({ text });

/**
 * How many Event Log rows are kept. Every move writes one, so this is how far back the score
 * sheet reads — and since move review navigates BY those rows, a row that has fallen off the
 * end is a move the player can no longer step to. That is why this is a whole game's worth of
 * rows rather than the dozen full moves it used to hold: the log is the navigation surface, so
 * truncating it truncates the review. Rows are three small fields, so a full game's worth is
 * still a trivial fraction of the position history sitting beside it.
 */
const LOG_LIMIT = 600;

/** Prepend `entries` (oldest first) onto the newest-first running log. */
function extendLog(log: readonly LogEntry[], entries: readonly LogEntry[]): LogEntry[] {
  return [...[...entries].reverse(), ...log].slice(0, LOG_LIMIT);
}

/**
 * The half-move index the next played move takes. Read off the most recent move entry
 * instead of a separate counter, so numbering rewinds with an undo that restores the
 * log, and a resumed match keeps counting where it left off — with nothing extra to
 * persist or keep in step.
 */
function nextPly(log: readonly LogEntry[]): number {
  const latestMove = log.find((entry) => entry.ply !== undefined);
  return latestMove?.ply === undefined ? 0 : latestMove.ply + 1;
}

/** Log rows for consecutive half-moves notated from `startPly`, in the order played. */
function moveEntries(notation: readonly string[], side: Side, startPly: number): LogEntry[] {
  return notation
    .map((text, i) => ({ text, side, ply: startPly + i }))
    .filter((entry) => entry.text !== '');
}

/** Log copy for a draw the position itself forces, same on every surface: the chess draw rules
 *  the level authored (ADR-0072) plus the dead position, which needs no authoring. */
const DRAW_RULE_COPY: Record<RuleDrawKind | 'dead-position', string> = {
  'fifty-move': 'Draw — 50 moves have passed without a capture or pawn move.',
  threefold: 'Draw — the same position has occurred three times.',
  'dead-position': 'Draw — neither side has the force left to deliver a checkmate.',
};

/** Result-screen "how it ended" line per draw kind (see resultDetail). */
const DRAW_RESULT_DETAIL: Record<Exclude<Adjudication['kind'], 'victory-rule'>, string | null> = {
  checkmate: 'Checkmate — the side to move has no legal escape.',
  stalemate: 'Stalemate — no legal moves remain.',
  'fifty-move': '50 moves passed without a capture or pawn move.',
  threefold: 'The same position occurred three times.',
  'dead-position': 'Neither side has the force left to deliver a checkmate.',
};

function movePromotesPawn(game: GameState, piece: Piece, move: Move): boolean {
  return !!promotionRuleForMove(game, piece, { x: move.x, y: move.y });
}

function promotionChoicesForMove(game: GameState, piece: Piece, move: Move): readonly PromotionPieceType[] {
  return promotionRuleForMove(game, piece, { x: move.x, y: move.y })?.choices ?? PROMOTION_PIECE_TYPES;
}

/**
 * A battle opens holding NOTHING.
 *
 * The selection ring says "picked up", and there is no unit the game has any business preferring
 * on the player's behalf. Opening on the first piece of the roster put the ring on a Run army's
 * King — walled in by the formation just arranged around him, so it offered nothing and its only
 * effect on the player's first click was to vanish; a cell's press selects the piece under it, so
 * a click on a piece the board is already holding is a deselect. Picking a different unit only
 * moves the arbitrariness somewhere else. The turn boundary already works this way — see the
 * enemy-reply commit, "Turn returns to the player with no implicit selection" — and this is the
 * same rule at the door into the battle.
 */
const OPENS_HOLDING_NOTHING = { selectedId: null, focusedId: null } as const;

/**
 * The current selection if that piece is still a living piece of `side`, else null.
 * Selection is client-local context: callers may preserve an explicitly chosen unit,
 * but a committed mover is cleared separately and a captured unit never invents a
 * fallback selection.
 */
function livingSelected(game: GameState, selectedId: string | null, side: Side): string | null {
  return game.pieces.some((p) => p.id === selectedId && p.alive && p.side === side) ? selectedId : null;
}

/**
 * A committed mover stops being the active interaction target. Preserve only a different
 * selection/focus the player explicitly established while an asynchronous move was pending.
 */
function interactionAfterCommittedMove(
  game: GameState,
  selectedId: string | null,
  focusedId: string | null,
  movedPieceId: string,
  localSide: Side,
): Pick<SkirmishState, 'selectedId' | 'focusedId'> {
  const nextSelectedId = selectedId === movedPieceId
    ? null
    : livingSelected(game, selectedId, localSide);
  const nextFocusedId = focusedId === movedPieceId
    ? nextSelectedId
    : game.pieces.some((piece) => piece.id === focusedId && piece.alive)
      ? focusedId
      : nextSelectedId;
  return { selectedId: nextSelectedId, focusedId: nextFocusedId };
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
  /**
   * Which gesture is asking.
   *
   * `move` and `premove` are a move MID-COMMIT: the Pawn's arrival is projected onto the real
   * board and the canonical position waits on the answer. `premove-queue` is the queue-time
   * question (ADR-0541) — nothing is committing, the premoved Pawn's ghost already stands on the
   * promotion cell, and the answer is written onto the queued step for the drain to fire later.
   */
  mode: 'move' | 'premove' | 'premove-queue';
  phase: 'choosing' | 'submitted';
  pieceId: string;
  move: Move;
  choices: readonly PromotionPieceType[];
}

export type AdminBattleMode = 'free-move' | 'kill-unit' | 'win-battle';

export interface SkirmishState {
  game: GameState;
  /** Indexed terrain for the current game; movement generation reads this. */
  env: MoveEnv;
  selectedId: string | null;
  focusedId: string | null;
  seed: number;
  tick: number;
  /** The Event Log, newest first: one chess-notation row per played move, interleaved
   *  with the prose lines the match itself writes (briefing, check, adjudication). */
  log: LogEntry[];
  /** Gold the Run just moved, still rising off the cells it happened on. Presentation-only
   *  and never persisted: the balance itself lives in the Run document. */
  goldNotices: readonly BattleGoldNotice[];
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
  /** Activity owning this board. Run Battles scope this to Run + battle index so
   * another use of the same Level can never be mistaken for the live match. */
  activityId: string | null;
  /** Enemy decision policy for this game. 'search' is the rung-1 objective-aware
   * search AI (core/ai); 'greedy' keeps the legacy capture-else-random policy
   * reachable for A/B feel comparison via `?ai=greedy`. */
  aiMode: AiMode;
  /** The battle clock, when the level authored one (null = untimed). */
  clock: ClockState | null;
  /** Wall-clock duration of the current Battle. Untimed levels display this as a
   * count-up clock; it remains separate from the optional flag-fall clock. */
  battleElapsed: ElapsedClockState;
  /** Client-local arrival presentation and choice state for an otherwise atomic promotion move. */
  pendingPromotion: PendingPromotion | null;
  /** One explicitly authorized administrator intervention. Ephemeral and consumed once. */
  adminMode: AdminBattleMode | null;
  /** Monotonic match-session identity. Every delayed callback captures this value and
   *  no-ops after any new/resumed/network match replaces its owner. */
  sessionEpoch: number;
  /** Monotonic identity of the board presentation. Unlike sessionEpoch, this does not
   *  change for an in-place restart of the same battle, so camera framing and other
   *  board-owned presentation state remain untouched. */
  boardViewEpoch: number;
  /** Multiplayer context (null = single-player). When set, the AI never fires and
   *  input is gated to `net.localSide` instead of 'player'. */
  net: NetState | null;
  newSkirmish: (opts: SkirmishOptions & {
    preserveBoardPresentation?: boolean;
    /** Voice the deploy roll-call even on a preserved board. A Run Battle is promoted in place
     *  from its Deployment plan, so its army arrives HERE and has to be heard arriving; a plain
     *  restart re-seats units that never left, and stays silent. */
    voiceDeployRollCall?: boolean;
    activityId?: string | null;
  }) => void;
  /** Reset match state on the board already being presented. This invalidates async
   *  match work without replacing, reframing, or replaying the board presentation. */
  restartSkirmish: (opts: SkirmishOptions & { activityId?: string | null }) => void;
  /** Begin the deferred countdown and elapsed clock once the playable surface has painted. */
  activateClock: () => void;
  /** Freeze one live Run Battle while its units physically leave the mounted battlefield. */
  suspendForBoardDeparture: () => void;
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
  resumeMatch: (match: PersistedMatch, options?: { deferClockStart?: boolean }) => void;
  select: (id: string | null) => void;
  focus: (id: string | null) => void;
  movesForSelected: () => Move[];
  tryMoveTo: (x: number, y: number) => void;
  /** Complete a board drag against the input authority that exists at release. A drag
   *  begun as a premove may cross the landing-beat boundary and become an ordinary
   *  live move; both paths still perform their canonical fresh legality check. */
  releaseMoveGesture: (pieceId: string, x: number, y: number, startedAsPremove: boolean) => void;
  choosePromotion: (type: PromotionPieceType) => void;
  /** Run-only checkpoints, one per committed player move this Battle, oldest first. Undo pops
   * the last, so a player can walk the whole Battle back a decision at a time (ADR-0556). */
  undoStack: PlayerMoveUndoCheckpoint[];
  /** True while this mounted Battle supplies the Run economy half of Undo. */
  runUndoEnabled: boolean;
  canUndoLastPlayerMove: () => boolean;
  undoLastPlayerMove: () => boolean;
  /**
   * Every board this match has stood in, oldest first — the score sheet's positions, one per
   * half-move plus the opening (see game/moveReview). Read ONLY by move review: no rule, no
   * search, no move and no persisted position is ever taken from here.
   */
  positions: RecordedPosition[];
  /**
   * Which recorded position the battlefield is showing, when it is not showing the live one.
   * `null` — the normal state — means live.
   *
   * This is the whole of "you are not on the current move any more". Reviewing is a VIEW, not
   * a rewind: the turn, the clock, the queued premoves and the enemy's think all carry on
   * underneath, the board is read-only while it shows an older position, and returning to
   * live hands back exactly the board that was there. Nothing else in the store reads it.
   */
  reviewIndex: number | null;
  /** Show a recorded position; `null` returns to the live board. Out-of-range is clamped, and
   *  asking for the newest recorded position returns to live rather than freezing on a
   *  duplicate of it. */
  reviewPosition: (index: number | null) => void;
  /** Walk the score sheet by whole half-moves: -1 is a move back, +1 a move forward. */
  stepReview: (delta: number) => void;
  armAdminMode: (mode: AdminBattleMode) => boolean;
  clearAdminMode: () => void;
  adminKillUnit: (pieceId: string) => boolean;
  adminWinBattle: () => boolean;
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
  /** Drop one board-seated gold marker once its rise has played out. */
  retireGoldNotice: (id: string) => void;
  /** Install this battle instance's Run-only committed-board transform. */
  setRunBattleTransformSink: (sink: RunBattleTransformSink | null) => void;
  /** Install the matching Run economy/runtime checkpoint owner. */
  setRunBattleUndoAdapter: (adapter: RunBattleUndoAdapter | null) => void;
  setNetMoveSink: (sink: NetMoveSink | null) => void;
  setNetResignSink: (sink: NetResignSink | null) => void;
}

export type MoveGestureInputMode = 'move' | 'premove' | null;

/**
 * The sides this client may pick a unit up from right now.
 *
 * In play that is the one army you command. An armed admin Free Move commands both, because
 * the reason to reach for it is almost always to put the OPPONENT somewhere — a pawn onto the
 * square that opens an en passant, a piece into the shape a bug needs. Selection, the drag
 * pickup, and the board's click intent all read this, so there is one answer to "whose piece
 * is this" rather than four that can drift apart.
 */
export function commandedSides(adminMode: AdminBattleMode | null, localSide: PlayingSide): readonly Side[] {
  return adminMode === 'free-move' ? ['player', 'enemy'] : [localSide];
}

/** Resolve one continuous drag against the current input boundary. Only a gesture that
 *  actually began during premove input may remain a premove; once that boundary closes,
 *  the same gesture becomes a freshly validated live move. */
export function moveGestureInputMode({
  startedAsPremove,
  adminMode,
  gameTurn,
  gameWinner,
  localSide,
  netMovePending,
  pendingPromotion,
  premoveInputOpen,
}: {
  startedAsPremove: boolean;
  adminMode: AdminBattleMode | null;
  gameTurn: GameState['turn'];
  gameWinner: GameState['winner'];
  localSide: PlayingSide;
  netMovePending: boolean;
  pendingPromotion: boolean;
  premoveInputOpen: boolean;
}): MoveGestureInputMode {
  if (gameWinner || pendingPromotion || netMovePending) return null;
  const premoveMode = !adminMode && (gameTurn !== localSide || premoveInputOpen);
  if (startedAsPremove && premoveMode) return 'premove';
  if (premoveMode) return null;
  const liveMoveOpen = adminMode === 'free-move'
    ? gameTurn === 'player' || gameTurn === 'enemy'
    : gameTurn === localSide;
  return liveMoveOpen ? 'move' : null;
}

/**
 * Decide whether entering the skirmish screen should build a fresh game or
 * resume the one already in this presentation instance. Start fresh only when
 * there is nothing worth resuming: no game has
 * been started, the last one already finished, or a different level is opened.
 */
export function shouldStartFreshSkirmish(
  state: Pick<SkirmishState, 'started' | 'game' | 'levelId' | 'activityId'>
    & Partial<Pick<SkirmishState, 'undoStack'>>
    & { net?: NetState | null },
  requestedLevelId: string | null,
  requestedActivityId: string | null,
): boolean {
  return !!state.net
    || !state.started
    || (state.game.winner !== null && !state.undoStack?.length)
    || state.levelId !== requestedLevelId
    || state.activityId !== requestedActivityId;
}

const INITIAL_GAME = createSkirmish({ seed: 1 });

const createSkirmishState: StateCreator<SkirmishState> = (set, get) => {
  let matchEpoch = 0;
  let runBattleTransformSink: RunBattleTransformSink | null = null;
  let runBattleUndoAdapter: RunBattleUndoAdapter | null = null;
  let netMoveSink: NetMoveSink | null = null;
  let netResignSink: NetResignSink | null = null;
  let enemyReplyTimer: ReturnType<typeof setTimeout> | null = null;
  let premoveFireTimer: ReturnType<typeof setTimeout> | null = null;
  const sessionEffectTimers = new Set<ReturnType<typeof setTimeout>>();

  // ---- Battle clock ----------------------------------------------------------
  // Standard chess-clock rules for the PLAYER only: the clock runs while it's their
  // live turn, pauses the moment their move applies (banking the Fischer increment),
  // and resumes when the enemy reply hands the turn back. The truth is a wall-clock
  // DEADLINE, not a decremented counter — ticks just re-derive the remainder, so a
  // throttled background tab can't stretch the player's time. The ticker belongs to
  // this battle-session store, so it lives exactly as long as the mounted authored
  // battle scene and cannot leak into a simultaneously mounted outgoing scene.
  let clockDeadline = 0;
  let clockTicker: ReturnType<typeof setInterval> | null = null;

  const pauseBattleElapsed = () => {
    const cur = get();
    if (cur.battleElapsed.startedAtMs === null) return;
    set({
      battleElapsed: {
        elapsedMs: readElapsedClockMs(cur.battleElapsed),
        startedAtMs: null,
      },
    });
  };

  const startBattleElapsed = () => {
    const cur = get();
    if (!cur.started || cur.game.winner || cur.battleElapsed.startedAtMs !== null) return;
    set({ battleElapsed: { ...cur.battleElapsed, startedAtMs: Date.now() } });
  };

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
    pauseBattleElapsed();
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

  /**
   * Sound the Run's gold. One voice for the whole transition however many notices it carried,
   * so a doubled payout is a louder event rather than two overlapping coins. It waits out the
   * footstep so the order the player hears is the order it happened: the piece lands, THEN it
   * pays. The recording behind the 'gold' cue is the owner's, editable in the SFX Studio.
   */
  const soundGoldNotices = (notices: readonly BattleGoldNotice[]): void => {
    if (!notices.length) return;
    scheduleSessionEffect(() => playInterface({ cue: 'gold' }), GOLD_NOTICE_SFX_DELAY);
  };

  /**
   * Project the Pawn's arrival and ask what it becomes in the same frame the move is
   * authored (ADR-0559). The player already knows the promotion is coming — it is why they
   * played the move — so the question opens over the destination while the sprite is still
   * gliding to it rather than one presentation interval later.
   *
   * Canonical chess state stays untouched until choosePromotion commits/submits the
   * complete atomic move; SkirmishBoard derives the arriving Pawn from this pending state.
   */
  const stagePromotionArrival = (
    mode: PendingPromotion['mode'],
    piece: Piece,
    move: Move,
    choices: readonly PromotionPieceType[],
    remainingPremoves: PremoveStep[] = [],
  ): void => {
    set({
      pendingPromotion: { mode, phase: 'choosing', pieceId: piece.id, move, choices },
      premoves: mode === 'premove' ? remainingPremoves : [],
      premoveInputOpen: mode === 'premove' ? get().premoveInputOpen : false,
    });
    // The footstep still belongs to the glide, not to the question: it seats when the Pawn does.
    playLandingSfx(get().env, move.x, move.y, LANDING_SFX_DELAY);
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
      adminMode: null,
      premoves: [],
      premoveInputOpen: false,
      testMode: false,
      testMinCpuDelayMs: 0,
      reviewIndex: null,
      log: extendLog(cur.log, [logNote('Defeat — your clock ran out.')]),
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

  const pauseClockForAdmin = () => {
    const cur = get();
    if (!cur.clock?.running) return;
    stopClockTicker();
    set({
      clock: {
        ...cur.clock,
        remainingMs: Math.max(0, clockDeadline - Date.now()),
        running: false,
      },
    });
  };

  const finishPremoveInputBeat = (gameRef: GameState, epoch: number) => {
    const s = get();
    if (s.sessionEpoch !== epoch || s.game !== gameRef || s.game.winner || !s.premoveInputOpen) return;
    // An open promotion picker is an unfinished input gesture, not idle time. Closing the beat
    // underneath it would strand the player's choice as a queued premove that only fires a whole
    // round later — "I picked Queen and it turned into a premove" — and a queue-time question
    // asked during this same beat would have its step fired before it knew the answer. Hold the
    // beat (and the clock) until choosePromotion resolves it.
    if (s.pendingPromotion) { schedulePremoveInputBeat(gameRef); return; }
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
          // One notated row per half-move of the reply, in the order the opponent played
          // them — a reply that resolves several moves reads as several score-sheet lines.
          const msgs = moveEntries(enemyRes.notation, 'enemy', nextPly(live.log));
          const runTransform = runBattleTransformSink?.(enemyRes.game, enemyRes.events) ?? null;
          const transformedEnemyGame = runTransform?.game ?? enemyRes.game;
          // Whatever the Run just did to this board says so here, in the same commit.
          for (const notice of runTransform?.notices ?? []) msgs.push(logNote(notice.log));
          const goldNotices = battleGoldNoticesFrom(runTransform?.notices ?? []);
          const afterEnv = envFor(transformedEnemyGame);
          // A full player→enemy round just elapsed: advance the survive clock, then re-check the
          // objective — survive reached, or a player wipe = defeat.
          const turnsElapsed = (cur.turnsElapsed ?? 0) + 1;
          const ctx = { ...(cur.objectiveCtx ?? {}), turnsElapsed };
          const settled = settleCommittedPosition(transformedEnemyGame, {
            victoryRules: cur.victoryOverride ?? victoryRulesForObjective(cur.objective, ctx),
            ctx,
            turnsElapsed,
            env: afterEnv,
          });
          const game = settled.state;
          const resultDetail = adjudicationResultDetail(settled.adjudication, 'player', !!cur.victoryOverride);
          if (settled.adjudication) {
            msgs.push(logNote(adjudicationCopy(settled.adjudication, 'player', !!cur.victoryOverride)));
          } else if (sideInCheck(game, 'player', afterEnv)) msgs.push(logNote('Your King is in check!'));
          // Turn returns to the player with no implicit selection. A unit explicitly selected
          // while the enemy reply was in flight is preserved if it survived; a capture clears it
          // instead of arbitrarily selecting the first remaining unit.
          const keep = livingSelected(game, live.selectedId, 'player');
          const openPremoveInput = !game.winner && game.turn === 'player';
          // One recorded board per notated half-move of the reply, so a reply that resolved
          // several enemy moves reads back one move at a time. The worker's intermediate
          // boards are the raw ones; the LAST is replaced by the settled, Run-transformed
          // position, which is the board the player is actually left facing.
          const replySnapshots = enemyRes.snapshots.filter((_, i) => enemyRes.notation[i] !== '');
          if (replySnapshots.length) replySnapshots[replySnapshots.length - 1] = snapshotOf(game);
          set({
            game,
            env: envFor(game),
            tick: enemyRes.tick,
            turnsElapsed,
            resultDetail,
            selectedId: keep,
            focusedId: keep,
            log: extendLog(live.log, msgs),
            positions: recordPositions(live.positions, replySnapshots),
            reviewIndex: reviewAfterCommit(cur.game, game, live.reviewIndex),
            goldNotices: [...live.goldNotices, ...goldNotices],
            premoveInputOpen: openPremoveInput,
          });
          // Footsteps for the enemy half-turn: one per piece that moved, spread out so a
          // multi-move reply reads as a sequence, not one muddy stack. Terrain is static, so the
          // pre-reply env indexes the same board the pieces landed on.
          enemyRes.events
            .filter((e): e is Extract<GameEvent, { kind: 'moved' }> => e.kind === 'moved')
            .forEach((e, i) => playLandingSfx(cur.env, e.to.x, e.to.y, LANDING_SFX_DELAY + i * ENEMY_LANDING_STAGGER));
          soundGoldNotices(goldNotices);
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
      set({ log: extendLog(s.log, [logNote('Move not sent — browser storage is unavailable, so safe multiplayer retry is disabled.')]) });
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

  const capturePlayerMoveUndo = (): PlayerMoveUndoCheckpoint | null => {
    const s = get();
    const run = runBattleUndoAdapter?.capture() ?? null;
    if (!run || s.net || !s.started || s.game.winner) return null;
    const clock = s.clock
      ? {
          ...s.clock,
          // Keep the exact thinking time left at commit, but do not bank this move's
          // Fischer increment. Undo returns to the decision, not to free clock time.
          remainingMs: s.clock.running
            ? Math.max(0, clockDeadline - Date.now())
            : s.clock.remainingMs,
          running: false,
        }
      : null;
    return {
      game: s.game,
      tick: s.tick,
      log: [...s.log],
      resultDetail: s.resultDetail,
      turnsElapsed: s.turnsElapsed,
      selectedId: s.selectedId,
      focusedId: s.focusedId,
      clock,
      run,
    };
  };

  // Apply a legal player move and run the full post-move pipeline: bank the clock
  // increment, apply, sound the footstep, evaluate the objective, detect checkmate/
  // stalemate/check on the enemy now to move, commit, stage the enemy reply, persist.
  // Shared by the live path (tryMoveTo) and the premove drain so an auto-fired premove
  // is byte-for-byte the same move a click would have made.
  const commitPlayerMove = (
    piece: Piece,
    mv: Move,
    promotion?: PromotionPieceType,
    landingAlreadyPresented = false,
  ) => {
    const s = get();
    // A capture that fails is not a shallower history, it is a hole: the older checkpoints
    // below it can only be reached by rewinding through a move nothing recorded. Drop them.
    const captured = capturePlayerMoveUndo();
    const undoStack = captured ? [...s.undoStack, captured] : [];
    pauseClockWithIncrement();
    const playerRes = applyMove(s.game, piece.id, mv, { promotion });
    const runTransform = runBattleTransformSink?.(playerRes.state, playerRes.events) ?? null;
    const transformed = runTransform?.game ?? playerRes.state;
    const goldNotices = battleGoldNoticesFrom(runTransform?.notices ?? []);
    // The settled position joins the threefold table BEFORE the terminal checks read it
    // (a no-op unless this game enforces threefold). enemyEnv matches the post-move state.
    const enemyEnv = envFor(transformed);
    const committed = recordPosition(transformed, enemyEnv);
    // Footstep: only when the piece actually relocates, at the mover's real landing
    // square (a castle's gesture square can differ from where the king lands).
    if (!landingAlreadyPresented && playerRes.events.some((e) => e.kind === 'moved')) {
      playLandingSfx(s.env, mv.castle?.kingTo.x ?? mv.x, mv.castle?.kingTo.y ?? mv.y, LANDING_SFX_DELAY);
    }
    const ctx = { ...(s.objectiveCtx ?? {}), turnsElapsed: s.turnsElapsed ?? 0 };
    const settled = settleCommittedPosition(committed, {
      victoryRules: s.victoryOverride ?? victoryRulesForObjective(s.objective, ctx),
      ctx,
      turnsElapsed: s.turnsElapsed ?? 0,
      env: enemyEnv,
    });
    const game = settled.state;
    // Notate the move against the position it was played from and the one it produced,
    // so the log records what was played, not just that something happened.
    const san = sanForMove(s.game, game, {
      pieceId: piece.id,
      side: piece.side,
      from: { x: piece.x, y: piece.y },
      move: mv,
    });
    const msgs = moveEntries([san], piece.side, nextPly(s.log));
    // Whatever the Run just did to this board says so here, in the same commit.
    for (const notice of runTransform?.notices ?? []) msgs.push(logNote(notice.log));
    const resultDetail = adjudicationResultDetail(settled.adjudication, 'player', !!s.victoryOverride);
    if (settled.adjudication) {
      msgs.push(logNote(adjudicationCopy(settled.adjudication, 'player', !!s.victoryOverride)));
    } else if (game.turn === 'enemy' && sideInCheck(game, 'enemy', enemyEnv)) {
      msgs.push(logNote('Check!'));
    }
    const interaction = interactionAfterCommittedMove(
      game,
      s.selectedId,
      s.focusedId,
      piece.id,
      'player',
    );
    set({
      game,
      env: enemyEnv,
      resultDetail,
      pendingPromotion: null,
      premoveInputOpen: false,
      undoStack,
      ...interaction,
      log: extendLog(s.log, msgs),
      // One half-move played, one board recorded. A move made while the player is reading an
      // older position still records here and still leaves the cursor where it was — the score
      // sheet grows underneath the review rather than yanking it forward.
      positions: recordPositions(s.positions, san ? [snapshotOf(game)] : []),
      reviewIndex: reviewAfterCommit(s.game, game, s.reviewIndex),
      goldNotices: [...s.goldNotices, ...goldNotices],
    });
    soundGoldNotices(goldNotices);
    if (game.turn === 'enemy' && !game.winner) scheduleEnemyReply();
    persistMatch(get());
  };

  // Drain one premove as control returns to this client. Returns true iff a premove was
  // applied locally or submitted as the next authoritative net intent. This is the ONLY
  // place a premove meets exact legality: queuing is deliberately speculative (ADR-0358),
  // so a queued step is a prediction until it arrives here. The head is
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
    // Player-authored promotion premoves answer this at queue time (ADR-0541), so a head that
    // still carries no choice came from somewhere else — a programmatic or legacy step. It asks
    // as the step fires rather than picking for the player.
    if (movePromotesPawn(s.game, p, mv) && head.promotion === undefined) {
      stagePromotionArrival('premove', p, mv, promotionChoicesForMove(s.game, p, mv), rest);
      return true;
    }
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
    // Both seats notate the same relayed move from the same pair of positions, so the two
    // clients' score sheets stay identical alongside their boards.
    const san = sanForMove(s.game, game, {
      pieceId: piece.id,
      side: piece.side,
      from: { x: piece.x, y: piece.y },
      move: mv,
    });
    const msgs = moveEntries([san], piece.side, nextPly(s.log));
    const resultDetail = adjudicationResultDetail(settled.adjudication, localSide, !!s.victoryOverride);
    if (settled.adjudication) {
      msgs.push(logNote(adjudicationCopy(settled.adjudication, localSide, !!s.victoryOverride)));
    } else if (game.turn === 'player' || game.turn === 'enemy') {
      if (sideInCheck(game, game.turn, postEnv)) msgs.push(logNote(game.turn === localSide ? 'Your King is in check!' : 'Check delivered.'));
    }

    const interaction = interactionAfterCommittedMove(
      game,
      s.selectedId,
      s.focusedId,
      piece.id,
      localSide,
    );
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
      ...interaction,
      sessionEpoch: nextEpoch,
      // An arrival projection belongs to a move this relay has now settled. A queue-time
      // question belongs to a premove the relay did not touch, so it survives beside its step —
      // the opponent moving is not an answer to what the player's Pawn will become.
      pendingPromotion: !game.winner && s.pendingPromotion?.mode === 'premove-queue' ? s.pendingPromotion : null,
      premoves: game.winner ? [] : s.premoves,
      premoveInputOpen: returnedToLocal,
      log: extendLog(s.log, msgs),
      // Both seats record the same board off the same relayed move, so both score sheets
      // review identically. Reviewing is local: it relays nothing and sends nothing.
      positions: recordPositions(s.positions, san ? [snapshotOf(game)] : []),
      reviewIndex: reviewAfterCommit(s.game, game, s.reviewIndex),
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
    const localPromotionArrivalWasPresented = s.pendingPromotion?.phase === 'submitted'
      && s.pendingPromotion.pieceId === piece.id
      && s.pendingPromotion.move.x === mv.x
      && s.pendingPromotion.move.y === mv.y;
    if (moved && !localPromotionArrivalWasPresented) {
      playLandingSfx(s.env, mv.castle?.kingTo.x ?? mv.x, mv.castle?.kingTo.y ?? mv.y, LANDING_SFX_DELAY);
    }
    if (returnedToLocal) schedulePremoveInputBeat(game);
    return true;
  };

  const commitAdminPosition = (
    rawGame: GameState,
    events: readonly GameEvent[],
    logLine: string,
  ): boolean => {
    pauseClockForAdmin();
    const s = get();
    if (!s.started || s.net || s.game.winner) return false;
    const epoch = beginSession();
    const runTransform = runBattleTransformSink?.(rawGame, events) ?? null;
    const transformed = runTransform?.game ?? rawGame;
    const goldNotices = battleGoldNoticesFrom(runTransform?.notices ?? []);
    const afterEnv = envFor(transformed);
    const committed = recordPosition(transformed, afterEnv);
    const completedEnemyTurn = s.game.turn === 'enemy' && committed.turn === 'player';
    const turnsElapsed = (s.turnsElapsed ?? 0) + (completedEnemyTurn ? 1 : 0);
    const ctx = { ...(s.objectiveCtx ?? {}), turnsElapsed };
    const settled = settleCommittedPosition(committed, {
      victoryRules: s.victoryOverride ?? victoryRulesForObjective(s.objective, ctx),
      ctx,
      turnsElapsed,
      env: afterEnv,
    });
    const game = settled.state;
    // An admin position change is not a played move, so it never notates — it is prose.
    const messages = [logNote(logLine)];
    // Whatever the Run just did to this board says so here, in the same commit.
    for (const notice of runTransform?.notices ?? []) messages.push(logNote(notice.log));
    if (settled.adjudication) {
      messages.push(logNote(adjudicationCopy(settled.adjudication, 'player', !!s.victoryOverride)));
    }
    set({
      game,
      env: afterEnv,
      resultDetail: adjudicationResultDetail(settled.adjudication, 'player', !!s.victoryOverride),
      turnsElapsed,
      selectedId: null,
      focusedId: null,
      pendingPromotion: null,
      adminMode: null,
      undoStack: [],
      // An admin position change is not a move and records no board, so it leaves the score
      // sheet saying something the battlefield no longer does. Return to live rather than keep
      // showing a history that has quietly stopped describing this game.
      reviewIndex: null,
      premoves: [],
      premoveInputOpen: false,
      sessionEpoch: epoch,
      clock: s.clock ? { ...s.clock, running: false } : null,
      log: extendLog(s.log, messages),
      goldNotices: [...s.goldNotices, ...goldNotices],
    });
    soundGoldNotices(goldNotices);
    if (!game.winner) startBattleElapsed();
    if (!game.winner && game.turn === 'enemy') scheduleEnemyReply();
    else if (!game.winner && game.turn === 'player') startClock();
    persistMatch(get());
    return true;
  };

  return {
  game: INITIAL_GAME,
  env: envFor(INITIAL_GAME),
  selectedId: null,
  focusedId: null,
  seed: 1,
  tick: 0,
  log: [logNote(`Skirmish begins — ${objectiveSummary('capture-king')}.`)],
  goldNotices: [],
  objective: 'capture-king',
  objectiveCtx: {},
  victoryOverride: null,
  resultDetail: null,
  turnsElapsed: 0,
  started: false,
  levelId: null,
  activityId: null,
  aiMode: 'search',
  clock: null,
  battleElapsed: { elapsedMs: 0, startedAtMs: null },
  pendingPromotion: null,
  adminMode: null,
  undoStack: [],
  runUndoEnabled: false,
  positions: [openingPosition(INITIAL_GAME)],
  reviewIndex: null,
  sessionEpoch: 0,
  boardViewEpoch: 0,
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
    const log = initial.adjudication
      ? [logNote(adjudicationCopy(initial.adjudication, 'player', !!victoryOverride)), logNote(intro)]
      : [logNote(intro)];
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
    set({
      game,
      env,
      seed: opts.seed,
      tick: 0,
      turnsElapsed: 0,
      objectiveCtx,
      victoryOverride,
      resultDetail,
      ...OPENS_HOLDING_NOTHING,
      log,
      goldNotices: [],
      objective,
      started: true,
      levelId: opts.level?.id ?? null,
      activityId: opts.activityId ?? null,
      aiMode: opts.ai ?? get().aiMode,
      clock,
      battleElapsed: { elapsedMs: 0, startedAtMs: null },
      pendingPromotion: null,
      adminMode: null,
      undoStack: [],
      positions: [openingPosition(game)],
      reviewIndex: null,
      sessionEpoch: epoch,
      boardViewEpoch: opts.preserveBoardPresentation ? get().boardViewEpoch : epoch,
      net: null,
      premoves: [],
      premoveInputOpen: false,
    });
    // The clock starts with the game — it is the player's move from the first beat
    // (a degenerate instant-draw start is guarded inside startClock).
    if (!opts.deferClockStart) {
      startClock();
      startBattleElapsed();
    }
    // "Units come onto the board": a soft staggered roll-call as the player's force
    // deploys. Each unit sounds the terrain it lands on (softer, gain 0.7) layered
    // with the authored "arrival" thump (playArrival) — the landing.mp3 that plays
    // when a unit first arrives, combined with its terrain. Spread out so a whole
    // squad arriving reads as a roll-call swell, not one loud stack. Silent until a
    // gesture arms the AudioContext — entering a skirmish is one, so the navigating
    // click covers it.
    if (!opts.preserveBoardPresentation || opts.voiceDeployRollCall) {
      game.pieces
        .filter((pc) => pc.alive && pc.side === 'player')
        .forEach((pc, i) => {
          const delay = SPAWN_SFX_BASE_DELAY + i * SPAWN_SFX_STAGGER;
          playLandingSfx(env, pc.x, pc.y, delay, 0.7);
          scheduleSessionEffect(() => playArrival({ unitIndex: i }), delay);
        });
    }
    // Snapshot the fresh board immediately, so a reload before the first move
    // resumes THIS game rather than re-rolling a different random start.
    persistMatch(get());
  },

  restartSkirmish: (opts) => {
    get().newSkirmish({ ...opts, preserveBoardPresentation: true });
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
    const youCommand = localSide === 'player' ? 'the vanguard' : 'the challenger';
    const intro = `Multiplayer skirmish — ${objectiveBriefingForSide(victoryRules, localSide).summary}. You command ${youCommand}.`;
    const log = initial.adjudication
      ? [logNote(adjudicationCopy(initial.adjudication, localSide, !!victoryOverride)), logNote(intro)]
      : [logNote(intro)];
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
      ...OPENS_HOLDING_NOTHING,
      log,
      started: true,
      levelId: level.id,
      activityId: null,
      clock: null, // netplay is untimed in v1 (a shared wall-clock is future work)
      battleElapsed: { elapsedMs: 0, startedAtMs: null },
      pendingPromotion: null,
      adminMode: null,
      undoStack: [],
      positions: [openingPosition(game)],
      reviewIndex: null,
      sessionEpoch: epoch,
      boardViewEpoch: epoch,
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
        scheduleSessionEffect(() => playArrival({ unitIndex: i }), delay);
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
      adminMode: null,
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
      adminMode: null,
      undoStack: [],
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
      activityId: null,
      victoryOverride: null,
      resultDetail: null,
      turnsElapsed: 0,
      selectedId: null,
      focusedId: null,
      sessionEpoch: epoch,
      pendingPromotion: null,
      adminMode: null,
      premoves: [],
      premoveInputOpen: false,
      testMode: false,
      testMinCpuDelayMs: 0,
      clock: null,
      battleElapsed: { elapsedMs: 0, startedAtMs: null },
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
      adminMode: null,
      resultDetail: null,
      undoStack: [],
      clock: s.clock ? { ...s.clock, running: false } : null,
      testMode: false,
      testMinCpuDelayMs: 0,
      reviewIndex: null,
      log: extendLog(s.log, [logNote('Defeat — you resigned.')]),
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
      adminMode: null,
      resultDetail: reason === 'resign' ? null : s.resultDetail,
      reviewIndex: null,
      undoStack: [],
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
      log: extendLog(s.log, [logNote(copy)]),
    });
  },

  activateClock: () => {
    startClock();
    startBattleElapsed();
  },

  suspendForBoardDeparture: () => {
    const s = get();
    if (!s.started || s.net) return;
    // The departure owns the board until its compositor reports completion. Cancel every
    // opponent/premove callback and stop the exact clock before invalidating their epoch; the
    // replacement Deployment will build a fresh match after its new formation promotes.
    pauseClockForAdmin();
    const current = get();
    const epoch = beginSession();
    set({
      sessionEpoch: epoch,
      clock: current.clock ? { ...current.clock, running: false } : null,
      selectedId: null,
      focusedId: null,
      pendingPromotion: null,
      adminMode: null,
      undoStack: [],
      runUndoEnabled: false,
      reviewIndex: null,
      premoves: [],
      premoveInputOpen: false,
    });
  },

  // Move review. Both actions touch `reviewIndex` and NOTHING else: no rule runs, no clock
  // moves, no premove is dropped, and the live `game` is not read or written. That is the whole
  // guarantee that looking back cannot cost the player the game they are still playing.
  reviewPosition: (index) => {
    const s = get();
    const next = clampReviewIndex(s.positions, index);
    if (next === s.reviewIndex) return;
    set({ reviewIndex: next });
  },

  stepReview: (delta) => {
    const s = get();
    const next = steppedReviewIndex(s.positions, s.reviewIndex, delta);
    if (next === s.reviewIndex) return;
    set({ reviewIndex: next });
  },

  canUndoLastPlayerMove: () => {
    const s = get();
    const checkpoint = s.undoStack[s.undoStack.length - 1];
    return Boolean(
      !s.net
      && s.runUndoEnabled
      && checkpoint
      && runBattleUndoAdapter?.canRestore(checkpoint.run),
    );
  },

  undoLastPlayerMove: () => {
    const s = get();
    const adapter = runBattleUndoAdapter;
    const checkpoint = s.undoStack[s.undoStack.length - 1];
    if (
      s.net
      || !s.runUndoEnabled
      || !checkpoint
      || !adapter?.canRestore(checkpoint.run)
      || !adapter.restore(checkpoint.run)
    ) return false;

    const epoch = beginSession();
    set({
      game: checkpoint.game,
      env: envFor(checkpoint.game),
      tick: checkpoint.tick,
      // Written out rather than read from RUN_BATTLE_UNDO_COST_TENTHS: this module takes only
      // types from run/model, so the price is spelled here and greps back to that constant.
      log: extendLog(checkpoint.log, [logNote('Move undone — 10 gold paid.')]),
      // The undone move's gold went back with it, so its markers stop rising too.
      goldNotices: [],
      resultDetail: checkpoint.resultDetail,
      turnsElapsed: checkpoint.turnsElapsed,
      selectedId: checkpoint.selectedId,
      focusedId: checkpoint.focusedId,
      clock: checkpoint.clock ? { ...checkpoint.clock, running: false } : null,
      pendingPromotion: null,
      adminMode: null,
      premoves: [],
      premoveInputOpen: false,
      // Each remaining checkpoint recorded the gold its move was played from, captured
      // BEFORE this Undo was paid for. Restoring one verbatim would hand that payment
      // straight back, so a walk all the way through the Battle would cost one gold however
      // far it went. Charge every older checkpoint for the Undo just bought, and the next
      // pop pays its own price from a purse that already knows about this one.
      undoStack: s.undoStack.slice(0, -1).map((older) => ({
        ...older,
        run: adapter.chargeEarlier(older.run),
      })),
      // An Undo really did take the move back, so the score sheet loses it too — unlike a
      // review, which takes nothing back and leaves this alone. The restored log names the
      // half-move count to keep, and the cursor returns to live rather than pointing into
      // plies that no longer happened.
      positions: truncatePositions(s.positions, nextPly(checkpoint.log)),
      reviewIndex: null,
      sessionEpoch: epoch,
    });
    startClock();
    startBattleElapsed();
    persistMatch(get());
    return true;
  },

  resumeMatch: (match, options) => {
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
    const log = settled.adjudication
      ? extendLog(match.log, [logNote(adjudicationCopy(settled.adjudication, 'player', !!victoryOverride))])
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
      activityId: match.activityId ?? null,
      // Restore the enemy policy so the ?ai=greedy A/B lever survives a reload
      // (older snapshots predate the field ⇒ default to the search AI).
      aiMode: match.aiMode ?? 'search',
      ...OPENS_HOLDING_NOTHING,
      started: true,
      // A queued premove is ephemeral thinking-time intent — a reload drops it, like
      // navigating away mid-plan.
      premoves: [],
      premoveInputOpen: false,
      pendingPromotion: null,
      adminMode: null,
      undoStack: match.undoStack ?? [],
      // A save written before review existed carries no positions. It resumes with the board
      // it actually holds, recorded at the half-move count its own log names, so the score
      // sheet still says where the game is — it simply has nothing earlier to step back to.
      positions: match.positions?.length
        ? match.positions
        : [{ ply: nextPly(match.log), snapshot: snapshotOf(game) }],
      reviewIndex: null,
      sessionEpoch: epoch,
      boardViewEpoch: epoch,
      // Resume with the clock paused; startClock re-arms the deadline from the
      // banked remainder when it's the player's live turn. A reload isn't thinking
      // time, so the player keeps the time they had at their last move.
      clock: match.clock ? { ...match.clock, running: false } : null,
      battleElapsed: { ...match.battleElapsed, startedAtMs: null },
      net: null, // netplay disables persistence, so a disk-resumed match is single-player
      testMode: false,
      testMinCpuDelayMs: 0,
    });
    if (!options?.deferClockStart) {
      startClock();
      startBattleElapsed();
    }
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
    const p = s.game.pieces.find((q) => q.id === id && q.alive);
    if (p && commandedSides(s.adminMode, s.net ? s.net.localSide : 'player').includes(p.side)) {
      set({ selectedId: id, focusedId: id });
    }
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
    const { game, selectedId, env, net, pendingPromotion, adminMode } = get();
    if (pendingPromotion || net?.pendingMove) return [];
    if (adminMode === 'free-move' && !net) return adminMoveTargets(game, selectedId ?? '');
    const side = net ? net.localSide : 'player';
    if (game.turn !== side || game.winner) return [];
    const p = game.pieces.find((q) => q.id === selectedId && q.alive && q.side === side);
    return p ? legalMoves(p, game.pieces, game.size, env) : [];
  },

  tryMoveTo: (x, y) => {
    const s = get();
    const side = s.net ? s.net.localSide : 'player';
    if (s.pendingPromotion || s.net?.pendingMove) return;
    if (s.adminMode === 'free-move' && !s.net) {
      const p = s.game.pieces.find((candidate) => candidate.id === s.selectedId && candidate.alive);
      const move = adminMoveTargets(s.game, p?.id ?? '').find((candidate) => candidate.x === x && candidate.y === y);
      if (!p || !move) return;
      const result = applyMove(s.game, p.id, move);
      // Name whose piece moved. A Free Move may now walk the OPPONENT, and a board that
      // rearranged itself on your own turn is exactly the thing the log has to account for.
      const mover = `${p.side === 'player' ? 'your' : "the enemy's"} ${PIECE_LABEL[p.type] ?? p.type}`;
      commitAdminPosition(result.state, result.events, `Admin Free Move — ${mover} to ${x},${y}.`);
      return;
    }
    if (s.game.turn !== side || s.game.winner) return;
    const p = s.game.pieces.find((q) => q.id === s.selectedId && q.alive && q.side === side);
    if (!p) return;
    const mv = legalMoves(p, s.game.pieces, s.game.size, s.env).find((m) => m.x === x && m.y === y);
    if (!mv) return;
    if (movePromotesPawn(s.game, p, mv)) {
      stagePromotionArrival('move', p, mv, promotionChoicesForMove(s.game, p, mv));
      return;
    }
    // Netplay is server-sequenced: DON'T apply locally — relay the target cell and let
    // the server's echo apply it in order on both boards (no optimistic apply, so a
    // dropped POST is a no-op the seat can retry, never a permanent desync). The mover
    // remains selected until that authoritative commit, then commitNet clears it.
    if (s.net) { submitNetMove(p.id, { x: mv.x, y: mv.y }); return; }
    // A deliberate manual move overrides any premove queued during the fire-beat — the
    // player took the wheel, so drop the chain rather than firing it a beat later.
    if (s.premoves.length || s.premoveInputOpen) set({ premoves: [], premoveInputOpen: false });
    // Single-player: the move's rhythm — it lands on its own so it animates and reads, then
    // a beat, then the enemy answers — lives in commitPlayerMove, shared with the premove
    // drain so an auto-fired premove is byte-for-byte the same move a click would make.
    commitPlayerMove(p, mv);
  },

  releaseMoveGesture: (pieceId, x, y, startedAsPremove) => {
    const s = get();
    const side = s.net ? s.net.localSide : 'player';
    const mode = moveGestureInputMode({
      startedAsPremove,
      adminMode: s.adminMode,
      gameTurn: s.game.turn,
      gameWinner: s.game.winner,
      localSide: side,
      netMovePending: Boolean(s.net?.pendingMove),
      pendingPromotion: Boolean(s.pendingPromotion),
      premoveInputOpen: s.premoveInputOpen,
    });
    if (mode === 'premove') {
      get().queueMove(pieceId, x, y);
      return;
    }
    if (mode !== 'move') return;
    // The premove landing beat may have closed while the pointer was down. Re-enter through
    // the ordinary selected-piece path so the current authoritative position, not the pickup
    // snapshot, decides whether this destination commits.
    get().select(pieceId);
    get().tryMoveTo(x, y);
  },

  armAdminMode: (mode) => {
    const s = get();
    if (!s.started || s.game.winner || s.net || s.pendingPromotion) return false;
    set({ adminMode: mode, selectedId: null, focusedId: null, premoves: [], premoveInputOpen: false });
    return true;
  },

  clearAdminMode: () => {
    if (get().adminMode) set({ adminMode: null, selectedId: null, focusedId: null });
  },

  adminKillUnit: (pieceId) => {
    const s = get();
    if (s.adminMode !== 'kill-unit' || s.net || s.game.winner) return false;
    const result = killUnitForAdmin(s.game, pieceId);
    if (!result.killed) return false;
    return commitAdminPosition(result.state, result.events, `Admin removed ${PIECE_LABEL[result.killed.type] ?? 'a unit'}.`);
  },

  adminWinBattle: () => {
    const before = get();
    if (before.adminMode !== 'win-battle' || !before.started || before.net || before.game.winner) return false;
    pauseClockForAdmin();
    const s = get();
    const epoch = beginSession();
    set({
      game: { ...s.game, winner: 'player', turn: 'done' },
      resultDetail: null,
      selectedId: null,
      focusedId: null,
      pendingPromotion: null,
      adminMode: null,
      premoves: [],
      premoveInputOpen: false,
      undoStack: [],
      sessionEpoch: epoch,
      clock: s.clock ? { ...s.clock, running: false } : null,
      reviewIndex: null,
      log: extendLog(s.log, [logNote('Admin awarded victory to the player.')]),
    });
    persistMatch(get());
    return true;
  },

  choosePromotion: (type) => {
    const s = get();
    const pending = s.pendingPromotion;
    if (!pending || pending.phase !== 'choosing' || !pending.choices.includes(type)) return;
    const side = s.net ? s.net.localSide : 'player';

    // Answered while the step is still QUEUED: write the choice onto that step and leave the
    // board alone. It is still a prediction — exact legality, the atomic apply, and (in netplay)
    // the ordered submission all remain the drain's job when control returns.
    if (pending.mode === 'premove-queue') {
      let index = -1;
      for (let at = s.premoves.length - 1; at >= 0; at -= 1) {
        const step = s.premoves[at];
        if (step.pieceId === pending.pieceId && step.x === pending.move.x && step.y === pending.move.y) { index = at; break; }
      }
      if (index < 0) { set({ pendingPromotion: null }); return; }
      set({
        premoves: s.premoves.map((step, at) => (at === index ? { ...step, promotion: type } : step)),
        pendingPromotion: null,
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
      if (submitNetMove(p.id, { x: mv.x, y: mv.y, promotion: type })) {
        set({ pendingPromotion: { ...pending, phase: 'submitted' } });
      }
      return;
    }
    if (pending.mode === 'move' && (s.premoves.length || s.premoveInputOpen)) {
      set({ premoves: [], premoveInputOpen: false });
    }
    commitPlayerMove(p, mv, type, true);
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
    const premoves = [...s.premoves, { pieceId, x, y }];
    // A queued step that promotes asks WHAT IT BECOMES NOW, while the player is still looking at
    // the plan they just drew (ADR-0541). Its ghost already stands on the promotion cell, so the
    // question has a visible subject; the answer rides on the step and the drain fires one
    // complete move. Nothing commits here — the premove is still a prediction.
    const projected = provisionalBoard(s.game, s.premoves, side);
    const p = projected.pieces.find((q) => q.id === pieceId && q.alive && q.side === side);
    if (p && movePromotesPawn(projected, p, mv)) {
      set({
        premoves,
        // Same immediacy as a played promotion (ADR-0559): the ghost appears in the frame the
        // step is queued and the question opens with it.
        pendingPromotion: {
          mode: 'premove-queue',
          phase: 'choosing',
          pieceId,
          move: mv,
          choices: promotionChoicesForMove(projected, p, mv),
        },
      });
      return;
    }
    set({ premoves });
  },

  clearPremoves: () => {
    const s = get();
    // Escape drops the chain, and an unanswered queue-time promotion question belongs to the
    // step it was asked for — it goes with it rather than outliving the plan.
    const queueChoice = s.pendingPromotion?.mode === 'premove-queue' ? s.pendingPromotion : null;
    if (!s.premoves.length && !queueChoice) return;
    set({ premoves: [], ...(queueChoice ? { pendingPromotion: null } : {}) });
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
  retireGoldNotice: (id) => {
    const s = get();
    if (!s.goldNotices.some((notice) => notice.id === id)) return;
    set({ goldNotices: s.goldNotices.filter((notice) => notice.id !== id) });
  },
  setRunBattleTransformSink: (sink) => {
    runBattleTransformSink = sink;
  },
  setRunBattleUndoAdapter: (adapter) => {
    runBattleUndoAdapter = adapter;
    set({ runUndoEnabled: Boolean(adapter) });
  },
  setNetMoveSink: (sink) => {
    netMoveSink = sink;
  },
  setNetResignSink: (sink) => {
    netResignSink = sink;
  },
  };
};

export function createSkirmishStore() {
  return createStore<SkirmishState>()(createSkirmishState);
}

export type SkirmishStore = ReturnType<typeof createSkirmishStore>;
export const defaultSkirmishStore = createSkirmishStore();

/**
 * Legacy/default session hook for tests and non-scene instruments. Runtime scene
 * components consume the nearest instance through SkirmishStoreContext.
 */
export const useSkirmish = Object.assign(
  <T,>(selector: (state: SkirmishState) => T): T => useStore(defaultSkirmishStore, selector),
  defaultSkirmishStore,
);

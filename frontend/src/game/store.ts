// Skirmish store (Zustand) — the single source of truth for the new game UI.
// It owns a GameState and applies intents through the pure core (intents in,
// new state out). The renderer and HUD subscribe to it; neither mutates state.

import { create } from 'zustand';
import type { GameEvent, GameState, Move, Piece, Side, Winner } from '../core/types';
import { applyMove, gameEnv, legalMoves, livingPieces, sideInCheck, type MoveEnv } from '../core/rules';
import { adoptedWeightsFor } from './adoptedWeights';
import { premoveTargets, type PremoveStep } from './premoves';
import { requestEnemyReply } from './aiWorkerClient';
import { evaluateObjective, kingSideOf, objectiveContextForLevel, objectiveSummary, type ObjectiveContext } from '../core/objectives';
import type { Level, ObjectiveType, TimeControl } from '../core/level';
import { DEFAULT_TIME_CONTROL } from '../core/clock';
import { terrainAt } from '../core/terrain';
import { ARRIVAL_BAKED, playArrival, playTerrain } from '../sfx';
import { createSkirmish, type SkirmishOptions } from './setup';
import { persistMatch, type PersistedMatch } from './matchPersistence';
import { loadShippedAiWeights } from '../net/aiWeights';

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
  localSide: Side;
  /** Moves applied to this client's board so far — the next expected relay index. */
  moveCount: number;
}

export interface NetMatchOptions {
  lobbyId: string;
  localSide: Side;
  level: Level;
  seed: number;
}

/** The minimal identifier for a relayed move: just the destination cell. The receiver
 *  re-derives the canonical Move (capture id, en-passant flag) from its own identical
 *  board via legalMoves — so nothing rules-derived rides the wire. */
export interface RelayMove { x: number; y: number }

/** Relay hook: in a netplay match the store calls this with each LOCAL move so the
 *  netplay layer (Skirmish) can POST it to the lobby relay. Null in single-player. */
export type NetMoveSink = (pieceId: string, move: RelayMove) => void;
let netMoveSink: NetMoveSink | null = null;
export function setNetMoveSink(sink: NetMoveSink | null): void { netMoveSink = sink; }

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
const PREMOVE_FIRE_DELAY = 460;

// Landing-SFX timing. The move tween runs ~170ms (see SkirmishBoard); fire the
// terrain footstep a beat into it so the sound lands as the piece *seats*, not as
// it lifts off. Several enemy moves resolved in one reply are spread out so their
// footsteps read as a sequence rather than one muddy stack; spawned units deploy as
// a soft staggered roll-call.
const LANDING_SFX_DELAY = 150;
const ENEMY_LANDING_STAGGER = 130;
const SPAWN_SFX_BASE_DELAY = 220;
const SPAWN_SFX_STAGGER = 70;

/**
 * The log line announcing a decided objective. Direction-aware via the game's
 * kingSide (ObjectiveContext): in King Assault the PLAYER may be the King-holder,
 * and Rival Kings ends on a King capture either way, so the win/loss wording has
 * to name the right event — a King falling vs a force being routed. The goal-copy
 * strings themselves come from core/objectives (objectiveSummary/OBJECTIVE_LABEL);
 * only the outcome framing lives here.
 */
function objectiveOutcomeCopy(objective: ObjectiveType, winner: Winner, kingSide: 'player' | 'enemy' = 'enemy'): string {
  if (winner !== 'player') {
    // A King-holding player in King Assault — or anyone in Rival Kings — loses the
    // moment the King falls, not by a wipe; say so.
    if (objective === 'rival-kings' || (objective === 'capture-king' && kingSide === 'player')) {
      return 'Defeat — your King has fallen.';
    }
    return 'Defeat — your force has fallen.';
  }
  switch (objective) {
    // King-holder wins by routing the kingless side; the hunter wins by the capture.
    case 'capture-king': return kingSide === 'player' ? 'Victory — the enemy is routed.' : 'Victory — the enemy King is captured.';
    case 'rival-kings': return 'Victory — the rival King is captured.';
    case 'survive': return 'Victory — you held the line.';
    case 'reach': return 'Victory — the objective is reached.';
    default: return 'Victory — the enemy is routed.';
  }
}

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
function playLandingSfx(env: MoveEnv, x: number, y: number, delayMs: number, gain?: number): void {
  if (!env.terrain) return;
  const cell = terrainAt(env.terrain, x, y);
  if (!cell) return;
  const opts = gain !== undefined ? { gain } : undefined;
  if (delayMs > 0) setTimeout(() => playTerrain(cell.terrain, opts), delayMs);
  else playTerrain(cell.terrain, opts);
}

function describeEvent(ev: GameEvent): string | null {
  switch (ev.kind) {
    case 'captured': return 'A piece falls.';
    case 'promoted': return 'A pawn ascends to a Queen.';
    case 'victory': return ev.winner === 'player' ? 'Victory — the enemy is routed.' : 'Defeat — your force has fallen.';
    default: return null;
  }
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
function netOutcomeCopy(winner: Winner, localSide: Side): string {
  if (winner === 'draw') return 'Draw — the skirmish is even.';
  return winner === localSide ? 'Victory — the field is yours.' : 'Defeat — your force has fallen.';
}

/** True if any living piece of `side` has at least one legal move. */
export function sideHasLegalMove(game: GameState, side: Side, env: MoveEnv): boolean {
  return livingPieces(game.pieces, side).some((p) => legalMoves(p, game.pieces, game.size, env).length > 0);
}

/** True if any living player piece has at least one legal move. */
export function playerHasLegalMove(game: GameState, env: MoveEnv): boolean {
  return sideHasLegalMove(game, 'player', env);
}

/**
 * The terminal result when the side to move has no legal move: there is no
 * passing in chess, so the game ends here — a LOSS for that side if its King is
 * in check (checkmate), otherwise a DRAW (stalemate). A kingless army is never in
 * check, so it can only stalemate. Returns null when the side can still move, the
 * game is already decided, or it isn't a live side's turn.
 */
export function terminalIfStuck(game: GameState, env: MoveEnv): { winner: Winner; checkmate: boolean; side: Side } | null {
  const side = game.turn;
  if ((side !== 'player' && side !== 'enemy') || game.winner) return null;
  if (sideHasLegalMove(game, side, env)) return null;
  const checkmate = sideInCheck(game, side, env);
  const winner: Winner = checkmate ? (side === 'player' ? 'enemy' : 'player') : 'draw';
  return { winner, checkmate, side };
}

/**
 * Resolve a soft-lock on the player's turn (handing control back after the enemy
 * reply, and as a start-of-game safety net). Delegates to `terminalIfStuck`:
 * checkmate ⇒ defeat, stalemate ⇒ draw. No-op unless it is the player's
 * undecided turn with no move available.
 */
export function resolveIfPlayerStuck(game: GameState, env: MoveEnv): { game: GameState; stuck: boolean; checkmate: boolean } {
  if (game.turn !== 'player') return { game, stuck: false, checkmate: false };
  const t = terminalIfStuck(game, env);
  if (!t) return { game, stuck: false, checkmate: false };
  return { game: { ...game, winner: t.winner, turn: 'done' }, stuck: true, checkmate: t.checkmate };
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
  /** Multiplayer context (null = single-player). When set, the AI never fires and
   *  input is gated to `net.localSide` instead of 'player'. */
  net: NetState | null;
  newSkirmish: (opts: SkirmishOptions) => void;
  /** Start a multiplayer match: build the shared (level, seed) board, record which
   *  side this client controls, disable the local AI + clock, and route local moves
   *  to the relay sink. Both clients call this with the SAME level + seed. */
  newNetMatch: (opts: NetMatchOptions) => void;
  /** Apply a move that arrived from the OTHER player over the relay (no AI, no
   *  re-emit). Re-validates legality before applying. */
  applyRemoteMove: (pieceId: string, move: RelayMove) => void;
  /** Concede a multiplayer match: relay the resignation to the lobby. The game itself
   *  ends only when the server's terminal result echoes back via `concludeNet`. No-op
   *  outside netplay or once the game is decided. */
  resign: () => void;
  /** End a netplay match by a non-move terminal event (a resignation relayed by the
   *  server). Sets the winner directly and logs the outcome from this seat. Idempotent —
   *  a duplicate/redelivered lobby frame is ignored once the game is decided. */
  concludeNet: (winner: Winner, reason: 'resign') => void;
  /** Rehydrate a match saved to disk (see matchPersistence) — used to resume the
   * live board after a page reload instead of starting a fresh game. */
  resumeMatch: (match: PersistedMatch) => void;
  select: (id: string | null) => void;
  focus: (id: string | null) => void;
  movesForSelected: () => Move[];
  tryMoveTo: (x: number, y: number) => void;
  /** Moves queued while the opponent is thinking (premoves), fired one-per-turn as
   *  control returns. Ephemeral — dropped on reload, never persisted. */
  premoves: PremoveStep[];
  /** Append a premove for `pieceId` → (x, y) to the chain, validated against the
   *  provisional board (current board + the moves already queued). No-op on the
   *  player's own live turn (a click there is a real move) or a decided game. */
  queueMove: (pieceId: string, x: number, y: number) => void;
  /** Drop the whole queued chain (bound to Escape). */
  clearPremoves: () => void;
}

/**
 * Decide whether entering the skirmish screen should build a fresh game or
 * resume the one already in the store. The store is a module singleton that
 * survives route changes, so navigating to the menu and back must NOT restart a
 * live board. Start fresh only when there is nothing worth resuming: no game has
 * been started, the last one already finished, or a different level is opened.
 */
export function shouldStartFreshSkirmish(
  state: Pick<SkirmishState, 'started' | 'game' | 'levelId'>,
  requestedLevelId: string | null,
): boolean {
  return !state.started || state.game.winner !== null || state.levelId !== requestedLevelId;
}

const INITIAL_GAME = createSkirmish({ seed: 1 });

export const useSkirmish = create<SkirmishState>((set, get) => {
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

  // Flag fall: losing on time is a defeat like any other — turn locks, result copy
  // names the clock.
  const expireClock = () => {
    stopClockTicker();
    const cur = get();
    if (!cur.clock || cur.game.winner) return;
    set({
      game: { ...cur.game, winner: 'enemy', turn: 'done' },
      clock: { ...cur.clock, remainingMs: 0, running: false },
      selectedId: null,
      focusedId: null,
      log: ['Defeat — your clock ran out.', ...cur.log].slice(0, 12),
    });
    persistMatch(get()); // game decided → drops the saved copy
  };

  const tickClock = () => {
    const cur = get();
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
    clockDeadline = Date.now() + cur.clock.remainingMs;
    stopClockTicker();
    clockTicker = setInterval(tickClock, 100);
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

  // Stage the enemy half-turn after a beat so it reads as a reply, not a mirror
  // of the player's click. The turn is already flipped to 'enemy' (which locks
  // player input) before this fires.
  const scheduleEnemyReply = () => {
    setTimeout(() => {
      const cur = get();
      // Bail if a new game reset the turn, or it somehow already resolved.
      if (cur.game.turn !== 'enemy' || cur.game.winner) return;
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
          weights: adoptedWeightsFor(cur.levelId),
        },
        (enemyRes) => {
          // The worker computed while the board was live; make sure nothing replaced the board
          // meanwhile (a new game / a resume) before applying its move. Queuing a premove only
          // touches the `premoves` slice, so a live board still satisfies game === cur.game.
          if (get().game !== cur.game) return;
          const msgs = enemyRes.events.map(describeEvent).filter((m): m is string => m !== null);
          // With no manual End Turn, a player handed the turn with no legal move would
          // soft-lock — resolve that as a loss (you can't pass in chess).
          const afterEnv = envFor(enemyRes.game);
          const stuckRes = resolveIfPlayerStuck(enemyRes.game, afterEnv);
          let game = stuckRes.game;
          if (stuckRes.stuck) msgs.push(stuckRes.checkmate
            ? 'Checkmate — your King is trapped. Defeat.'
            : 'Stalemate — no legal moves remain. The skirmish is a draw.');
          else if (sideInCheck(game, 'player', afterEnv)) msgs.push('Your King is in check!');
          // A full player→enemy round just elapsed: advance the survive clock, then re-check the
          // objective — survive reached, or a player wipe = defeat.
          const turnsElapsed = (cur.turnsElapsed ?? 0) + 1;
          if (!game.winner) {
            const winner = evaluateObjective(game, cur.objective, { ...(cur.objectiveCtx ?? {}), turnsElapsed });
            if (winner) {
              game = { ...game, winner, turn: 'done' };
              msgs.push(objectiveOutcomeCopy(cur.objective, winner, cur.objectiveCtx?.kingSide));
            }
          }
          // Turn returns to the player: keep the piece they were working with selected so the
          // board reads continuously, only falling back to their first piece if the enemy
          // captured it (or nothing was selected — e.g. a resumed match).
          const keep = livingSelected(game, cur.selectedId, 'player') ?? firstPlayerId(game);
          set({
            game,
            env: envFor(game),
            tick: enemyRes.tick,
            turnsElapsed,
            selectedId: keep,
            focusedId: keep,
            log: [...msgs.reverse(), ...cur.log].slice(0, 12),
          });
          // Footsteps for the enemy half-turn: one per piece that moved, spread out so a
          // multi-move reply reads as a sequence, not one muddy stack. Terrain is static, so the
          // pre-reply env indexes the same board the pieces landed on.
          enemyRes.events
            .filter((e): e is Extract<GameEvent, { kind: 'moved' }> => e.kind === 'moved')
            .forEach((e, i) => playLandingSfx(cur.env, e.to.x, e.to.y, LANDING_SFX_DELAY + i * ENEMY_LANDING_STAGGER));
          // The turn is back with the player — their clock resumes (no-op when untimed or the
          // reply decided the game).
          startClock();
          // Persist the settled post-reply position now (a reload here resumes it; the queued
          // premove is ephemeral and intentionally not saved).
          persistMatch(get());
          // A queued premove fires after a visible beat rather than in this same frame, so the
          // player sees the enemy's move land with their queued arrow still on the board before
          // it executes. drainPremove re-checks validity when it fires — a manual move made
          // during the beat (which flips the turn) makes it drop the chain instead.
          if (get().premoves.length > 0 && !get().game.winner) {
            setTimeout(() => drainPremove(), PREMOVE_FIRE_DELAY);
          }
        },
      );
    }, ENEMY_REPLY_DELAY);
  };

  // Apply a legal player move and run the full post-move pipeline: bank the clock
  // increment, apply, sound the footstep, evaluate the objective, detect checkmate/
  // stalemate/check on the enemy now to move, commit, stage the enemy reply, persist.
  // Shared by the live path (tryMoveTo) and the premove drain so an auto-fired premove
  // is byte-for-byte the same move a click would have made.
  const commitPlayerMove = (piece: Piece, mv: Move) => {
    const s = get();
    pauseClockWithIncrement();
    const playerRes = applyMove(s.game, piece.id, mv);
    let game = playerRes.state;
    // Footstep: only when the piece actually relocates (a 'moved' event). An attack-in-
    // place against an hp>1 target emits 'damaged' with no 'moved', so it must not sound
    // a landing — the single 'moved' event's destination equals (mv.x, mv.y).
    if (playerRes.events.some((e) => e.kind === 'moved')) {
      playLandingSfx(s.env, mv.x, mv.y, LANDING_SFX_DELAY);
    }
    const msgs = playerRes.events.map(describeEvent).filter((m): m is string => m !== null);
    // Objective win on the player's move: capturing the enemy King, routing the last
    // enemy, or stepping onto a reach tile ends it immediately. (survive is decided a
    // round later, after the enemy reply.)
    if (!game.winner) {
      const winner = evaluateObjective(game, s.objective, { ...(s.objectiveCtx ?? {}), turnsElapsed: s.turnsElapsed ?? 0 });
      if (winner) {
        game = { ...game, winner, turn: 'done' };
        msgs.push(objectiveOutcomeCopy(s.objective, winner, s.objectiveCtx?.kingSide));
      }
    }
    // Checkmate the player just delivered ends the game immediately; a non-terminal
    // check is announced.
    const enemyEnv = envFor(game);
    if (!game.winner && game.turn === 'enemy') {
      const term = terminalIfStuck(game, enemyEnv);
      if (term) {
        game = { ...game, winner: term.winner, turn: 'done' };
        msgs.push(term.checkmate
          ? 'Checkmate — the enemy King has no escape. Victory!'
          : 'Stalemate — the enemy has no legal move. The skirmish is a draw.');
      } else if (sideInCheck(game, 'enemy', enemyEnv)) {
        msgs.push('Check!');
      }
    }
    // Keep the moved piece selected (the mover always survives its own move) so its
    // highlight carries through the enemy turn — input is gated by turn, so it shows no
    // move-dots and isn't actionable, it just keeps the player's context visible.
    set({
      game,
      env: enemyEnv,
      selectedId: piece.id,
      focusedId: piece.id,
      log: [...msgs.reverse(), ...s.log].slice(0, 12),
    });
    if (game.turn === 'enemy' && !game.winner) scheduleEnemyReply();
    persistMatch(get());
  };

  // Drain one premove as control returns to the player. Returns true iff a premove was
  // applied. The head is re-validated against the REAL board the enemy reply produced —
  // if its piece was captured or the square is no longer reachable, the WHOLE chain is
  // dropped (chess default: one illegal step kills the queue). A decided game clears the
  // queue too. When a premove fires, its move re-stages the enemy reply, so the next
  // reply's drain pops the next step and the chain plays out as a back-and-forth flurry.
  const drainPremove = (): boolean => {
    const s = get();
    if (s.premoves.length === 0) return false;
    if (s.game.turn !== 'player' || s.game.winner) { set({ premoves: [] }); return false; }
    const [head, ...rest] = s.premoves;
    const p = s.game.pieces.find((q) => q.id === head.pieceId && q.alive && q.side === 'player');
    const mv = p ? legalMoves(p, s.game.pieces, s.game.size, s.env).find((m) => m.x === head.x && m.y === head.y) : undefined;
    if (!p || !mv) { set({ premoves: [] }); return false; }
    set({ premoves: rest });
    commitPlayerMove(p, mv);
    // A premove that ended the game leaves the rest of the chain moot — drop it.
    if (get().game.winner) set({ premoves: [] });
    return true;
  };

  // Apply ONE ordered move to a netplay board. Netplay is SERVER-SEQUENCED: the local
  // player's own move comes back through the server echo like any other, so this is the
  // single apply path for both sides (no optimistic local apply → no rollback/desync).
  // Mirrors the bookkeeping tail of tryMoveTo (SFX, objective + terminal + check, log)
  // but NEVER runs the AI or the clock, and is side-agnostic. Returns true iff it applied.
  const commitNet = (pieceId: string, move: RelayMove): boolean => {
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
    const res = applyMove(s.game, piece.id, mv);
    let game = res.state;
    if (res.events.some((e) => e.kind === 'moved')) playLandingSfx(s.env, mv.x, mv.y, LANDING_SFX_DELAY);
    const msgs = res.events.map(describeEvent).filter((m): m is string => m !== null);
    // A full enemy turn completing (enemy→player) advances the survive-clock round count.
    const turnsElapsed = (s.turnsElapsed ?? 0) + (prevTurn === 'enemy' && game.turn === 'player' ? 1 : 0);

    if (!game.winner) {
      const winner = evaluateObjective(game, s.objective, { ...(s.objectiveCtx ?? {}), turnsElapsed });
      if (winner) { game = { ...game, winner, turn: 'done' }; msgs.push(netOutcomeCopy(winner, localSide)); }
    }
    if (!game.winner && (game.turn === 'player' || game.turn === 'enemy')) {
      const env2 = envFor(game);
      const term = terminalIfStuck(game, env2);
      if (term) {
        game = { ...game, winner: term.winner, turn: 'done' };
        msgs.push(term.checkmate
          ? (term.winner === localSide ? 'Checkmate — victory!' : 'Checkmate — defeat.')
          : 'Stalemate — the skirmish is a draw.');
      } else if (sideInCheck(game, game.turn, env2)) {
        msgs.push(game.turn === localSide ? 'Your King is in check!' : 'Check delivered.');
      }
    }

    const nextSel = game.turn === localSide ? firstOwnId(game, localSide) : null;
    set({
      game,
      env: envFor(game),
      turnsElapsed,
      selectedId: nextSel,
      focusedId: nextSel,
      log: [...msgs.reverse(), ...s.log].slice(0, 12),
      net: { ...s.net, moveCount: s.net.moveCount + 1 },
    });
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
  turnsElapsed: 0,
  started: false,
  levelId: null,
  aiMode: 'search',
  clock: null,
  net: null,
  premoves: [],

  newSkirmish: (opts) => {
    // A previous game's ticker must never outlive its game.
    stopClockTicker();
    const created = createSkirmish(opts);
    const env = envFor(created);
    // Safety net: a degenerate start with no player move resolves rather than locks.
    const { game } = resolveIfPlayerStuck(created, env);
    const objective: ObjectiveType = opts.level?.objective ?? 'capture-king';
    // Uniform for level AND free games (ADR-0050): the level's static context (survive
    // clock / reach cells) plus kingSide read off the ACTUAL starting pieces — a free
    // skirmish fields the King on the enemy side, so its copy stays "Capture the enemy
    // King", while a level whose author gave the player the King flips to "Protect".
    const objectiveCtx: ObjectiveContext = {
      ...(opts.level ? objectiveContextForLevel(opts.level) : {}),
      kingSide: kingSideOf(created.pieces),
    };
    const intro = opts.level
      ? `Test play begins — objective: ${objectiveSummary(objective, objectiveCtx.kingSide)}.`
      : `Skirmish begins — ${objectiveSummary(objective, objectiveCtx.kingSide)}.`;
    const selectedId = firstPlayerId(game);
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
    set({ game, env, seed: opts.seed, tick: 0, turnsElapsed: 0, objectiveCtx, selectedId, focusedId: selectedId, log: [intro], objective, started: true, levelId: opts.level?.id ?? null, aiMode: opts.ai ?? get().aiMode, clock, net: null, premoves: [] });
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
        setTimeout(() => playArrival({ gain: ARRIVAL_BAKED.gain }), delay);
      });
    // Snapshot the fresh board immediately, so a reload before the first move
    // resumes THIS game rather than re-rolling a different random start.
    persistMatch(get());
  },

  newNetMatch: ({ lobbyId, localSide, level, seed }) => {
    // A previous game's ticker must never outlive its game.
    stopClockTicker();
    // Both clients build the SAME board from (level, seed); with the AI disabled the
    // only randomness is initial placement, so the two boards are byte-identical.
    const created = createSkirmish({ seed, level });
    const env = envFor(created);
    const objective: ObjectiveType = level.objective ?? 'capture-king';
    const objectiveCtx: ObjectiveContext = { ...objectiveContextForLevel(level), kingSide: kingSideOf(created.pieces) };
    const localTurn = created.turn === localSide;
    const selectedId = localTurn ? firstOwnId(created, localSide) : null;
    const youCommand = localSide === 'player' ? 'the vanguard' : 'the challenger';
    set({
      game: created,
      env,
      seed,
      tick: 0,
      turnsElapsed: 0,
      objective,
      objectiveCtx,
      selectedId,
      focusedId: selectedId,
      log: [`Multiplayer skirmish — ${objectiveSummary(objective, objectiveCtx.kingSide)}. You command ${youCommand}.`],
      started: true,
      levelId: level.id,
      clock: null, // netplay is untimed in v1 (a shared wall-clock is future work)
      net: { lobbyId, localSide, moveCount: 0 },
    });
    // Deploy roll-call for the pieces this client commands (cosmetic; each client
    // voices only its own side).
    created.pieces
      .filter((pc) => pc.alive && pc.side === localSide)
      .forEach((pc, i) => {
        const delay = SPAWN_SFX_BASE_DELAY + i * SPAWN_SFX_STAGGER;
        playLandingSfx(env, pc.x, pc.y, delay, 0.7);
        setTimeout(() => playArrival({ gain: 0.55 }), delay);
      });
  },

  applyRemoteMove: (pieceId, move) => { commitNet(pieceId, move); },

  resign: () => {
    const s = get();
    // Only meaningful in a live netplay match. The winner isn't set here — the server
    // echoes the terminal result back over the lobby channel and concludeNet ends the
    // game on both boards symmetrically (same single-apply discipline as moves).
    if (!s.net || s.game.winner) return;
    if (netResignSink) netResignSink();
  },

  concludeNet: (winner, reason) => {
    const s = get();
    if (!s.net || s.game.winner) return; // idempotent: already decided (or not netplay)
    const localSide = s.net.localSide;
    const copy = reason === 'resign'
      ? (winner === localSide ? 'Victory — your opponent resigned.' : 'Defeat — you resigned.')
      : netOutcomeCopy(winner, localSide);
    set({
      game: { ...s.game, winner, turn: 'done' },
      selectedId: null,
      focusedId: null,
      log: [copy, ...s.log].slice(0, 12),
    });
  },

  resumeMatch: (match) => {
    // A previous game's ticker must never outlive its game.
    stopClockTicker();
    const game = match.game;
    const env = envFor(game);
    const selectedId = firstPlayerId(game);
    set({
      game,
      env,
      seed: match.seed,
      tick: match.tick,
      turnsElapsed: match.turnsElapsed,
      objective: match.objective,
      objectiveCtx: match.objectiveCtx,
      log: match.log,
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
      // Resume with the clock paused; startClock re-arms the deadline from the
      // banked remainder when it's the player's live turn. A reload isn't thinking
      // time, so the player keeps the time they had at their last move.
      clock: match.clock ? { ...match.clock, running: false } : null,
      net: null, // netplay disables persistence, so a disk-resumed match is single-player
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
    const { game, selectedId, env, net } = get();
    const side = net ? net.localSide : 'player';
    if (game.turn !== side || game.winner) return [];
    const p = game.pieces.find((q) => q.id === selectedId && q.alive && q.side === side);
    return p ? legalMoves(p, game.pieces, game.size, env) : [];
  },

  tryMoveTo: (x, y) => {
    const s = get();
    const side = s.net ? s.net.localSide : 'player';
    if (s.game.turn !== side || s.game.winner) return;
    const p = s.game.pieces.find((q) => q.id === s.selectedId && q.alive && q.side === side);
    if (!p) return;
    const mv = legalMoves(p, s.game.pieces, s.game.size, s.env).find((m) => m.x === x && m.y === y);
    if (!mv) return;
    // Netplay is server-sequenced: DON'T apply locally — relay the target cell and let
    // the server's echo apply it in order on both boards (no optimistic apply, so a
    // dropped POST is a no-op the seat can retry, never a permanent desync). Clear the
    // selection for immediate "click registered" feedback; the echo sets the next one.
    if (s.net) { if (netMoveSink) netMoveSink(p.id, { x: mv.x, y: mv.y }); set({ selectedId: null, focusedId: null }); return; }
    // A deliberate manual move overrides any premove queued during the fire-beat — the
    // player took the wheel, so drop the chain rather than firing it a beat later.
    if (s.premoves.length) set({ premoves: [] });
    // Single-player: the move's rhythm — it lands on its own so it animates and reads, then
    // a beat, then the enemy answers — lives in commitPlayerMove, shared with the premove
    // drain so an auto-fired premove is byte-for-byte the same move a click would make.
    commitPlayerMove(p, mv);
  },

  queueMove: (pieceId, x, y) => {
    const s = get();
    // Premoves are single-player only — the local AI reply is what drains them, and a
    // netplay match has no such local reply. They're also the OPPONENT-turn action: on the
    // player's own live turn a click is a real move. Nothing queues onto a decided game.
    if (s.net || s.game.turn === 'player' || s.game.winner) return;
    // Validate against the PROVISIONAL board (current board + the moves already queued)
    // so the chain builds on itself; the tip stays legal for the click that follows.
    if (!premoveTargets(s.game, s.premoves, pieceId).some((m) => m.x === x && m.y === y)) return;
    set({ premoves: [...s.premoves, { pieceId, x, y }] });
  },

  clearPremoves: () => {
    if (get().premoves.length) set({ premoves: [] });
  },
  };
});

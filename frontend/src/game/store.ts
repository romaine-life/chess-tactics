// Skirmish store (Zustand) — the single source of truth for the new game UI.
// It owns a GameState and applies intents through the pure core (intents in,
// new state out). The renderer and HUD subscribe to it; neither mutates state.

import { create } from 'zustand';
import type { GameEvent, GameState, Move, Side, Winner } from '../core/types';
import { applyMove, enemyMove, legalMoves, livingPieces, sideInCheck, type MoveEnv } from '../core/rules';
import { evaluateVictory, kingSideOf, objectiveContextForLevel, objectiveSummary, victoryRulesForObjective, type ObjectiveContext } from '../core/objectives';
import type { ObjectiveType, VictoryRules } from '../core/level';
import { buildTerrainIndex, terrainAt } from '../core/terrain';
import { playArrival, playTerrain } from '../sfx';
import { createRng } from '../core/rng';
import { createSkirmish, type SkirmishOptions } from './setup';
import { persistMatch, type PersistedMatch } from './matchPersistence';

// Turn tempo (ms). A move isn't one simultaneous swap — it's a rhythm: your move
// lands, the board settles for a beat, the enemy "thinks", then answers. This
// delay stages that read-beat + thinking pause before the enemy reply resolves.
const ENEMY_REPLY_DELAY = 520;

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

/** Movement environment for a state: indexes its terrain layer (if authored). */
function envFor(game: GameState): MoveEnv {
  return { terrain: game.terrain ? buildTerrainIndex(game.terrain) : undefined, lastMove: game.lastMove };
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

/** Resolve the enemy half-turn(s) deterministically until it's the player's move again. */
function resolveEnemy(game: GameState, seed: number, tick: number, env: MoveEnv): { game: GameState; tick: number; events: GameEvent[] } {
  const events: GameEvent[] = [];
  while (game.turn === 'enemy' && !game.winner) {
    const move = enemyMove(game, createRng(seed + tick), env);
    tick += 1;
    if (!move) { game = { ...game, turn: 'player' }; break; }
    const res = applyMove(game, move.pieceId, move.move);
    game = res.state;
    events.push(...res.events);
  }
  return { game, tick, events };
}

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
  /** An authored win/lose OVERRIDE for this game (ADR-0055): `level.victory` when the level
   * carried one, else null to fall back to the `objective` preset (victoryRulesForObjective,
   * resolved at eval time). Stored as the override — not the resolved rules — so `objective` +
   * `objectiveCtx` stay the single source of truth for preset games; the eval sites derive the
   * preset rules each turn, matching how evaluateObjective always worked. */
  victoryOverride: VictoryRules | null;
  /** Completed player→enemy rounds — the clock the `survive` objective counts. */
  turnsElapsed: number;
  /** True once newSkirmish has built a real game (vs the module-load placeholder). */
  started: boolean;
  /** Level this game is testing (null = free skirmish). Lets the screen tell
   * "resume the same board" from "launch a different level". */
  levelId: string | null;
  /** The battle clock, when the level authored one (null = untimed). */
  clock: ClockState | null;
  newSkirmish: (opts: SkirmishOptions) => void;
  /** Rehydrate a match saved to disk (see matchPersistence) — used to resume the
   * live board after a page reload instead of starting a fresh game. */
  resumeMatch: (match: PersistedMatch) => void;
  select: (id: string | null) => void;
  focus: (id: string | null) => void;
  movesForSelected: () => Move[];
  tryMoveTo: (x: number, y: number) => void;
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
      const enemyRes = resolveEnemy(cur.game, cur.seed, cur.tick, envFor(cur.game));
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
      // A full player→enemy round just elapsed: advance the survive clock, then
      // re-check the objective — survive reached, or a player wipe = defeat.
      const turnsElapsed = (cur.turnsElapsed ?? 0) + 1;
      if (!game.winner) {
        const ctx = { ...(cur.objectiveCtx ?? {}), turnsElapsed };
        const winner = evaluateVictory(game, cur.victoryOverride ?? victoryRulesForObjective(cur.objective, ctx), ctx);
        if (winner) {
          game = { ...game, winner, turn: 'done' };
          msgs.push(objectiveOutcomeCopy(cur.objective, winner, cur.objectiveCtx?.kingSide));
        }
      }
      set({
        game,
        env: envFor(game),
        tick: enemyRes.tick,
        turnsElapsed,
        selectedId: firstPlayerId(game),
        focusedId: firstPlayerId(game),
        log: [...msgs.reverse(), ...cur.log].slice(0, 12),
      });
      // Footsteps for the enemy half-turn: one per piece that moved, spread out so a
      // multi-move reply reads as a sequence, not one muddy stack. Terrain is static,
      // so the pre-reply env indexes the same board the pieces landed on.
      enemyRes.events
        .filter((e): e is Extract<GameEvent, { kind: 'moved' }> => e.kind === 'moved')
        .forEach((e, i) => playLandingSfx(cur.env, e.to.x, e.to.y, LANDING_SFX_DELAY + i * ENEMY_LANDING_STAGGER));
      // The turn is back with the player — their clock resumes (no-op when untimed
      // or the reply decided the game).
      startClock();
      // The board settled after the enemy answer (or the reply decided it): persist
      // the new position, or drop the saved copy if the game just ended.
      persistMatch(get());
    }, ENEMY_REPLY_DELAY);
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
  turnsElapsed: 0,
  started: false,
  levelId: null,
  clock: null,

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
    // The level's authored win/lose lists override the preset (ADR-0055); null ⇒ the eval sites
    // derive the `objective` preset each turn from objectiveCtx (kingSide / survive target).
    const victoryOverride: VictoryRules | null = opts.level?.victory ?? null;
    const intro = opts.level
      ? `Test play begins — objective: ${objectiveSummary(objective, objectiveCtx.kingSide)}.`
      : `Skirmish begins — ${objectiveSummary(objective, objectiveCtx.kingSide)}.`;
    const selectedId = firstPlayerId(game);
    // Arm the battle clock from the level's authored time control (null = untimed).
    const tc = opts.level?.timeControl;
    const clock: ClockState | null = tc
      ? { remainingMs: tc.initialSeconds * 1000, running: false, incrementMs: tc.incrementSeconds * 1000 }
      : null;
    set({ game, env, seed: opts.seed, tick: 0, turnsElapsed: 0, objectiveCtx, victoryOverride, selectedId, focusedId: selectedId, log: [intro], objective, started: true, levelId: opts.level?.id ?? null, clock });
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
        setTimeout(() => playArrival({ gain: 0.55 }), delay);
      });
    // Snapshot the fresh board immediately, so a reload before the first move
    // resumes THIS game rather than re-rolling a different random start.
    persistMatch(get());
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
      // Back-compat: a match saved before ADR-0055 has no override → preset (null).
      victoryOverride: match.victoryOverride ?? null,
      log: match.log,
      levelId: match.levelId,
      selectedId,
      focusedId: selectedId,
      started: true,
      // Resume with the clock paused; startClock re-arms the deadline from the
      // banked remainder when it's the player's live turn. A reload isn't thinking
      // time, so the player keeps the time they had at their last move.
      clock: match.clock ? { ...match.clock, running: false } : null,
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
    const p = get().game.pieces.find((q) => q.id === id && q.alive);
    if (p && p.side === 'player') set({ selectedId: id, focusedId: id });
  },

  focus: (id) => {
    if (id === null) { set({ focusedId: get().selectedId }); return; }
    const p = get().game.pieces.find((q) => q.id === id && q.alive);
    if (!p) return;
    set({ focusedId: id, selectedId: p.side === 'player' ? id : get().selectedId });
  },

  movesForSelected: () => {
    const { game, selectedId, env } = get();
    if (game.turn !== 'player' || game.winner) return [];
    const p = game.pieces.find((q) => q.id === selectedId && q.alive && q.side === 'player');
    return p ? legalMoves(p, game.pieces, game.size, env) : [];
  },

  tryMoveTo: (x, y) => {
    const s = get();
    if (s.game.turn !== 'player' || s.game.winner) return;
    const p = s.game.pieces.find((q) => q.id === s.selectedId && q.alive && q.side === 'player');
    if (!p) return;
    const mv = legalMoves(p, s.game.pieces, s.game.size, s.env).find((m) => m.x === x && m.y === y);
    if (!mv) return;
    // The move is legal and WILL apply — the player's clock stops here, banking the
    // Fischer increment. It stays paused for the whole enemy reply.
    pauseClockWithIncrement();
    const playerRes = applyMove(s.game, p.id, mv);
    let game = playerRes.state;
    // Footstep: only when the piece actually relocates (applyMove emits a 'moved'
    // event). An attack-in-place against an hp>1 target emits 'damaged' with no
    // 'moved', so it must not sound a landing — this mirrors the enemy path. The
    // single player 'moved' event's destination equals (x, y), so the args are right.
    if (playerRes.events.some((e) => e.kind === 'moved')) {
      playLandingSfx(s.env, x, y, LANDING_SFX_DELAY);
    }
    const msgs = playerRes.events.map(describeEvent).filter((m): m is string => m !== null);
    // Objective win on the player's move: capturing the enemy King, routing the
    // last enemy, or stepping a piece onto a reach tile ends the game immediately —
    // what makes the displayed objective honest. (survive can only be decided once
    // a round elapses, so it's checked after the enemy reply, not here.)
    if (!game.winner) {
      const ctx = { ...(s.objectiveCtx ?? {}), turnsElapsed: s.turnsElapsed ?? 0 };
      const winner = evaluateVictory(game, s.victoryOverride ?? victoryRulesForObjective(s.objective, ctx), ctx);
      if (winner) {
        game = { ...game, winner, turn: 'done' };
        msgs.push(objectiveOutcomeCopy(s.objective, winner, s.objectiveCtx?.kingSide));
      }
    }
    // Checkmate the player just delivered ends the game immediately: if the enemy
    // (now to move) has no legal reply, that's checkmate (victory) when its King is
    // in check, otherwise stalemate (a draw). A non-terminal check is announced.
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
    // Beat 1: commit the player's move on its own so it animates and the board
    // reads before the enemy answers. applyMove flips the turn to 'enemy', which
    // also locks further player input until the reply resolves.
    set({
      game,
      env: enemyEnv,
      selectedId: null,
      focusedId: null,
      log: [...msgs.reverse(), ...s.log].slice(0, 12),
    });
    // Beats 2–3: a read beat, then the enemy "thinks" and answers.
    if (game.turn === 'enemy' && !game.winner) scheduleEnemyReply();
    // Persist the post-move position (turn now 'enemy', or 'done' if this move won).
    // A reload here resumes mid enemy-turn and re-stages the reply (see resumeMatch),
    // or — if the move ended the game — persistMatch drops the saved copy.
    persistMatch(get());
  },
  };
});

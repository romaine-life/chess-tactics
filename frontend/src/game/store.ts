// Skirmish store (Zustand) — the single source of truth for the new game UI.
// It owns a GameState and applies intents through the pure core (intents in,
// new state out). The renderer and HUD subscribe to it; neither mutates state.

import { create } from 'zustand';
import type { GameEvent, GameState, Move, Winner } from '../core/types';
import { applyMove, enemyMove, legalMoves, livingPieces, type MoveEnv } from '../core/rules';
import { evaluateObjective, kingSideOf, objectiveContextForLevel, objectiveSummary, type ObjectiveContext } from '../core/objectives';
import type { ObjectiveType } from '../core/level';
import { buildTerrainIndex, terrainAt } from '../core/terrain';
import { playArrival, playTerrain } from '../sfx';
import { createRng } from '../core/rng';
import { createSkirmish, type SkirmishOptions } from './setup';

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

/** True if any living player piece has at least one legal move. */
export function playerHasLegalMove(game: GameState, env: MoveEnv): boolean {
  return livingPieces(game.pieces, 'player').some((p) => legalMoves(p, game.pieces, game.size, env).length > 0);
}

/**
 * Resolve a soft-lock: with no manual "end turn" anymore, a player who has zero
 * legal moves would otherwise be stuck forever. There is no voluntary passing in
 * chess, so a player who genuinely cannot move ends the game in a stalemate — a
 * draw. Only acts on the player's undecided turn with no move available;
 * otherwise returns the state unchanged.
 */
export function resolveIfPlayerStuck(game: GameState, env: MoveEnv): { game: GameState; stuck: boolean } {
  if (game.turn === 'player' && !game.winner && !playerHasLegalMove(game, env)) {
    return { game: { ...game, winner: 'draw', turn: 'done' }, stuck: true };
  }
  return { game, stuck: false };
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
  newSkirmish: (opts: SkirmishOptions) => void;
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
      const stuckRes = resolveIfPlayerStuck(enemyRes.game, envFor(enemyRes.game));
      let game = stuckRes.game;
      if (stuckRes.stuck) msgs.push('Stalemate — no legal moves remain. The skirmish is a draw.');
      // A full player→enemy round just elapsed: advance the survive clock, then
      // re-check the objective — survive reached, or a player wipe = defeat.
      const turnsElapsed = (cur.turnsElapsed ?? 0) + 1;
      if (!game.winner) {
        const winner = evaluateObjective(game, cur.objective, { ...(cur.objectiveCtx ?? {}), turnsElapsed });
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
  turnsElapsed: 0,
  started: false,
  levelId: null,

  newSkirmish: (opts) => {
    const created = createSkirmish(opts);
    const env = envFor(created);
    // Safety net: a degenerate start with no player move resolves rather than locks.
    const { game } = resolveIfPlayerStuck(created, env);
    const objective: ObjectiveType = opts.level?.objective ?? 'capture-king';
    // Uniform for level AND free games (ADR-0048): the level's static context (survive
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
    set({ game, env, seed: opts.seed, tick: 0, turnsElapsed: 0, objectiveCtx, selectedId, focusedId: selectedId, log: [intro], objective, started: true, levelId: opts.level?.id ?? null });
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
      const winner = evaluateObjective(game, s.objective, { ...(s.objectiveCtx ?? {}), turnsElapsed: s.turnsElapsed ?? 0 });
      if (winner) {
        game = { ...game, winner, turn: 'done' };
        msgs.push(objectiveOutcomeCopy(s.objective, winner, s.objectiveCtx?.kingSide));
      }
    }
    // Beat 1: commit the player's move on its own so it animates and the board
    // reads before the enemy answers. applyMove flips the turn to 'enemy', which
    // also locks further player input until the reply resolves.
    set({
      game,
      env: envFor(game),
      selectedId: null,
      focusedId: null,
      log: [...msgs.reverse(), ...s.log].slice(0, 12),
    });
    // Beats 2–3: a read beat, then the enemy "thinks" and answers.
    if (game.turn === 'enemy' && !game.winner) scheduleEnemyReply();
  },
  };
});

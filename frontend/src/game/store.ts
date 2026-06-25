// Skirmish store (Zustand) — the single source of truth for the new game UI.
// It owns a GameState and applies intents through the pure core (intents in,
// new state out). The renderer and HUD subscribe to it; neither mutates state.

import { create } from 'zustand';
import type { GameEvent, GameState, Move } from '../core/types';
import { applyMove, enemyMove, legalMoves, type MoveEnv } from '../core/rules';
import { buildTerrainIndex } from '../core/terrain';
import { createRng } from '../core/rng';
import { createSkirmish, type SkirmishOptions } from './setup';

// Turn tempo (ms). A move isn't one simultaneous swap — it's a rhythm: your move
// lands, the board settles for a beat, the enemy "thinks", then answers. This
// delay stages that read-beat + thinking pause before the enemy reply resolves.
const ENEMY_REPLY_DELAY = 520;

const OBJECTIVE_LOG_COPY = {
  'capture-all': 'capture all enemy pieces',
  'capture-king': 'capture the enemy King',
  survive: 'survive the assault',
  reach: 'reach the objective',
} as const;

/** Movement environment for a state: indexes its terrain layer (if authored). */
function envFor(game: GameState): MoveEnv {
  return { terrain: game.terrain ? buildTerrainIndex(game.terrain) : undefined, lastMove: game.lastMove };
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
  newSkirmish: (opts: SkirmishOptions) => void;
  select: (id: string | null) => void;
  focus: (id: string | null) => void;
  movesForSelected: () => Move[];
  tryMoveTo: (x: number, y: number) => void;
  endTurn: () => void;
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
      set({
        game: enemyRes.game,
        env: envFor(enemyRes.game),
        tick: enemyRes.tick,
        selectedId: firstPlayerId(enemyRes.game),
        focusedId: firstPlayerId(enemyRes.game),
        log: [...msgs.reverse(), ...cur.log].slice(0, 12),
      });
    }, ENEMY_REPLY_DELAY);
  };

  return {
  game: INITIAL_GAME,
  env: envFor(INITIAL_GAME),
  selectedId: null,
  focusedId: null,
  seed: 1,
  tick: 0,
  log: [],

  newSkirmish: (opts) => {
    const game = createSkirmish(opts);
    const intro = opts.level
      ? `Test play begins — objective: ${OBJECTIVE_LOG_COPY[opts.level.objective]}.`
      : 'Skirmish begins — move or capture; last side standing wins.';
    const selectedId = firstPlayerId(game);
    set({ game, env: envFor(game), seed: opts.seed, tick: 0, selectedId, focusedId: selectedId, log: [intro] });
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
    const msgs = playerRes.events.map(describeEvent).filter((m): m is string => m !== null);
    // Beat 1: commit the player's move on its own so it animates and the board
    // reads before the enemy answers. applyMove flips the turn to 'enemy', which
    // also locks further player input until the reply resolves.
    set({
      game: playerRes.state,
      env: envFor(playerRes.state),
      selectedId: null,
      focusedId: null,
      log: [...msgs.reverse(), ...s.log].slice(0, 12),
    });
    // Beats 2–3: a read beat, then the enemy "thinks" and answers.
    if (playerRes.state.turn === 'enemy' && !playerRes.state.winner) scheduleEnemyReply();
  },

  endTurn: () => {
    const s = get();
    if (s.game.turn !== 'player' || s.game.winner) return;
    set({ game: { ...s.game, turn: 'enemy' }, selectedId: null, focusedId: null });
    scheduleEnemyReply();
  },
  };
});

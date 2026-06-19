// Skirmish store (Zustand) — the single source of truth for the new game UI.
// It owns a GameState and applies intents through the pure core (intents in,
// new state out). The renderer and HUD subscribe to it; neither mutates state.

import { create } from 'zustand';
import type { GameEvent, GameState, Move } from '../core/types';
import { applyMove, enemyMove, legalMoves, type MoveEnv } from '../core/rules';
import { buildTerrainIndex } from '../core/terrain';
import { createRng } from '../core/rng';
import { createSkirmish, type SkirmishOptions } from './setup';

/** Movement environment for a state: indexes its terrain layer (if authored). */
function envFor(game: GameState): MoveEnv {
  return { terrain: game.terrain ? buildTerrainIndex(game.terrain) : undefined };
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
  seed: number;
  tick: number;
  log: string[];
  newSkirmish: (opts: SkirmishOptions) => void;
  select: (id: string | null) => void;
  movesForSelected: () => Move[];
  tryMoveTo: (x: number, y: number) => void;
  endTurn: () => void;
}

const INITIAL_GAME = createSkirmish({ seed: 1 });

export const useSkirmish = create<SkirmishState>((set, get) => ({
  game: INITIAL_GAME,
  env: envFor(INITIAL_GAME),
  selectedId: null,
  seed: 1,
  tick: 0,
  log: [],

  newSkirmish: (opts) => {
    const game = createSkirmish(opts);
    set({ game, env: envFor(game), seed: opts.seed, tick: 0, selectedId: firstPlayerId(game), log: ['Skirmish begins — move or capture; last side standing wins.'] });
  },

  select: (id) => {
    if (id === null) { set({ selectedId: null }); return; }
    const p = get().game.pieces.find((q) => q.id === id && q.alive);
    if (p && p.side === 'player') set({ selectedId: id });
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
    const enemyRes = resolveEnemy(playerRes.state, s.seed, s.tick, s.env);
    const msgs = [...playerRes.events, ...enemyRes.events].map(describeEvent).filter((m): m is string => m !== null);
    set({
      game: enemyRes.game,
      tick: enemyRes.tick,
      selectedId: firstPlayerId(enemyRes.game),
      log: [...msgs.reverse(), ...s.log].slice(0, 12),
    });
  },

  endTurn: () => {
    const s = get();
    if (s.game.turn !== 'player' || s.game.winner) return;
    const enemyRes = resolveEnemy({ ...s.game, turn: 'enemy' }, s.seed, s.tick, s.env);
    const msgs = enemyRes.events.map(describeEvent).filter((m): m is string => m !== null);
    set({ game: enemyRes.game, tick: enemyRes.tick, selectedId: firstPlayerId(enemyRes.game), log: [...msgs.reverse(), ...s.log].slice(0, 12) });
  },
}));

// Pure game-state types. No DOM, no canvas, no framework — this is the part of
// the codebase that must outlive every renderer/UI choice (Phase 1 of the
// migration). Everything here is serializable.

export type Side = 'player' | 'enemy' | 'neutral';

export type PieceType = 'pawn' | 'knight' | 'bishop' | 'rook' | 'queen' | 'rock' | 'random-rock';

/**
 * Board tile materials. Defined here (the foundational type module) rather than
 * in `core/level.ts` so both the editor's `Level` and the live `GameState` share
 * one terrain vocabulary; `core/level.ts` re-exports these for back-compat.
 */
export type TerrainType = 'grass' | 'water' | 'stone' | 'road' | 'bridge' | 'cliff' | 'rock';

export interface Vec {
  x: number;
  y: number;
}

export interface BoardSize {
  cols: number;
  rows: number;
}

/** A single board tile: its material and its isometric elevation (0 = ground). */
export interface TerrainCell {
  x: number;
  y: number;
  terrain: TerrainType;
  /** Elevation level (0 = ground). The isometric multi-height axis. */
  elevation: number;
}

export interface Piece {
  id: string;
  side: Side;
  type: PieceType;
  x: number;
  y: number;
  alive: boolean;
  /** Home rank — used for the pawn double-step. */
  startY: number;
  /**
   * Current hit points. Optional + defaults to 1 everywhere (`pieceHp`), so
   * legacy single-hit capture behaviour is preserved when unset. With hp > 1 a
   * captured piece survives until its hp reaches 0 (Into-the-Breach-style).
   */
  hp?: number;
  /** Max hit points (for HUD bars). Defaults to the spawn hp. */
  maxHp?: number;
  /**
   * Action points remaining this turn. Opt-in: when unset, `pieceAp` defaults to
   * 1 and the classic one-action-per-turn model holds. With AP authored and the
   * AP-aware apply path enabled, a side keeps acting until its pieces run out of
   * AP, then AP refreshes to `maxAp` on the next turn (Into-the-Breach-style).
   */
  ap?: number;
  /** Max action points; refreshed to this at the start of the owner's turn. */
  maxAp?: number;
}

/**
 * A telegraphed enemy action for the *next* enemy turn — the signature
 * "forecast the queued attack a turn ahead" mechanic. Computed deterministically
 * from the current state (see `forecastEnemyIntents`) so the overlay shown to the
 * player matches what the enemy will actually do.
 */
export interface EnemyIntent {
  pieceId: string;
  from: Vec;
  to: Vec;
  /** `attack` if the queued move captures/damages a piece, else `move`. */
  kind: 'move' | 'attack';
  /** Victim of an `attack` intent. */
  targetId?: string;
  /** Damage the attack would deal (defaults to 1). */
  damage?: number;
}

export interface Move {
  x: number;
  y: number;
  /** id of a piece captured by making this move, if any. */
  capture?: string;
}

export type Winner = Side | null;
export type Turn = Side | 'done';

export interface GameState {
  size: BoardSize;
  pieces: Piece[];
  /**
   * Board terrain layer (one cell per authored tile). Optional + serializable so
   * legacy/terrain-free states stay valid: when absent, every tile is treated as
   * open grass at elevation 0 (see `buildTerrainIndex` / `canTraverse`). Water,
   * cliff, and rock tiles are impassable; movement generation honours this when
   * the layer is indexed into `MoveEnv.terrain`.
   */
  terrain?: TerrainCell[];
  turn: Turn;
  winner: Winner;
  /**
   * Telegraphed enemy actions for the upcoming enemy turn. Recomputed after each
   * player move (see `withForecast`). Optional so existing callers/serialized
   * states stay valid.
   */
  intents?: EnemyIntent[];
}

export type GameEvent =
  | { kind: 'moved'; pieceId: string; from: Vec; to: Vec }
  | { kind: 'captured'; pieceId: string; by: string }
  | { kind: 'damaged'; pieceId: string; by: string; amount: number; hp: number }
  | { kind: 'promoted'; pieceId: string; to: PieceType }
  | { kind: 'victory'; winner: Side };

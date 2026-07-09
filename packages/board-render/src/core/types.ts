// Pure game-state types. No DOM, no canvas, no framework — this is the part of
// the codebase that must outlive every renderer/UI choice (Phase 1 of the
// migration). Everything here is serializable.

import type { PlacedProp } from './props';

export type Side = 'player' | 'enemy' | 'neutral';

export type PieceType = 'pawn' | 'knight' | 'bishop' | 'rook' | 'queen' | 'king' | 'rock' | 'random-rock';
export type PromotionPieceType = 'queen' | 'rook' | 'bishop' | 'knight';
export const PROMOTION_PIECE_TYPES = ['queen', 'rook', 'bishop', 'knight'] as const satisfies readonly PromotionPieceType[];

export type UnitFacing = 'north' | 'north-east' | 'east' | 'south-east' | 'south' | 'south-west' | 'west' | 'north-west';

/**
 * Board tile materials. Defined here (the foundational type module) rather than
 * in `core/level.ts` so both the editor's `Level` and the live `GameState` share
 * one terrain vocabulary; `core/level.ts` re-exports these for back-compat.
 */
export type TerrainType = 'grass' | 'water' | 'stone' | 'road' | 'bridge' | 'cliff' | 'rock' | 'dirt' | 'pebble' | 'sand' | 'void';

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
  /** Ambient ground-cover density (see core/groundCover). Absent = no cover on this tile. */
  cover?: { density: 'sparse' | 'filled' };
}

export interface Piece {
  id: string;
  side: Side;
  type: PieceType;
  x: number;
  y: number;
  alive: boolean;
  /** Board-facing direction for the rendered directional sprite. */
  facing?: UnitFacing;
  /** Starting column — used with `startY` for directional pawn double-steps. */
  startX?: number;
  /** Starting row — used for the pawn double-step. */
  startY: number;
  /** Original pawn-forward direction. Unlike `facing`, this never changes after setup. */
  pawnForward?: UnitFacing;
  /**
   * True once this piece has made any move this game. Castling rights are history-exact:
   * a king or rook that has EVER moved may not castle, even after returning to its square
   * (the positional startX/startY proxy can't tell those apart).
   */
  hasMoved?: boolean;
  /**
   * Lifetime "service record" stats for this skirmish, surfaced in the HUD.
   * All optional + default to 0; accumulated by `applyMove` on committed moves
   * only (never during hypothetical AI/telegraph evaluation).
   */
  /** Times this unit acted (moved or attacked-in-place). */
  timesUsed?: number;
  /** Cumulative distance moved; a diagonal step counts 1.5, an orthogonal 1. */
  squaresTraveled?: number;
  /** Opponents this unit has captured. */
  enemiesKilled?: number;
  /** Times this unit moved off a square an opponent was attacking. */
  escapes?: number;
  /** Opponents this unit newly placed under attack by moving. */
  threatsMade?: number;
}

export interface PawnPromotionRule {
  /** Absent means either combat side may trigger the promotion. */
  side?: 'player' | 'enemy';
  cells: Vec[];
  choices?: PromotionPieceType[];
  defaultPromotion?: PromotionPieceType;
}

export interface LastMove {
  pieceId: string;
  pieceType: PieceType;
  side: Side;
  from: Vec;
  to: Vec;
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
  /** `attack` if the queued move captures a piece, else `move`. */
  kind: 'move' | 'attack';
  /** Victim of an `attack` intent. */
  targetId?: string;
}

export interface Move {
  x: number;
  y: number;
  /** id of a piece captured by making this move, if any. */
  capture?: string;
  /** True when a pawn captures a just-double-stepped pawn from the side. */
  enPassant?: boolean;
  /**
   * Castling: this king move also relocates the named rook. Self-contained so replay,
   * netplay re-derivation, and search all reproduce the rook hop from (pieceId, Move)
   * alone. The destination (x, y) is the king's landing square — always distinct from
   * a one-step king move, so destination-keyed move matching stays unambiguous.
   */
  castle?: { rookId: string; rookTo: Vec };
}

/**
 * One authored castling option — a king-rook pair (ADR-0072). Available while the
 * rule's king and a friendly rook sit UNMOVED on their authored squares; the king
 * then slides to `kingTo` and the rook to `rookTo` under chess castling legality
 * (path clear, not out of / through / into check — see rules.legalMoves).
 */
export interface CastleRule {
  side: 'player' | 'enemy';
  king: Vec;
  rook: Vec;
  kingTo: Vec;
  rookTo: Vec;
}

/** Which chess draw rules this game enforces (authored per level via a chess-draws event). */
export interface DrawRules {
  /** 100 halfmoves (50 full moves) with no capture or pawn move ends the game as a draw. */
  fiftyMove?: boolean;
  /** The same position (placement + side to move + castling rights + en-passant rights)
   * occurring a third time ends the game as a draw. */
  threefold?: boolean;
}

/** Game outcome: a side won, 'draw' (e.g. stalemate — no legal moves), or null while undecided. */
export type Winner = Side | 'draw' | null;
export type Turn = Side | 'done';

export interface GameState {
  size: BoardSize;
  pieces: Piece[];
  /**
   * Board terrain layer (one cell per authored tile). Optional + serializable so
   * legacy/terrain-free states stay valid: when absent, every tile is treated as
   * open grass at elevation 0 (see `buildTerrainIndex` / `canTraverse`). Water is
   * passable terrain; cliff, rock, and void tiles are impassable. Movement generation
   * honours this when the layer is indexed into `MoveEnv.terrain`.
   */
  terrain?: TerrainCell[];
  /**
   * Edge fences: walls on orthogonal cell edges, as canonical edge keys (roadEdgeKey "x,y|x,y").
   * A move that crosses an interior fenced edge is blocked (knights, whose steps are never
   * orthogonally adjacent, hop over — like water). Boundary rails may use one off-board endpoint
   * and are visual because pieces cannot move off the board. Optional + serializable, mirroring
   * `terrain?`: a fence-free state omits it, and movement is unaffected when absent.
   */
  fences?: string[];
  /**
   * Lossless Level Editor board encoding for authored maps. Gameplay still reads `terrain`
   * and `props`; the renderer uses this to keep the exact painted tile IDs/features instead
   * of regenerating visual variants from terrain + seed.
   */
  boardCode?: string;
  /**
   * Multi-cell decorative props (trees, houses). Optional + serializable, mirroring
   * `terrain?`: a legacy/prop-free state simply omits it (= no props). Blocking props are
   * realised as neutral `rock` colliders in `pieces` at build time (see game/setup.ts); this
   * list is the RENDER channel the board reads to draw the tall prop sprite (see SkirmishBoard).
   */
  props?: PlacedProp[];
  /**
   * Authored pawn-promotion cells. A pawn promotes only after landing on one of these
   * cells; a level/free skirmish with none disables promotion entirely.
   * @deprecated Use promotionRules; kept so old saved matches continue to resume.
   */
  promotionZones?: Vec[];
  /** Authored promotion events resolved to live board cells. */
  promotionRules?: PawnPromotionRule[];
  /**
   * Authored castling options (ADR-0072), resolved from the level's castle events at
   * build. Absent = no castling, so every existing level plays exactly as before.
   */
  castleRules?: CastleRule[];
  /**
   * Chess draw rules this game enforces, from the level's chess-draws event. Absent =
   * none (stalemate remains the only draw), the same back-compat pattern as terrain?.
   */
  drawRules?: DrawRules;
  /**
   * Halfmoves since the last capture or pawn move — the 50-move rule's clock.
   * Maintained by applyMove on every move; absent (legacy saves) reads as 0.
   */
  halfmoveClock?: number;
  /**
   * Threefold repetition table: occurrences per position key (see rules.positionKey)
   * since the last capture or pawn move (earlier positions can never recur, so the
   * table restarts there and stays small). Maintained on COMMITTED moves only via
   * rules.recordPosition — applyMove never touches it, so search nodes share the
   * committed table by reference at zero copy cost. Present only when drawRules
   * enables threefold.
   */
  positionCounts?: Record<string, number>;
  turn: Turn;
  winner: Winner;
  /** Last displaced move, used for immediate pawn en passant eligibility. */
  lastMove?: LastMove;
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
  | { kind: 'promoted'; pieceId: string; to: PieceType }
  | { kind: 'castled'; kingId: string; rookId: string }
  | { kind: 'victory'; winner: Side };

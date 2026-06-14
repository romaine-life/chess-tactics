// Pure game-state types. No DOM, no canvas, no framework — this is the part of
// the codebase that must outlive every renderer/UI choice (Phase 1 of the
// migration). Everything here is serializable.

export type Side = 'player' | 'enemy' | 'neutral';

export type PieceType = 'pawn' | 'knight' | 'bishop' | 'rook' | 'queen' | 'rock' | 'random-rock';

export interface Vec {
  x: number;
  y: number;
}

export interface BoardSize {
  cols: number;
  rows: number;
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
  turn: Turn;
  winner: Winner;
}

export type GameEvent =
  | { kind: 'moved'; pieceId: string; from: Vec; to: Vec }
  | { kind: 'captured'; pieceId: string; by: string }
  | { kind: 'promoted'; pieceId: string; to: PieceType }
  | { kind: 'victory'; winner: Side };

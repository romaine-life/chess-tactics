import type { PieceType } from './types';

export const PLAYABLE_PIECE_TYPES = ['pawn', 'knight', 'bishop', 'rook', 'queen', 'king'] as const satisfies readonly PieceType[];
export type PlayablePieceType = typeof PLAYABLE_PIECE_TYPES[number];

export const PIECE_LABEL: Record<PieceType, string> = {
  pawn: 'Pawn',
  knight: 'Knight',
  bishop: 'Bishop',
  rook: 'Rook',
  queen: 'Queen',
  king: 'King',
  rock: 'Rock',
  'random-rock': 'Rock',
};

export const PIECE_MARK: Record<PieceType, string> = {
  pawn: 'P',
  knight: 'N',
  bishop: 'B',
  rook: 'R',
  queen: 'Q',
  king: 'K',
  rock: 'O',
  'random-rock': '?',
};

// Team-color palettes. Each unit ships its 8 directions rendered in every palette;
// a board side is assigned a palette (default player navy-blue / enemy crimson). The
// roster sprites live at /assets/units/<type>/<palette>/<direction>.png.
export const UNIT_PALETTES = ['navy-blue', 'crimson', 'golden', 'emerald'] as const;
export type UnitPalette = typeof UNIT_PALETTES[number];
export const DEFAULT_PALETTE: UnitPalette = 'navy-blue';

export const pieceSpritePath = (type: PlayablePieceType, palette: UnitPalette = DEFAULT_PALETTE, direction = 'south') =>
  `/assets/units/${type}/${palette}/${direction}.png`;

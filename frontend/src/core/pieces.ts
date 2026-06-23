import type { PieceType } from './types';

export const PLAYABLE_PIECE_TYPES = ['pawn', 'knight', 'bishop', 'queen', 'king'] as const satisfies readonly PieceType[];
export type PlayablePieceType = typeof PLAYABLE_PIECE_TYPES[number];

export const PIECE_LABEL: Record<PieceType, string> = {
  pawn: 'Pawn',
  knight: 'Knight',
  bishop: 'Bishop',
  queen: 'Queen',
  king: 'King',
  rock: 'Rock',
  'random-rock': 'Rock',
};

export const PIECE_MARK: Record<PieceType, string> = {
  pawn: 'P',
  knight: 'N',
  bishop: 'B',
  queen: 'Q',
  king: 'K',
  rock: 'R',
  'random-rock': '?',
};

export const pieceSpritePath = (type: PlayablePieceType, direction = 'south') => `/assets/units/${type}/candidate-claude/${direction}.png`;

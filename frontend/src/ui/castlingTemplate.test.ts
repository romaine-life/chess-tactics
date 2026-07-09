import { describe, it, expect } from 'vitest';
import { computeCastleTemplatePairs, type CastleTemplateUnit } from './castlingTemplate';

const U = (side: 'player' | 'enemy', type: 'king' | 'rook', x: number, y: number): CastleTemplateUnit => ({ side, type, x, y });

describe('computeCastleTemplatePairs', () => {
  it('produces the four chess castles from a standard chess start', () => {
    // 8x8 chess: white home rank y=7, black y=0, kings on the e-file (x=4).
    const pairs = computeCastleTemplatePairs([
      U('player', 'king', 4, 7), U('player', 'rook', 0, 7), U('player', 'rook', 7, 7),
      U('enemy', 'king', 4, 0), U('enemy', 'rook', 0, 0), U('enemy', 'rook', 7, 0),
    ]);
    expect(pairs.map((p) => p.name)).toEqual([
      'Player castles queenside', 'Player castles kingside',
      'Enemy castles queenside', 'Enemy castles kingside',
    ]);
    const playerKingside = pairs.find((p) => p.name === 'Player castles kingside')!.action;
    expect(playerKingside).toMatchObject({ king: { x: 4, y: 7 }, rook: { x: 7, y: 7 }, kingTo: { x: 6, y: 7 }, rookTo: { x: 5, y: 7 } });
    const enemyQueenside = pairs.find((p) => p.name === 'Enemy castles queenside')!.action;
    expect(enemyQueenside).toMatchObject({ king: { x: 4, y: 0 }, rook: { x: 0, y: 0 }, kingTo: { x: 2, y: 0 }, rookTo: { x: 3, y: 0 } });
  });

  it('skips pairs that are misaligned or too close for the two-square slide', () => {
    expect(computeCastleTemplatePairs([U('player', 'king', 4, 7), U('player', 'rook', 5, 6)])).toEqual([]); // no shared line
    expect(computeCastleTemplatePairs([U('player', 'king', 4, 7), U('player', 'rook', 6, 7)])).toEqual([]); // distance 2
  });

  it('handles file-aligned pairs and names non-chess distances by the rook square', () => {
    const pairs = computeCastleTemplatePairs([U('player', 'king', 4, 2), U('player', 'rook', 4, 8)]);
    expect(pairs).toHaveLength(1);
    expect(pairs[0].name).toBe('Player castles toward (4, 8)');
    expect(pairs[0].action).toMatchObject({ kingTo: { x: 4, y: 4 }, rookTo: { x: 4, y: 3 } });
  });

  it('never pairs across sides', () => {
    expect(computeCastleTemplatePairs([U('player', 'king', 4, 7), U('enemy', 'rook', 7, 7)])).toEqual([]);
  });
});

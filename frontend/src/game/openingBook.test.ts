import { describe, it, expect } from 'vitest';
import {
  generateOpeningBook, stateAtPosition, positionBalance,
  type BookPosition, type OpeningBookSettings,
} from './openingBook';
import { matchScore, spsaStep, encodeWeights, DEFAULT_HYPERPARAMS } from './tuning';
import { playLevelGame } from './selfplay';
import { DEFAULT_EVAL_WEIGHTS } from '../core/ai';
import { createBlankLevel, type Level } from '../core/level';
import { createFromLevel } from './setup';

const MATCH = { search: { maxDepth: 1, maxNodes: 1500 }, maxPlies: 50 };

// A board with several legal moves per side, so opening pools have >1 option and
// seeds genuinely diverge — the whole point of the feature.
function battle(): Level {
  const level = createBlankLevel('ob-battle', 'Battle', 8, 8);
  level.objective = 'capture-all';
  level.layers.units = [
    { x: 1, y: 6, type: 'queen', side: 'player' },
    { x: 3, y: 6, type: 'knight', side: 'player' },
    { x: 5, y: 6, type: 'rook', side: 'player' },
    { x: 6, y: 1, type: 'rook', side: 'enemy' },
    { x: 4, y: 1, type: 'bishop', side: 'enemy' },
    { x: 2, y: 1, type: 'queen', side: 'enemy' },
  ];
  return level;
}

const settings = (over: Partial<OpeningBookSettings> = {}): OpeningBookSettings => ({
  size: 6, seedBase: 1, plies: 4, variety: 0.5, ...over,
});

// A stable, order-insensitive fingerprint of one position's move sequence.
const fingerprint = (pos: BookPosition): string =>
  pos.moves.map((m) => `${m.pieceId}:${m.from.x},${m.from.y}->${m.move.x},${m.move.y}`).join('|');

const distinctCount = (book: BookPosition[]): number =>
  new Set(book.map(fingerprint)).size;

describe('generateOpeningBook determinism', () => {
  it('same (level, settings) => byte-identical book', () => {
    const a = generateOpeningBook(battle(), settings(), MATCH);
    const b = generateOpeningBook(battle(), settings(), MATCH);
    expect(a).toEqual(b);
  });
});

describe('generateOpeningBook variety', () => {
  it('different seeds => different move sequences (=> different boards)', () => {
    const book = generateOpeningBook(battle(), settings(), MATCH);
    // The feature exists to make book entries DIFFER. With a >1 pool the seeds must
    // produce more than one distinct opening among six positions.
    expect(distinctCount(book)).toBeGreaterThan(1);
    // And distinct openings must reach distinct BOARDS, not just distinct move lists.
    const boards = new Set(
      book.map((pos) =>
        stateAtPosition(battle(), pos).pieces
          .filter((p) => p.alive)
          .map((p) => `${p.id}@${p.x},${p.y}`)
          .sort()
          .join('|')),
    );
    expect(boards.size).toBeGreaterThan(1);
  });

  it('even at variety 0 the floor-2 pool lets seeds diverge', () => {
    const book = generateOpeningBook(battle(), settings({ variety: 0 }), MATCH);
    expect(distinctCount(book)).toBeGreaterThan(1);
  });

  it('changing ONLY the seed changes the walk (the seed is the causal variable)', () => {
    // Two single-position books identical but for seedBase — isolates the seed as the
    // cause of divergence (the aggregate test above could be driven by ply variation).
    const a = generateOpeningBook(battle(), settings({ size: 1, seedBase: 1 }), MATCH)[0];
    const b = generateOpeningBook(battle(), settings({ size: 1, seedBase: 2 }), MATCH)[0];
    expect(fingerprint(a)).not.toBe(fingerprint(b));
  });

  it('higher variety does not reduce the distinct-position count', () => {
    const low = distinctCount(generateOpeningBook(battle(), settings({ variety: 0 }), MATCH));
    const mid = distinctCount(generateOpeningBook(battle(), settings({ variety: 0.5 }), MATCH));
    const high = distinctCount(generateOpeningBook(battle(), settings({ variety: 1 }), MATCH));
    expect(mid).toBeGreaterThanOrEqual(low);
    expect(high).toBeGreaterThanOrEqual(mid);
  });
});

describe('positions are well-formed', () => {
  it('every recorded move replays cleanly and the position has combatants', () => {
    const book = generateOpeningBook(battle(), settings(), MATCH);
    for (const pos of book) {
      const state = stateAtPosition(battle(), pos);
      const combatants = state.pieces.filter((p) => p.alive && (p.side === 'player' || p.side === 'enemy'));
      expect(combatants.length).toBeGreaterThan(0);
      // side-to-move parity: each ply flips the turn, so after N plies parity matches.
      expect(pos.moves.length).toBeLessThanOrEqual(settings().plies);
    }
  });

  it('positionBalance is finite for generated positions', () => {
    const book = generateOpeningBook(battle(), settings(), MATCH);
    for (const pos of book) {
      const bal = positionBalance(battle(), pos);
      expect(Number.isFinite(bal)).toBe(true);
    }
  });

  it('positionBalance is signed by material: player up => positive, enemy up => negative', () => {
    const up = createBlankLevel('ob-up', 'Up', 8, 8);
    up.objective = 'capture-all';
    up.layers.units = [
      { x: 1, y: 6, type: 'queen', side: 'player' },
      { x: 2, y: 6, type: 'king', side: 'player' },
      { x: 4, y: 1, type: 'king', side: 'enemy' },
    ];
    expect(positionBalance(up, { seed: 1, moves: [] })).toBeGreaterThan(0);

    const down = createBlankLevel('ob-down', 'Down', 8, 8);
    down.objective = 'capture-all';
    down.layers.units = [
      { x: 2, y: 6, type: 'king', side: 'player' },
      { x: 1, y: 1, type: 'queen', side: 'enemy' },
      { x: 4, y: 1, type: 'king', side: 'enemy' },
    ];
    expect(positionBalance(down, { seed: 1, moves: [] })).toBeLessThan(0);
  });

  it('side-to-move parity matches the opening-ply count', () => {
    const startTurn = createFromLevel(battle(), 1).turn; // 'player'
    const pos = generateOpeningBook(battle(), settings({ size: 1, plies: 3 }), MATCH)[0];
    const turn = stateAtPosition(battle(), pos).turn;
    if (turn === 'player' || turn === 'enemy') {
      const even = pos.moves.length % 2 === 0;
      const flip = startTurn === 'player' ? 'enemy' : 'player';
      expect(turn).toBe(even ? startTurn : flip);
    }
  });
});

describe('start-from-position self-play', () => {
  it('runs to a terminal winner or a draw from a book position', { timeout: 60_000 }, () => {
    const book = generateOpeningBook(battle(), settings({ size: 1 }), MATCH);
    const pos = book[0];
    const rec = playLevelGame(battle(), { seed: pos.seed, openingMoves: pos.moves, search: MATCH.search, maxPlies: MATCH.maxPlies });
    expect(['player', 'enemy', 'draw']).toContain(rec.winner);
  });

  it('openingMoves is additive — omitting it plays from the fixed start unchanged', { timeout: 60_000 }, () => {
    const withNone = playLevelGame(battle(), { seed: 1, search: MATCH.search, maxPlies: MATCH.maxPlies });
    const withEmpty = playLevelGame(battle(), { seed: 1, openingMoves: [], search: MATCH.search, maxPlies: MATCH.maxPlies });
    expect(withEmpty).toEqual(withNone);
  });
});

describe('tuning over a BookPosition[] book', () => {
  it('matchScore(w, w, book) === 0.5 (swap symmetry over positions)', { timeout: 60_000 }, () => {
    const book = generateOpeningBook(battle(), settings({ size: 3, plies: 3 }), MATCH);
    expect(matchScore(battle(), DEFAULT_EVAL_WEIGHTS, DEFAULT_EVAL_WEIGHTS, book, MATCH)).toBe(0.5);
  });

  it('spsaStep is deterministic over a position book', { timeout: 60_000 }, () => {
    const book = generateOpeningBook(battle(), settings({ size: 2, plies: 3 }), MATCH);
    const theta = encodeWeights(DEFAULT_EVAL_WEIGHTS);
    const r1 = spsaStep(battle(), theta, DEFAULT_EVAL_WEIGHTS, book, 0, 7, DEFAULT_HYPERPARAMS, MATCH);
    const r2 = spsaStep(battle(), theta, DEFAULT_EVAL_WEIGHTS, book, 0, 7, DEFAULT_HYPERPARAMS, MATCH);
    expect(r1).toEqual(r2);
  });
});

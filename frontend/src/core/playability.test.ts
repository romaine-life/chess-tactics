import { describe, it, expect } from 'vitest';
import { validatePlayability } from './playability';
import { createBlankLevel, type Level, type Zone } from './level';
import type { PieceType, Side } from './types';

// Builders: a 6×6 all-grass board (createBlankLevel) mutated per test. The helpers keep
// each test about ONE rule — e.g. every random-placement level ships valid zones+roster
// unless the test is deliberately breaking that piece.

function unit(x: number, y: number, type: PieceType, side: Side) {
  return { x, y, type, side };
}

function zone(id: string, type: Zone['type'], tiles: Array<[number, number]>): Zone {
  return { id, type, tiles };
}

/** Fixed-placement level with one piece per side — the minimal playable board. */
function fixedLevel(mutate?: (level: Level) => void): Level {
  const level = createBlankLevel('pf', 'Fixed', 6, 6);
  level.layers.units = [unit(0, 5, 'pawn', 'player'), unit(5, 0, 'pawn', 'enemy')];
  mutate?.(level);
  return level;
}

/** Random-placement level: 1 pawn per side, a 3-tile spawn strip each, no authored units. */
function randomLevel(mutate?: (level: Level) => void): Level {
  const level = createBlankLevel('pr', 'Random', 6, 6);
  level.placement = 'random';
  level.roster = { player: { pawn: 1 }, enemy: { pawn: 1 } };
  level.layers.zones = [
    zone('ps', 'player-spawn', [[0, 5], [1, 5], [2, 5]]),
    zone('es', 'enemy-spawn', [[0, 0], [1, 0], [2, 0]]),
  ];
  mutate?.(level);
  return level;
}

const codes = (level: Level) => validatePlayability(level).violations.map((v) => v.code);
const messages = (level: Level) => validatePlayability(level).violations.map((v) => v.message);

describe('P1 — each side fields at least one piece', () => {
  it('passes with one piece per side (fixed)', () => {
    expect(validatePlayability(fixedLevel())).toEqual({ ok: true, violations: [] });
  });

  it('fails the Player side when only the enemy has units', () => {
    const level = fixedLevel((l) => { l.layers.units = [unit(5, 0, 'pawn', 'enemy')]; });
    const res = validatePlayability(level);
    expect(res.ok).toBe(false);
    expect(res.violations).toEqual([expect.objectContaining({ code: 'P1_SIDE_EMPTY', message: expect.stringContaining('Player side') })]);
  });

  it('fails the Enemy side when only the player has units', () => {
    const level = fixedLevel((l) => { l.layers.units = [unit(0, 5, 'pawn', 'player')]; });
    expect(messages(level)).toEqual([expect.stringContaining('Enemy side')]);
  });

  it('fails BOTH sides on an empty board (the fresh-blank-level case from the ADR)', () => {
    const level = fixedLevel((l) => { l.layers.units = []; });
    expect(codes(level)).toEqual(['P1_SIDE_EMPTY', 'P1_SIDE_EMPTY']);
  });

  it('random placement counts the roster, not the (empty) units layer', () => {
    expect(validatePlayability(randomLevel())).toEqual({ ok: true, violations: [] });
    const emptyEnemy = randomLevel((l) => { l.roster = { player: { pawn: 1 }, enemy: {} }; });
    expect(validatePlayability(emptyEnemy).violations).toContainEqual(
      expect.objectContaining({ code: 'P1_SIDE_EMPTY', message: expect.stringContaining('Enemy side') }),
    );
  });
});

describe('P2 — kings per mode', () => {
  it('King Assault passes with the King on the ENEMY side only (the classic direction)', () => {
    const level = fixedLevel((l) => {
      l.objective = 'capture-king';
      l.layers.units = [unit(0, 5, 'pawn', 'player'), unit(5, 0, 'king', 'enemy')];
    });
    expect(validatePlayability(level).ok).toBe(true);
  });

  it('King Assault passes with the King on the PLAYER side only (direction-aware)', () => {
    const level = fixedLevel((l) => {
      l.objective = 'capture-king';
      l.layers.units = [unit(0, 5, 'king', 'player'), unit(5, 0, 'pawn', 'enemy')];
    });
    expect(validatePlayability(level).ok).toBe(true);
  });

  it('King Assault fails when BOTH sides field a King', () => {
    const level = fixedLevel((l) => {
      l.objective = 'capture-king';
      l.layers.units = [unit(0, 5, 'king', 'player'), unit(5, 0, 'king', 'enemy')];
    });
    expect(codes(level)).toEqual(['P2_KING_ASSAULT_KINGS']);
    expect(messages(level)[0]).toContain('King Assault');
  });

  it('King Assault fails when NEITHER side fields a King', () => {
    const level = fixedLevel((l) => { l.objective = 'capture-king'; });
    expect(codes(level)).toEqual(['P2_KING_ASSAULT_KINGS']);
  });

  it('King Assault fails when the King-holding side fields TWO Kings', () => {
    const level = fixedLevel((l) => {
      l.objective = 'capture-king';
      l.layers.units = [unit(0, 5, 'pawn', 'player'), unit(5, 0, 'king', 'enemy'), unit(4, 0, 'king', 'enemy')];
    });
    expect(codes(level)).toEqual(['P2_KING_ASSAULT_KINGS']);
  });

  it('King Assault reads roster kings under random placement', () => {
    const pass = randomLevel((l) => {
      l.objective = 'capture-king';
      l.roster = { player: { pawn: 1 }, enemy: { king: 1 } };
    });
    expect(validatePlayability(pass).ok).toBe(true);
    const bothSides = randomLevel((l) => {
      l.objective = 'capture-king';
      l.roster = { player: { king: 1 }, enemy: { king: 1 } };
    });
    expect(codes(bothSides)).toContain('P2_KING_ASSAULT_KINGS');
  });

  it('Rival Kings passes with exactly one King on each side', () => {
    const level = fixedLevel((l) => {
      l.objective = 'rival-kings';
      l.layers.units = [unit(0, 5, 'king', 'player'), unit(5, 0, 'king', 'enemy')];
    });
    expect(validatePlayability(level).ok).toBe(true);
  });

  it('Rival Kings fails per missing/extra King, naming the offending side', () => {
    const missingPlayer = fixedLevel((l) => {
      l.objective = 'rival-kings';
      l.layers.units = [unit(0, 5, 'pawn', 'player'), unit(5, 0, 'king', 'enemy')];
    });
    expect(validatePlayability(missingPlayer).violations).toEqual([
      expect.objectContaining({ code: 'P2_RIVAL_KINGS_KINGS', message: expect.stringContaining('Player side has 0') }),
    ]);
    const doubleEnemy = fixedLevel((l) => {
      l.objective = 'rival-kings';
      l.layers.units = [unit(0, 5, 'king', 'player'), unit(5, 0, 'king', 'enemy'), unit(4, 0, 'king', 'enemy')];
    });
    expect(validatePlayability(doubleEnemy).violations).toEqual([
      expect.objectContaining({ code: 'P2_RIVAL_KINGS_KINGS', message: expect.stringContaining('Enemy side has 2') }),
    ]);
  });

  it('modes without a King constraint accept any King arrangement', () => {
    for (const objective of ['capture-all', 'survive', 'reach'] as const) {
      const level = fixedLevel((l) => {
        l.objective = objective;
        l.layers.units = [unit(0, 5, 'king', 'player'), unit(5, 0, 'king', 'enemy')];
      });
      expect(validatePlayability(level).ok).toBe(true);
    }
  });
});

describe('P3 — random placement zones and capacity', () => {
  it('a fully-authored random level passes', () => {
    expect(validatePlayability(randomLevel())).toEqual({ ok: true, violations: [] });
  });

  it('fixed placement runs no P3 checks (zones optional, units authored)', () => {
    expect(validatePlayability(fixedLevel()).ok).toBe(true);
  });

  it('fails when units are painted alongside random placement', () => {
    const level = randomLevel((l) => { l.layers.units = [unit(3, 3, 'pawn', 'player')]; });
    expect(codes(level)).toContain('P3_UNITS_NOT_EMPTY');
  });

  it('fails per side missing its spawn zone', () => {
    const noPlayerZone = randomLevel((l) => { l.layers.zones = l.layers.zones.filter((z) => z.type !== 'player-spawn'); });
    expect(validatePlayability(noPlayerZone).violations).toEqual([
      expect.objectContaining({ code: 'P3_NO_SPAWN_ZONE', message: expect.stringContaining('Player side') }),
    ]);
    const noZonesAtAll = randomLevel((l) => { l.layers.zones = []; });
    expect(codes(noZonesAtAll)).toEqual(['P3_NO_SPAWN_ZONE', 'P3_NO_SPAWN_ZONE']);
  });

  it('capacity: usable tiles exactly equal to the roster is enough (>= not >)', () => {
    const level = randomLevel((l) => {
      l.roster = { player: { pawn: 2, knight: 1 }, enemy: { pawn: 1 } };
      l.layers.zones = [
        zone('ps', 'player-spawn', [[0, 5], [1, 5], [2, 5]]), // 3 tiles for 3 pieces
        zone('es', 'enemy-spawn', [[0, 0]]), // 1 tile for 1 piece
      ];
    });
    expect(validatePlayability(level)).toEqual({ ok: true, violations: [] });
  });

  it('capacity: one tile short fails with a plain-language shortfall', () => {
    const level = randomLevel((l) => {
      l.roster = { player: { pawn: 3 }, enemy: { pawn: 1 } };
      l.layers.zones = [
        zone('ps', 'player-spawn', [[0, 5], [1, 5]]), // 2 tiles for 3 pieces
        zone('es', 'enemy-spawn', [[0, 0]]),
      ];
    });
    expect(validatePlayability(level).violations).toEqual([
      expect.objectContaining({ code: 'P3_ZONE_CAPACITY', message: expect.stringContaining('1 more usable tile') }),
    ]);
  });

  it('impassable terrain does not count as a usable spawn tile', () => {
    const level = randomLevel((l) => {
      l.roster = { player: { pawn: 3 }, enemy: { pawn: 1 } };
      l.layers.zones = [zone('ps', 'player-spawn', [[0, 5], [1, 5], [2, 5]]), zone('es', 'enemy-spawn', [[0, 0]])];
      // Turn one pooled tile to blocking rock: 3 tiles authored, only 2 usable.
      const cell = l.layers.terrain.find((c) => c.x === 1 && c.y === 5)!;
      cell.terrain = 'rock';
    });
    expect(codes(level)).toEqual(['P3_ZONE_CAPACITY']);
  });

  it('a blocking-prop footprint does not count as usable spawn tiles', () => {
    const level = randomLevel((l) => {
      l.roster = { player: { pawn: 3 }, enemy: { pawn: 1 } };
      // The oak is 2×2 blocking anchored at (0,4): it covers (0,5) and (1,5) of the pool.
      l.layers.props = [{ x: 0, y: 4, propId: 'oak' }];
      l.layers.zones = [zone('ps', 'player-spawn', [[0, 5], [1, 5], [2, 5]]), zone('es', 'enemy-spawn', [[0, 0]])];
    });
    expect(validatePlayability(level).violations).toEqual([
      expect.objectContaining({ code: 'P3_ZONE_CAPACITY', message: expect.stringContaining('2 more usable tiles') }),
    ]);
  });

  it('pooled tiles are deduped across zones of the same type', () => {
    const level = randomLevel((l) => {
      l.roster = { player: { pawn: 2 }, enemy: { pawn: 1 } };
      // Two player zones both claim (0,5): the pool is 1 unique tile, not 2.
      l.layers.zones = [
        zone('ps1', 'player-spawn', [[0, 5]]),
        zone('ps2', 'player-spawn', [[0, 5]]),
        zone('es', 'enemy-spawn', [[0, 0]]),
      ];
    });
    expect(codes(level)).toEqual(['P3_ZONE_CAPACITY']);
  });

  it('out-of-bounds tiles are not usable (defense in depth under validateLevel)', () => {
    const level = randomLevel((l) => {
      l.roster = { player: { pawn: 1 }, enemy: { pawn: 1 } };
      l.layers.zones = [zone('ps', 'player-spawn', [[99, 99]]), zone('es', 'enemy-spawn', [[0, 0]])];
    });
    expect(codes(level)).toEqual(['P3_ZONE_CAPACITY']);
  });

  it('player and enemy spawn pools must not overlap', () => {
    const level = randomLevel((l) => {
      l.layers.zones = [
        zone('ps', 'player-spawn', [[0, 5], [3, 3]]),
        zone('es', 'enemy-spawn', [[0, 0], [3, 3]]), // (3,3) claimed by both sides
      ];
    });
    expect(validatePlayability(level).violations).toEqual([
      expect.objectContaining({ code: 'P3_ZONES_OVERLAP', message: expect.stringContaining('overlap on 1 tile') }),
    ]);
  });
});

describe('P4 — survive turn target', () => {
  it('accepts an integer >= 1 and an absent field (default applies)', () => {
    expect(validatePlayability(fixedLevel((l) => { l.objective = 'survive'; l.surviveTurns = 1; })).ok).toBe(true);
    expect(validatePlayability(fixedLevel((l) => { l.objective = 'survive'; })).ok).toBe(true);
  });

  it('rejects zero, negative and fractional targets', () => {
    for (const surviveTurns of [0, -2, 1.5]) {
      const level = fixedLevel((l) => { l.objective = 'survive'; l.surviveTurns = surviveTurns; });
      expect(codes(level)).toEqual(['P4_SURVIVE_TURNS']);
      expect(messages(level)[0]).toContain('Survive');
    }
  });
});

describe('P5 — battle clock', () => {
  it('accepts a whole-second control and an absent field (untimed)', () => {
    expect(validatePlayability(fixedLevel((l) => { l.timeControl = { initialSeconds: 300, incrementSeconds: 2 }; })).ok).toBe(true);
    expect(validatePlayability(fixedLevel((l) => { l.timeControl = { initialSeconds: 1, incrementSeconds: 0 }; })).ok).toBe(true);
    expect(validatePlayability(fixedLevel(() => {})).ok).toBe(true);
  });

  it('rejects a zero/fractional starting time and a negative increment', () => {
    const bad: Array<{ initialSeconds: number; incrementSeconds: number }> = [
      { initialSeconds: 0, incrementSeconds: 0 },
      { initialSeconds: 2.5, incrementSeconds: 0 },
      { initialSeconds: 300, incrementSeconds: -1 },
      { initialSeconds: 300, incrementSeconds: 0.5 },
    ];
    for (const timeControl of bad) {
      const level = fixedLevel((l) => { l.timeControl = timeControl; });
      expect(codes(level)).toEqual(['P5_TIME_CONTROL']);
      expect(messages(level)[0]).toContain('clock');
    }
  });
});

describe('P6 — authored victory conditions (ADR-0055)', () => {
  it('accepts a rule set with at least one win rule and one lose rule, and an absent field (preset)', () => {
    const authored = fixedLevel((l) => {
      l.victory = [
        { if: [{ kind: 'eliminate', side: 'player' }], then: 'lose' },
        { if: [{ kind: 'reach', side: 'player' }], then: 'win' },
        { if: [{ kind: 'eliminate', side: 'enemy' }], then: 'win' },
      ];
    });
    expect(validatePlayability(authored)).toEqual({ ok: true, violations: [] });
    expect(validatePlayability(fixedLevel(() => {})).ok).toBe(true); // no victory → preset
  });

  it('rejects a set with no win rule (unwinnable) or no lose rule (unlosable)', () => {
    const noWin = fixedLevel((l) => { l.victory = [{ if: [{ kind: 'eliminate', side: 'player' }], then: 'lose' }]; });
    expect(codes(noWin)).toEqual(['P6_VICTORY_NO_WIN']);
    const noLose = fixedLevel((l) => { l.victory = [{ if: [{ kind: 'eliminate', side: 'enemy' }], then: 'win' }]; });
    expect(codes(noLose)).toEqual(['P6_VICTORY_NO_LOSE']);
    const neither = fixedLevel((l) => { l.victory = []; });
    expect(codes(neither)).toEqual(['P6_VICTORY_NO_WIN', 'P6_VICTORY_NO_LOSE']);
  });
});

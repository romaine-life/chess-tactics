import { describe, it, expect } from 'vitest';
import { createBlankLevel, validateLevel, LEVEL_FORMAT_VERSION } from './level';
import { roadEdgeKey } from './featureAutotile';

describe('level schema', () => {
  it('creates a full-size, valid blank level', () => {
    const lvl = createBlankLevel('l1', 'Test', 12, 8);
    expect(lvl.formatVersion).toBe(LEVEL_FORMAT_VERSION);
    expect(lvl.layers.terrain).toHaveLength(96); // 12 * 8
    const res = validateLevel(lvl);
    expect(res.ok).toBe(true);
  });
  it('rejects a bad formatVersion and out-of-range board', () => {
    // 0 cols is below the new 1×1 floor (ADR-0050 dropped the arbitrary 4×4 minimum).
    const bad = { ...createBlankLevel('l1'), formatVersion: 99, board: { cols: 0, rows: 8, heightLevels: 1 } };
    const res = validateLevel(bad);
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.errors.some((e) => e.includes('formatVersion'))).toBe(true);
      expect(res.errors.some((e) => e.includes('board.cols'))).toBe(true);
    }
  });
  it('accepts a 1×1 board — the structural floor is 1, playability is the real gate', () => {
    expect(validateLevel(createBlankLevel('l1', 'Tiny', 1, 1)).ok).toBe(true);
  });
  it('rejects an out-of-bounds unit', () => {
    const lvl = createBlankLevel('l1', 'T', 8, 8);
    lvl.layers.units.push({ x: 99, y: 0, type: 'knight', side: 'player' });
    expect(validateLevel(lvl).ok).toBe(false);
  });
  it('rejects non-objects', () => {
    expect(validateLevel(null).ok).toBe(false);
    expect(validateLevel('nope').ok).toBe(false);
  });

  it('validates a legacy body with NO layers.props (back-compat)', () => {
    const lvl = createBlankLevel('l1', 'T', 8, 8);
    delete (lvl.layers as { props?: unknown }).props; // pre-props body
    expect(validateLevel(lvl).ok).toBe(true);
  });

  it('accepts a well-formed layers.props when present', () => {
    const lvl = createBlankLevel('l1', 'T', 8, 8);
    lvl.layers.props = [{ x: 0, y: 0, propId: 'oak' }];
    expect(validateLevel(lvl).ok).toBe(true);
  });

  it('accepts a well-formed authored victory (if-then rules), and an absent field (preset) — ADR-0064', () => {
    const lvl = createBlankLevel('l1', 'T', 8, 8);
    lvl.victory = [
      { if: [{ kind: 'eliminate', side: 'player' }], do: [{ kind: 'lose', side: 'player' }] },
      { if: [{ kind: 'turnLimit', turns: 5 }, { kind: 'eliminate', side: 'enemy', filter: { type: 'king' } }], do: [{ kind: 'win', side: 'player' }] },
      { if: [{ kind: 'reach', side: 'player' }], do: [{ kind: 'win', side: 'player' }] },
    ];
    expect(validateLevel(lvl).ok).toBe(true);
    delete (lvl as { victory?: unknown }).victory; // absent ⇒ valid (the objective preset applies)
    expect(validateLevel(lvl).ok).toBe(true);
  });

  it('rejects malformed victory rules (bad action/kind/side/turns/filter, non-array) — ADR-0064', () => {
    const bad: unknown[] = [
      { not: 'an array' },
      [{ if: [{ kind: 'eliminate', side: 'enemy' }], do: [{ kind: 'maybe', side: 'player' }] }], // bad action kind
      [{ if: [{ kind: 'eliminate', side: 'enemy' }], do: 'nope' }], // do not an array
      [{ if: [{ kind: 'nope' }], do: [{ kind: 'win', side: 'player' }] }],
      [{ if: [{ kind: 'eliminate', side: 'neither' }], do: [{ kind: 'win', side: 'player' }] }],
      [{ if: [{ kind: 'turnLimit', turns: 0 }], do: [{ kind: 'win', side: 'player' }] }],
      [{ if: [{ kind: 'eliminate', side: 'enemy', filter: { type: 'rock' } }], do: [{ kind: 'win', side: 'player' }] }],
      [{ if: 'nope', do: [{ kind: 'win', side: 'player' }] }], // if not an array
    ];
    for (const victory of bad) {
      expect(validateLevel({ ...createBlankLevel('l1', 'T', 8, 8), victory } as unknown).ok).toBe(false);
    }
  });

  it('rejects a malformed layers.props entry when present', () => {
    const lvl = createBlankLevel('l1', 'T', 8, 8);
    // missing propId / non-numeric coords
    (lvl.layers as { props: unknown }).props = [{ x: 'a', propId: 5 }];
    expect(validateLevel(lvl).ok).toBe(false);
  });

  it('rejects a non-array layers.props when present', () => {
    const lvl = createBlankLevel('l1', 'T', 8, 8);
    (lvl.layers as { props: unknown }).props = 'nope';
    expect(validateLevel(lvl).ok).toBe(false);
  });

  it('rejects an out-of-bounds prop anchor (symmetric with the unit bounds check)', () => {
    const lvl = createBlankLevel('l1', 'T', 8, 8);
    lvl.layers.props = [{ x: 99, y: 0, propId: 'oak' }];
    expect(validateLevel(lvl).ok).toBe(false);
  });

  it('accepts boundary fence rails that touch the board', () => {
    const lvl = createBlankLevel('l1', 'T', 8, 8);
    lvl.layers.fences = [roadEdgeKey(0, 0, 0, -1), roadEdgeKey(7, 7, 8, 7)];
    expect(validateLevel(lvl).ok).toBe(true);
  });

  it('rejects fence edges that do not touch the board', () => {
    const lvl = createBlankLevel('l1', 'T', 8, 8);
    lvl.layers.fences = [roadEdgeKey(-2, 0, -1, 0)];
    expect(validateLevel(lvl).ok).toBe(false);
  });

  // ADR-0050 structural checks: mode id, the placement axis fields and zone shape/bounds.
  it('rejects an unknown objective id but accepts every mode id including rival-kings', () => {
    const lvl = createBlankLevel('l1', 'T', 8, 8);
    for (const objective of ['capture-all', 'capture-king', 'rival-kings', 'survive', 'reach'] as const) {
      expect(validateLevel({ ...lvl, objective }).ok).toBe(true);
    }
    expect(validateLevel({ ...lvl, objective: 'king-of-the-hill' as never }).ok).toBe(false);
  });

  it('placement: accepts fixed/random/absent, rejects anything else', () => {
    const lvl = createBlankLevel('l1', 'T', 8, 8);
    expect(validateLevel(lvl).ok).toBe(true); // absent ⇒ fixed (back-compat)
    expect(validateLevel({ ...lvl, placement: 'fixed' }).ok).toBe(true);
    expect(validateLevel({ ...lvl, placement: 'random' }).ok).toBe(true);
    expect(validateLevel({ ...lvl, placement: 'scattered' as never }).ok).toBe(false);
  });

  it('roster: playable piece types with positive integer counts only', () => {
    const lvl = createBlankLevel('l1', 'T', 8, 8);
    expect(validateLevel({ ...lvl, roster: { player: { pawn: 2, king: 1 }, enemy: { knight: 1 } } }).ok).toBe(true);
    // rocks are scenery, not fieldable pieces
    expect(validateLevel({ ...lvl, roster: { player: { rock: 1 }, enemy: {} } }).ok).toBe(false);
    expect(validateLevel({ ...lvl, roster: { player: { 'random-rock': 1 }, enemy: {} } }).ok).toBe(false);
    // counts must be positive integers
    expect(validateLevel({ ...lvl, roster: { player: { pawn: 0 }, enemy: {} } }).ok).toBe(false);
    expect(validateLevel({ ...lvl, roster: { player: { pawn: 1.5 }, enemy: {} } }).ok).toBe(false);
    expect(validateLevel({ ...lvl, roster: { player: { pawn: -1 }, enemy: {} } }).ok).toBe(false);
    // both side maps are required shape-wise
    expect(validateLevel({ ...lvl, roster: { player: { pawn: 1 } } as never }).ok).toBe(false);
    expect(validateLevel({ ...lvl, roster: 'nope' as never }).ok).toBe(false);
  });

  it('surviveTurns: positive integer when present', () => {
    const lvl = createBlankLevel('l1', 'T', 8, 8);
    expect(validateLevel({ ...lvl, surviveTurns: 12 }).ok).toBe(true);
    expect(validateLevel({ ...lvl, surviveTurns: 0 }).ok).toBe(false);
    expect(validateLevel({ ...lvl, surviveTurns: 2.5 }).ok).toBe(false);
    expect(validateLevel({ ...lvl, surviveTurns: -3 }).ok).toBe(false);
  });

  it('timeControl: integer initialSeconds >= 1 and incrementSeconds >= 0 when present', () => {
    const lvl = createBlankLevel('l1', 'T', 8, 8);
    expect(validateLevel({ ...lvl, timeControl: { initialSeconds: 300, incrementSeconds: 2 } }).ok).toBe(true);
    expect(validateLevel({ ...lvl, timeControl: { initialSeconds: 300, incrementSeconds: 0 } }).ok).toBe(true);
    expect(validateLevel({ ...lvl, timeControl: { initialSeconds: 0, incrementSeconds: 2 } }).ok).toBe(false);
    expect(validateLevel({ ...lvl, timeControl: { initialSeconds: 2.5, incrementSeconds: 0 } }).ok).toBe(false);
    expect(validateLevel({ ...lvl, timeControl: { initialSeconds: 300, incrementSeconds: -1 } }).ok).toBe(false);
    expect(validateLevel({ ...lvl, timeControl: { initialSeconds: 300 } as never }).ok).toBe(false);
    expect(validateLevel({ ...lvl, timeControl: 'blitz' as never }).ok).toBe(false);
    expect(validateLevel({ ...lvl, timeControl: null as never }).ok).toBe(false);
  });

  it('zones: well-formed entries pass; bad id/type/tiles shapes fail', () => {
    const lvl = createBlankLevel('l1', 'T', 8, 8);
    lvl.layers.zones = [{ id: 'z1', type: 'player-spawn', tiles: [[0, 7], [1, 7]] }];
    expect(validateLevel(lvl).ok).toBe(true);

    const withZones = (zones: unknown) => {
      const l = createBlankLevel('l1', 'T', 8, 8);
      (l.layers as { zones: unknown }).zones = zones;
      return validateLevel(l).ok;
    };
    expect(withZones([{ id: 5, type: 'player-spawn', tiles: [] }])).toBe(false); // non-string id
    expect(withZones([{ id: 'z', type: 'lava-pit', tiles: [] }])).toBe(false); // unknown type
    expect(withZones([{ id: 'z', type: 'objective' }])).toBe(false); // missing tiles
    expect(withZones([{ id: 'z', type: 'objective', tiles: [[1]] }])).toBe(false); // not a pair
    expect(withZones([{ id: 'z', type: 'objective', tiles: [[1.5, 2]] }])).toBe(false); // non-integer
  });

  it('zones: rejects an out-of-bounds tile (spawn pools deal pieces from these directly)', () => {
    const lvl = createBlankLevel('l1', 'T', 8, 8);
    lvl.layers.zones = [{ id: 'z1', type: 'enemy-spawn', tiles: [[0, 0], [8, 0]] }]; // x=8 is off an 8-wide board
    expect(validateLevel(lvl).ok).toBe(false);
  });
});

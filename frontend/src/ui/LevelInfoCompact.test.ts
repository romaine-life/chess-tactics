import { describe, it, expect } from 'vitest';
import { kingSideForLevel, levelObjectiveLine } from './LevelInfoCompact';
import { createBlankLevel, type Level } from '../core/level';
import { MODE_NAME } from '../core/objectives';
import type { PieceType, Side } from '../core/types';

// These are the shared, no-React helpers the level-select surfaces (Campaign / CampaignEditor)
// import so the mode label + direction-aware goal copy has ONE implementation (ADR-0050).
// Importing the .tsx module is safe under the node test env: we only call the pure functions,
// never render the component.

function unit(x: number, y: number, type: PieceType, side: Side) {
  return { x, y, type, side };
}

/** A fixed-placement level whose authored units the test controls. */
function fixedLevel(units: Array<ReturnType<typeof unit>>, mutate?: (l: Level) => void): Level {
  const level = createBlankLevel('l', 'L', 6, 6);
  level.layers.units = units;
  mutate?.(level);
  return level;
}

describe('kingSideForLevel — which side owns the King, read off the level content', () => {
  it('fixed: player when only the player fields a King', () => {
    const level = fixedLevel([unit(0, 5, 'king', 'player'), unit(5, 0, 'pawn', 'enemy')]);
    expect(kingSideForLevel(level)).toBe('player');
  });

  it('fixed: enemy when only the enemy fields a King (the classic direction)', () => {
    const level = fixedLevel([unit(0, 5, 'pawn', 'player'), unit(5, 0, 'king', 'enemy')]);
    expect(kingSideForLevel(level)).toBe('enemy');
  });

  it('fixed: enemy when BOTH sides field a King (rival-kings territory)', () => {
    const level = fixedLevel([unit(0, 5, 'king', 'player'), unit(5, 0, 'king', 'enemy')]);
    expect(kingSideForLevel(level)).toBe('enemy');
  });

  it('fixed: enemy when NEITHER side fields a King (free-skirmish default)', () => {
    const level = fixedLevel([unit(0, 5, 'pawn', 'player'), unit(5, 0, 'pawn', 'enemy')]);
    expect(kingSideForLevel(level)).toBe('enemy');
  });

  it('setup spawns: reads event rosters, not the empty authored units', () => {
    const player = fixedLevel([], (l) => {
      l.events = [
        { trigger: { kind: 'setup' }, do: [{ kind: 'spawn', side: 'player', roster: { king: 1, pawn: 2 }, zoneIds: ['p'] }] },
        { trigger: { kind: 'setup' }, do: [{ kind: 'spawn', side: 'enemy', roster: { pawn: 3 }, zoneIds: ['e'] }] },
      ];
    });
    expect(kingSideForLevel(player)).toBe('player');

    const enemy = fixedLevel([], (l) => {
      l.events = [
        { trigger: { kind: 'setup' }, do: [{ kind: 'spawn', side: 'player', roster: { pawn: 2 }, zoneIds: ['p'] }] },
        { trigger: { kind: 'setup' }, do: [{ kind: 'spawn', side: 'enemy', roster: { king: 1 }, zoneIds: ['e'] }] },
      ];
    });
    expect(kingSideForLevel(enemy)).toBe('enemy');

    const both = fixedLevel([], (l) => {
      l.events = [
        { trigger: { kind: 'setup' }, do: [{ kind: 'spawn', side: 'player', roster: { king: 1 }, zoneIds: ['p'] }] },
        { trigger: { kind: 'setup' }, do: [{ kind: 'spawn', side: 'enemy', roster: { king: 1 }, zoneIds: ['e'] }] },
      ];
    });
    expect(kingSideForLevel(both)).toBe('enemy');
  });
});

describe('levelObjectiveLine — mode name + seat-relative rule briefing', () => {
  it('mirrors King Assault for the attacker and King-holder seats', () => {
    const level = fixedLevel([unit(0, 5, 'pawn', 'player'), unit(5, 0, 'king', 'enemy')], (l) => {
      l.objective = 'capture-king';
    });
    expect(levelObjectiveLine(level, 'player')).toBe(`${MODE_NAME['capture-king']} — Capture the opposing King; protect your force`);
    expect(levelObjectiveLine(level, 'enemy')).toBe(`${MODE_NAME['capture-king']} — Eliminate the opposing force; protect your King`);
  });

  it('mirrors a player-held King Assault too', () => {
    const level = fixedLevel([unit(0, 5, 'king', 'player'), unit(5, 0, 'pawn', 'enemy')], (l) => {
      l.objective = 'capture-king';
    });
    expect(levelObjectiveLine(level, 'player')).toBe(`${MODE_NAME['capture-king']} — Eliminate the opposing force; protect your King`);
    expect(levelObjectiveLine(level, 'enemy')).toBe(`${MODE_NAME['capture-king']} — Capture the opposing King; protect your force`);
  });

  it('Rival Kings surfaces its own name + summary', () => {
    const level = fixedLevel([unit(0, 5, 'king', 'player'), unit(5, 0, 'king', 'enemy')], (l) => {
      l.objective = 'rival-kings';
    });
    expect(levelObjectiveLine(level)).toBe('Rival Kings — Capture the opposing King; protect your King');
  });

  it('non-King modes expose both the win path and the danger', () => {
    const level = fixedLevel([unit(0, 5, 'pawn', 'player'), unit(5, 0, 'pawn', 'enemy')], (l) => {
      l.objective = 'capture-all';
    });
    expect(levelObjectiveLine(level)).toBe('Last Man Standing — Eliminate the opposing force; protect your force');
  });
});

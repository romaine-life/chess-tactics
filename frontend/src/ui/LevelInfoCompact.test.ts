import { describe, it, expect } from 'vitest';
import {
  kingSideForLevel,
  levelBattleDealLine,
  levelObjectiveLine,
  levelShowsTerrainTypeCounts,
} from './LevelInfoCompact';
import {
  createBlankLevel,
  LEVEL_BATTLE_CARDS_DEALT_MAX,
  LEVEL_BATTLE_CARDS_DEALT_MIN,
  type Level,
} from '../core/level';
import { MODE_NAME } from '../core/objectives';
import type { PieceType, Side } from '../core/types';
import { encodeBoard } from './boardCode';
import { levelToEditorBoard } from '../core/levelBoard';

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

describe('levelBattleDealLine — how many cards a Battle deals, in the readout', () => {
  const battle = (battleSettings: unknown): Level => (
    { ...fixedLevel([]), battle: battleSettings } as unknown as Level
  );

  it('says nothing at all for a level that is not a Battle', () => {
    expect(levelBattleDealLine(fixedLevel([]))).toBeNull();
  });

  it('names the count and where the rest of the hand comes from', () => {
    expect(levelBattleDealLine(battle({ loot: false, cardsDealt: 3 })))
      .toBe('3 dealt at Deployment  ·  His Grace + 2 from the player’s collection');
  });

  it('reads a deal of one as the King going in alone', () => {
    expect(levelBattleDealLine(battle({ cardsDealt: LEVEL_BATTLE_CARDS_DEALT_MIN })))
      .toBe('1 dealt at Deployment  ·  His Grace alone');
  });

  it('reports an unfinished Battle instead of dropping the row', () => {
    const unset = `Not set — needs a deal from ${LEVEL_BATTLE_CARDS_DEALT_MIN} to ${LEVEL_BATTLE_CARDS_DEALT_MAX} cards`;
    // A Battle that carries a Loot flag and no count is the shape that predates the requirement.
    expect(levelBattleDealLine(battle({ loot: true }))).toBe(unset);
    expect(levelBattleDealLine(battle({ cardsDealt: 0 }))).toBe(unset);
    expect(levelBattleDealLine(battle({ cardsDealt: LEVEL_BATTLE_CARDS_DEALT_MAX + 1 }))).toBe(unset);
    expect(levelBattleDealLine(battle({ cardsDealt: 3.5 }))).toBe(unset);
    expect(levelBattleDealLine(battle({ cardsDealt: '3' }))).toBe(unset);
  });
});

describe('levelShowsTerrainTypeCounts', () => {
  it('keeps type counts for levels rendered from individual tiles', () => {
    expect(levelShowsTerrainTypeCounts(fixedLevel([]))).toBe(true);
  });

  it('hides logical terrain types when AI artwork owns the whole environment', () => {
    const level = fixedLevel([]);
    level.boardCode = encodeBoard({
      ...levelToEditorBoard(level),
      backgroundMode: 'ai',
    });

    expect(levelShowsTerrainTypeCounts(level)).toBe(false);
  });
});

import { describe, expect, it } from 'vitest';
import {
  declaredFactionsFromLevelUnits,
  editorBoardToLevel,
  levelToEditorBoard,
} from './levelBoard';
import { resolveDeclaredFactions } from './pieces';
import type { Level, LevelUnit } from './level';

// ADR-0546. A Level stores which SIDE each piece plays on; a board code stores only the COLOUR it
// wears. Opening a level used to read the colour and throw the side away, so `resolveDeclaredFactions`
// fell back to "the first painted palette is the player" — and on a board painted in one colour that
// names the OPPOSITION as the player. The next save then re-derived every side from that guess and
// wrote the inversion into the level.

const meta = {
  id: 'l-test',
  name: 'Test',
  objective: 'capture-all' as const,
  difficulty: 'normal' as const,
};

const level = (units: LevelUnit[], over: Partial<Level> = {}): Level => ({
  id: meta.id,
  name: meta.name,
  board: { cols: 5, rows: 5, heightLevels: 1 },
  objective: meta.objective,
  difficulty: meta.difficulty,
  layers: { terrain: [], units, props: [], zones: [], decals: [] },
  ...over,
} as Level);

const enemyPawn = (x: number, palette?: string): LevelUnit =>
  ({ x, y: 0, type: 'pawn', side: 'enemy', facing: 'south', ...(palette ? { palette } : {}) } as LevelUnit);
const playerPawn = (x: number, palette?: string): LevelUnit =>
  ({ x, y: 4, type: 'pawn', side: 'player', facing: 'north', ...(palette ? { palette } : {}) } as LevelUnit);

/** Open the level in the editor and save it straight back, touching nothing. */
const reopen = (source: Level): Level => editorBoardToLevel(levelToEditorBoard(source), meta);

/**
 * Open the level, then author exactly the pair the Factions panel is showing.
 *
 * This is the move that broke `Boxed in`: the panel displays the RESOLVED pair whether or not the
 * board declared one, and every declaration edit writes both halves (ADR-0538), so accepting what
 * is on screen persists it. That must be a no-op on which side each piece plays for.
 */
const authorWhatThePanelShows = (source: Level): Level => {
  const board = levelToEditorBoard(source);
  const shown = resolveDeclaredFactions(board);
  return editorBoardToLevel({ ...board, playerFaction: shown.player, enemyFaction: shown.enemy }, meta);
};

describe('a level keeps its sides through the editor', () => {
  it('does not offer the player an army the level fields as the enemy', () => {
    // The reported board: five black pieces, all the opposition's, no declaration of any kind.
    // "The first painted palette is the player" named black, and black was every piece there was.
    const boxedIn = level([0, 1, 2, 3, 4].map((x) => enemyPawn(x, 'black')));
    expect(resolveDeclaredFactions(levelToEditorBoard(boxedIn)))
      .toEqual({ player: 'white', enemy: 'black' });
    expect(authorWhatThePanelShows(boxedIn).layers.units.every((unit: LevelUnit) => unit.side === 'enemy')).toBe(true);
  });

  it('reads the side off the level rather than off the paint', () => {
    const board = levelToEditorBoard(level([enemyPawn(0, 'black'), enemyPawn(1, 'black')]));
    expect(board.enemyFaction).toBe('black');
    expect(board.playerFaction).toBeUndefined();
  });

  it('keeps a single-colour PLAYER army the player’s', () => {
    // The other direction, and it needed no authoring at all to go wrong: with the declaration
    // unrecovered, a plain reopen re-derived every side as the enemy's.
    const mine = level([playerPawn(0, 'black'), playerPawn(1, 'black')]);
    expect(reopen(mine).layers.units.every((unit: LevelUnit) => unit.side === 'player')).toBe(true);
    expect(levelToEditorBoard(mine).playerFaction).toBe('black');
  });

  it('leaves a level alone that is simply reopened', () => {
    const boxedIn = level([0, 1, 2, 3, 4].map((x) => enemyPawn(x, 'black')));
    expect(reopen(boxedIn).layers.units.every((unit: LevelUnit) => unit.side === 'enemy')).toBe(true);
  });

  it('survives a level painted in one colour on both sides', () => {
    const twoSided = level([enemyPawn(0, 'black'), playerPawn(1, 'white')]);
    const reopened = reopen(twoSided);
    expect(reopened.layers.units.find((unit: LevelUnit) => unit.y === 0)?.side).toBe('enemy');
    expect(reopened.layers.units.find((unit: LevelUnit) => unit.y === 4)?.side).toBe('player');
  });

  it('is a fixed point, so reopening never drifts', () => {
    // The recovered half is written into the board code by the save above and read from there next
    // time, which is what stops it being re-derived differently on every load.
    const once = reopen(level([0, 1, 2].map((x) => enemyPawn(x, 'black'))));
    expect(reopen(once)).toEqual(once);
    expect(reopen(reopen(once))).toEqual(once);
  });

  it('leaves an authored declaration alone', () => {
    const authored = level([enemyPawn(0, 'black')], {
      boardCode: editorBoardToLevel(
        { ...levelToEditorBoard(level([playerPawn(0, 'black')])), playerFaction: 'black', enemyFaction: 'white' },
        meta,
      ).boardCode,
    });
    expect(levelToEditorBoard(authored).playerFaction).toBe('black');
    expect(levelToEditorBoard(authored).enemyFaction).toBe('white');
  });
});

describe('declaredFactionsFromLevelUnits', () => {
  it('names each role by the colour its own side wears', () => {
    expect(declaredFactionsFromLevelUnits([playerPawn(0, 'emerald'), enemyPawn(1, 'golden')]))
      .toEqual({ playerFaction: 'emerald', enemyFaction: 'golden' });
  });

  it('leaves a side unnamed when nothing is fielded for it', () => {
    expect(declaredFactionsFromLevelUnits([enemyPawn(0, 'black')]))
      .toEqual({ playerFaction: undefined, enemyFaction: 'black' });
  });

  it('gives a pre-palette level the colour its side always wore', () => {
    // Units with no palette of their own: the projection paints them by side, so the declaration
    // has to agree with what the board will show.
    expect(declaredFactionsFromLevelUnits([playerPawn(0), enemyPawn(1)]))
      .toEqual({ playerFaction: 'navy-blue', enemyFaction: 'crimson' });
  });

  it('refuses a colour both sides wear, because it names neither', () => {
    expect(declaredFactionsFromLevelUnits([playerPawn(0, 'black'), enemyPawn(1, 'black')]))
      .toEqual({ playerFaction: undefined, enemyFaction: undefined });
  });
});

describe('resolution never reads the opposition as the player', () => {
  it('keeps a declared enemy half out of the player fallback', () => {
    expect(resolveDeclaredFactions({
      enemyFaction: 'black',
      units: { '0,0': { faction: 'black' } },
    })).toEqual({ player: 'white', enemy: 'black' });
  });

  it('steps off the default pairing when the enemy already holds it', () => {
    expect(resolveDeclaredFactions({ enemyFaction: 'white' })).toEqual({ player: 'black', enemy: 'white' });
  });

  it('still reads an undeclared board off its paint', () => {
    expect(resolveDeclaredFactions({
      units: { '0,0': { faction: 'navy-blue' }, '1,0': { faction: 'crimson' } },
    })).toEqual({ player: 'navy-blue', enemy: 'crimson' });
  });
});

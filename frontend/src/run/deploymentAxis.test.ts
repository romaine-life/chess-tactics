import { describe, expect, it } from 'vitest';
import { createBlankLevel, type Level } from '../core/level';
import { createRun, prepareDeployment, type RunWarSnapshot } from './model';
import {
  arrangedCardPlacementOptions,
  arrangedDeploymentCards,
  beginDeploymentDeal,
  completeDeploymentDeal,
  resolveForcedDeploymentChoices,
  deploymentFormationEntryDelta,
  deploymentOptions,
  levelWithRunDeployment,
  playerDeploymentCells,
  playerDeploymentLaneRows,
  runDeploymentAxis,
  runDeploymentFacing,
  selectedDeploymentLayout,
} from './deployment';

/** The compact wire the Level Editor saves. Only the two authored orientation fields matter
 * here, and writing them directly is what pins the contract the Run reads them through. */
const boardCodeWith = (wire: Record<string, unknown>): string =>
  Buffer.from(JSON.stringify(wire), 'utf8').toString('base64')
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

/** A board fought south-to-north: enemy on the top rank, band across the bottom rows. */
function northwardLevel(): Level {
  const level = createBlankLevel('northward', 'Northward', 6, 8);
  level.layers.zones = [{
    id: 'run-player-deploy',
    type: 'player-spawn',
    tiles: [6, 7].flatMap((y) => Array.from({ length: 6 }, (_, x) => [x, y] as [number, number])),
  }];
  level.layers.units = [
    { x: 2, y: 0, type: 'king', side: 'enemy', facing: 'south' },
    { x: 4, y: 0, type: 'rook', side: 'enemy', facing: 'south' },
  ];
  return level;
}

/** The same battle turned on its side: enemy on the east file, band down the west columns. */
function eastwardLevel(): Level {
  const level = createBlankLevel('eastward', 'Eastward', 8, 6);
  level.layers.zones = [{
    id: 'run-player-deploy',
    type: 'player-spawn',
    tiles: [0, 1].flatMap((x) => Array.from({ length: 6 }, (_, y) => [x, y] as [number, number])),
  }];
  level.layers.units = [
    { x: 7, y: 2, type: 'king', side: 'enemy', facing: 'west' },
    { x: 7, y: 4, type: 'rook', side: 'enemy', facing: 'west' },
  ];
  return level;
}

describe('run deployment axis', () => {
  it('keeps a northward board on the historical axis', () => {
    const level = northwardLevel();
    expect(runDeploymentAxis(level)).toEqual({ forward: { x: 0, y: -1 }, across: { x: 1, y: 0 } });
    expect(runDeploymentFacing(level)).toBe('north');
  });

  it('reads the axis of a board fought west to east from its authored orientation', () => {
    const level = eastwardLevel();
    expect(runDeploymentAxis(level)).toEqual({ forward: { x: 1, y: 0 }, across: { x: 0, y: 1 } });
    expect(runDeploymentFacing(level)).toBe('east');
  });

  it("prefers the Board tab's faction control over the pieces' own facings", () => {
    const level = eastwardLevel();
    // Every unit still faces west/east, but the level declares the player advances south.
    level.boardCode = boardCodeWith({ c: 8, r: 6, pf: 'navy-blue', fd: { 'navy-blue': 'south' } });
    expect(runDeploymentAxis(level).forward).toEqual({ x: 0, y: 1 });
    expect(runDeploymentFacing(level)).toBe('south');
  });

  it('orders lanes front-first on both axes', () => {
    // Front is the lane nearest the enemy: the lowest row northward, the highest file eastward.
    const north = playerDeploymentLaneRows(northwardLevel());
    expect(north).toHaveLength(2);
    const northCells = playerDeploymentCells(northwardLevel());
    expect(northCells.every((cell) => cell.y === 6 || cell.y === 7)).toBe(true);

    const east = playerDeploymentLaneRows(eastwardLevel());
    expect(east).toEqual([1, 0]);
    const eastCells = playerDeploymentCells(eastwardLevel());
    expect(eastCells).toHaveLength(12);
    expect(eastCells.every((cell) => cell.x === 0 || cell.x === 1)).toBe(true);
  });

  it('sends a formation in past the far end of the band it belongs to', () => {
    // Northward: one board width to the right, unchanged. Eastward: one board height down.
    expect(deploymentFormationEntryDelta(northwardLevel(), [{ x: 1, y: 6 }, { x: 2, y: 6 }]))
      .toEqual({ x: 5, y: 0 });
    expect(deploymentFormationEntryDelta(eastwardLevel(), [{ x: 0, y: 1 }, { x: 0, y: 2 }]))
      .toEqual({ x: 0, y: 5 });
  });

  it('offers formation placements inside a band standing on its side', () => {
    // The band enumeration is what a tall band used to fall out of: anchors were swept as
    // lane-rows by board columns, so a two-column band produced no legal anchor at all.
    for (const level of [northwardLevel(), eastwardLevel()]) {
      const war: RunWarSnapshot = {
        id: 'axis-war',
        name: 'Axis War',
        description: 'Deployment axis fixture.',
        battles: [{ level, loot: false }, { level: structuredClone(level), loot: false }],
      };
      const run = resolveForcedDeploymentChoices(prepareDeployment(createRun(war, 11)), level);
      const dealt = completeDeploymentDeal(beginDeploymentDeal(run), level);
      const band = new Set(playerDeploymentCells(level).map((cell) => `${cell.x},${cell.y}`));
      const cards = arrangedDeploymentCards(dealt).filter((summary) => summary.admitted);
      expect(cards.length).toBeGreaterThan(0);

      for (const summary of cards) {
        const options = ([0, 1, 2, 3] as const)
          .flatMap((rotation) => arrangedCardPlacementOptions(dealt, level, summary.card.id, rotation));
        expect(options.length).toBeGreaterThan(0);
        for (const option of options) {
          for (const cell of Object.values(option.placements)) {
            expect(band.has(`${cell.x},${cell.y}`)).toBe(true);
          }
        }
      }
    }
  });

  it('turns a deployed Run army to face the way its side advances', () => {
    const level = eastwardLevel();
    const war: RunWarSnapshot = {
      id: 'facing-war',
      name: 'Facing War',
      description: 'Deployment facing fixture.',
      battles: [{ level, loot: false }, { level: structuredClone(level), loot: false }],
    };
    const run = resolveForcedDeploymentChoices(prepareDeployment(createRun(war, 11)), level);
    const king = run.army.find((unit) => unit.type === 'king')!;
    const layout = {
      ...selectedDeploymentLayout(run, deploymentOptions(run, level)),
      placements: { [king.id]: { x: 1, y: 3 } },
    };
    const deployed = levelWithRunDeployment(run, level, layout).layers.units
      .filter((unit) => unit.side === 'player');

    expect(deployed).toHaveLength(1);
    expect(deployed[0].facing).toBe('east');
    // Northward levels keep the facing every existing Battle deploys with.
    expect(runDeploymentFacing(northwardLevel())).toBe('north');
  });
});

import { describe, expect, it } from 'vitest';
import { TILE_STEP_Y } from '../art/projectionContract';
import { gameplayTerrainForFamily } from '../core/tileSockets';
import type { RunArmyUnit } from '../run/model';
import {
  RUN_UNIT_INSPECTION_CAMERA,
  runUnitInspectionPlan,
} from './RunUnitInspectionScene';
import { studioFamilies } from './studioBoard';

const unit = (inspectionSeed: number): RunArmyUnit => ({
  id: `unit-${inspectionSeed}`,
  name: `Seed ${inspectionSeed}`,
  type: 'pawn',
  number: inspectionSeed + 1,
  inspectionSeed,
  abilities: [],
  source: 'starting',
});

function familyForTile(tileId: string): string {
  const family = studioFamilies.find((candidate) => (
    candidate.assets.some((asset) => asset.id === tileId)
  ));
  if (!family) throw new Error(`missing test terrain family for ${tileId}`);
  return family.id;
}

describe('Run unit inspection scene', () => {
  it('centres the visible one-tile composition from canonical projection geometry', () => {
    expect(RUN_UNIT_INSPECTION_CAMERA.pan).toEqual({
      x: 0,
      y: TILE_STEP_Y * RUN_UNIT_INSPECTION_CAMERA.zoom,
    });
  });

  it('draws the real unit on one stable walkable tile with seeded optional grass', () => {
    const first = runUnitInspectionPlan(unit(41));
    const second = runUnitInspectionPlan(unit(41));

    expect(second).toEqual(first);
    expect(first.board.cells).toEqual({ '0,0': first.tileId });
    expect(first.board.units).toEqual({
      '0,0': { unitId: 'pawn', direction: 'south', faction: 'navy-blue' },
    });
    expect(['water', 'cliff', 'void']).not.toContain(
      gameplayTerrainForFamily(familyForTile(first.tileId)),
    );
    expect(first.board.cover['0,0'] ?? null).toBe(first.coverDensity);
    if (first.coverDensity) expect(first.board.coverTypes).toEqual({ '0,0': 'grass' });
  });

  it('uses the persisted acquisition seed to vary terrain and grass plans', () => {
    const plans = Array.from({ length: 48 }, (_, inspectionSeed) => (
      runUnitInspectionPlan(unit(inspectionSeed))
    ));

    expect(new Set(plans.map((plan) => plan.tileId)).size).toBeGreaterThan(1);
    expect(new Set(plans.map((plan) => plan.coverDensity ?? 'none')).size).toBeGreaterThan(1);
  });
});

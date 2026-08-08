import { useMemo, type ReactElement } from 'react';
import { TILE_STEP_Y } from '../art/projectionContract';
import { tileAssets } from '../art/tileset';
import { paletteForSide } from '../core/pieces';
import { createRng } from '../core/rng';
import {
  familyForGameplayTerrain,
  gameplayTerrainForFamily,
} from '../core/tileSockets';
import { StudioReadOnlyBoard } from '../render/StudioReadOnlyBoard';
import { mixSeed, type RunArmyUnit } from '../run/model';
import type { EditorBoard } from './boardCode';
import { InnerChromeBox } from './shared/ChromeBox';

export const RUN_UNIT_INSPECTION_CAMERA = {
  zoom: 3.5,
  // TileGrid centres the complete 180px sprite frame, including its transparent
  // relief headroom. A one-cell portrait composition's visible tile and standing
  // unit are centred one canonical isometric half-step above that frame centre.
  pan: { x: 0, y: TILE_STEP_Y * 3.5 },
} as const;
// Read per plan, not once at import: the player's color is a setting, and a value frozen into a
// module constant would keep the old set on every profile until a reload.
const playerProfileFaction = (): string => paletteForSide('player');
const PLAYER_PROFILE_FACING = 'south' as const;

export interface RunUnitInspectionPlan {
  board: EditorBoard;
  coverSeed: number;
  tileId: string;
  coverDensity: 'sparse' | 'filled' | null;
}

/**
 * Turns the seed persisted with a Run unit into one canonical one-cell board.
 * The live catalogs still own the pixels; the Run owns only the stable random
 * choice that was assigned when the unit entered the army.
 */
export function runUnitInspectionPlan(unit: RunArmyUnit): RunUnitInspectionPlan {
  const eligibleTiles = [...tileAssets]
    .filter((asset) => {
      const family = asset.terrains?.[0];
      if (!family) return false;
      const terrain = gameplayTerrainForFamily(family);
      return terrain !== 'water' && terrain !== 'cliff' && terrain !== 'void';
    })
    .sort((left, right) => left.id.localeCompare(right.id));
  if (!eligibleTiles.length) {
    throw new Error('Run unit inspection requires at least one installed walkable terrain surface.');
  }

  const rng = createRng(unit.inspectionSeed);
  const tile = eligibleTiles[rng.int(eligibleTiles.length)];
  const coverRoll = rng.int(3);
  const coverDensity = coverRoll === 0 ? null : coverRoll === 1 ? 'sparse' : 'filled';
  const grassFamily = coverDensity ? familyForGameplayTerrain('grass') : undefined;
  if (coverDensity && !grassFamily) {
    throw new Error('Run unit inspection requires an installed grass ground-cover family.');
  }

  const board: EditorBoard = {
    cols: 1,
    rows: 1,
    cells: { '0,0': tile.id },
    units: {
      '0,0': {
        unitId: unit.type,
        direction: PLAYER_PROFILE_FACING,
        faction: playerProfileFaction(),
      },
    },
    doodads: {},
    props: {},
    cover: coverDensity ? { '0,0': coverDensity } : {},
    coverTypes: coverDensity && grassFamily ? { '0,0': grassFamily } : {},
    features: {},
    featureCuts: {},
    featureExits: {},
  };
  return {
    board,
    coverSeed: mixSeed(unit.inspectionSeed, 'run-unit-inspection-cover'),
    tileId: tile.id,
    coverDensity,
  };
}

export function RunUnitInspectionScene({ unit }: { unit: RunArmyUnit }): ReactElement {
  const plan = useMemo(
    () => runUnitInspectionPlan(unit),
    [unit.inspectionSeed, unit.type],
  );
  return (
    <InnerChromeBox className="run-army-profile-scene">
      <div className="run-army-profile-scene-viewport">
        <StudioReadOnlyBoard
          board={plan.board}
          boardZoom={RUN_UNIT_INSPECTION_CAMERA.zoom}
          boardPan={RUN_UNIT_INSPECTION_CAMERA.pan}
          coverSeed={plan.coverSeed}
          className="run-army-profile-board"
          ariaLabel={`${unit.name} standing on their inspection tile`}
        />
      </div>
    </InnerChromeBox>
  );
}

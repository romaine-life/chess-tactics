import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  applyLiveMediaCatalog,
  resetLiveMediaCatalog,
} from '@chess-tactics/board-render';
import { TILE_STEP_Y } from '../art/projectionContract';
import { propDef, resetPropSeats } from '../core/props';
import { gameplayTerrainForFamily } from '../core/tileSockets';
import { PIECE_BUNDLE_DECK, type PieceBundle } from '../run/model';
import { applyTestPropSeats } from '../test/livePropSeats';
import { testGroundCoverCatalog, testStructureMediaSlots } from '../test/liveMediaCatalog';
import {
  RUN_CARD_SCENE_CAMERA,
  RUN_CARD_SCENE_COLS,
  RUN_CARD_SCENE_ROWS,
  runCardScenePlan,
} from './RunCardScene';
import { studioFamilies } from './studioBoard';

beforeAll(() => {
  applyLiveMediaCatalog(testGroundCoverCatalog(testStructureMediaSlots()));
  applyTestPropSeats();
});
afterAll(() => {
  resetPropSeats();
  resetLiveMediaCatalog();
});

const bundle = (id: string, pieces: PieceBundle['pieces']): Pick<PieceBundle, 'id' | 'pieces'> => ({
  id,
  pieces,
});

function familyForTile(tileId: string): string {
  const family = studioFamilies.find((candidate) => (
    candidate.assets.some((asset) => asset.id === tileId)
  ));
  if (!family) throw new Error(`missing test terrain family for ${tileId}`);
  return family.id;
}

describe('Run card scene', () => {
  it('centres the vignette from canonical projection geometry', () => {
    expect(RUN_CARD_SCENE_CAMERA.pan).toEqual({
      x: 0,
      y: TILE_STEP_Y * RUN_CARD_SCENE_CAMERA.zoom,
    });
  });

  it('derives one stable scene per bundle id', () => {
    const first = runCardScenePlan(bundle('ppb', ['pawn', 'pawn', 'bishop']));
    const second = runCardScenePlan(bundle('ppb', ['pawn', 'pawn', 'bishop']));
    expect(second).toEqual(first);
    expect(first.sceneId).toBe('ppb');
  });

  it('musters every bundle piece exactly once, hero piece at the centre seat', () => {
    const plan = runCardScenePlan(bundle('ppr', ['pawn', 'pawn', 'rook']));
    const placed = Object.values(plan.board.units).map((unit) => unit.unitId).sort();
    expect(placed).toEqual(['pawn', 'pawn', 'rook']);
    expect(plan.board.units['1,1'].unitId).toBe('rook');
    for (const unit of Object.values(plan.board.units)) {
      expect(unit.direction).toBe('south');
      expect(unit.faction).toBe('navy-blue');
    }
  });

  it('fills a complete walkable field and keeps props clear of the formation', () => {
    for (const deckBundle of PIECE_BUNDLE_DECK) {
      const plan = runCardScenePlan(deckBundle);
      expect(Object.keys(plan.board.cells)).toHaveLength(RUN_CARD_SCENE_COLS * RUN_CARD_SCENE_ROWS);
      for (const tileId of Object.values(plan.board.cells)) {
        expect(['water', 'cliff', 'void']).not.toContain(
          gameplayTerrainForFamily(familyForTile(tileId)),
        );
        expect(familyForTile(tileId)).toBe(plan.familyId);
      }
      const unitCells = new Set(Object.keys(plan.board.units));
      for (const [anchor, placed] of Object.entries(plan.board.props)) {
        const def = propDef(placed.propId);
        expect(def, `${deckBundle.id} placed unknown prop ${placed.propId}`).toBeDefined();
        const [x, y] = anchor.split(',').map(Number);
        for (let dx = 0; dx < def!.w; dx += 1) {
          for (let dy = 0; dy < def!.h; dy += 1) {
            const key = `${x + dx},${y + dy}`;
            expect(unitCells.has(key), `${deckBundle.id} prop overlaps unit at ${key}`).toBe(false);
          }
        }
      }
    }
  });

  it('varies terrain, cover, and props across the deck while staying deterministic', () => {
    const plans = PIECE_BUNDLE_DECK.map((deckBundle) => runCardScenePlan(deckBundle));
    expect(new Set(plans.map((plan) => plan.familyId)).size).toBeGreaterThan(1);
    expect(plans.some((plan) => Object.keys(plan.board.cover).length > 0)).toBe(true);
    expect(plans.some((plan) => Object.keys(plan.board.props).length > 0)).toBe(true);
  });

  it('resolves any carrier of one composition to the same canonical scene', () => {
    const plan = runCardScenePlan(bundle('review-pawn-rook', ['pawn', 'rook']));
    expect(Object.values(plan.board.units).map((unit) => unit.unitId).sort()).toEqual(['pawn', 'rook']);
    expect(plan.sceneId).toBe('pr');
    const draftOrder = runCardScenePlan(bundle('knight-bishop', ['knight', 'bishop']));
    const deckOrder = runCardScenePlan(bundle('kb', ['knight', 'bishop']));
    expect(draftOrder).toEqual(deckOrder);
    expect(draftOrder.sceneId).toBe('kb');
  });
});

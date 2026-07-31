import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  applyLiveMediaCatalog,
  resetLiveMediaCatalog,
} from '@chess-tactics/board-render';
import { TILE_STEP_Y } from '../art/projectionContract';
import { propDef, resetPropSeats } from '../core/props';
import { gameplayTerrainForFamily } from '../core/tileSockets';
import { applyLiveCardScenes, resetLiveCardScenes } from '../run/cardSceneOverrides';
import { PIECE_BUNDLE_DECK, type PieceBundle } from '../run/model';
import { applyTestPropSeats } from '../test/livePropSeats';
import { testGroundCoverCatalog, testStructureMediaSlots } from '../test/liveMediaCatalog';
import {
  cardSceneCameraForView,
  cardSceneFrameHeight,
  defaultCardSceneFrame,
  RUN_CARD_SCENE_CAPTURE,
  RUN_CARD_SCENE_COLS,
  RUN_CARD_SCENE_ROWS,
  runCardScenePlan,
} from './RunCardScene';
import { encodeBoard } from './boardCode';
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
  it('maps the default viewing pane through the frame camera exactly as before', () => {
    const frame = defaultCardSceneFrame();
    // The default pane centres the massing one half-step above the board centre at the
    // original capture framing.
    expect(frame.x).toBe(0);
    expect(frame.y).toBe(TILE_STEP_Y);
    const camera = cardSceneCameraForView(frame, RUN_CARD_SCENE_CAPTURE.width, RUN_CARD_SCENE_CAPTURE.height);
    expect(camera.zoom).toBeCloseTo(1.9, 5);
    expect(camera.pan.x).toBeCloseTo(0, 5);
    expect(camera.pan.y).toBeCloseTo(TILE_STEP_Y * 1.9, 5);
    // Cover-fit: a tall window zooms by height instead.
    const tall = cardSceneCameraForView(frame, 200, 300);
    expect(tall.zoom).toBeCloseTo(300 / cardSceneFrameHeight(frame), 5);
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
      const occupied = new Set(unitCells);
      for (const [anchor, placed] of Object.entries(plan.board.props)) {
        const def = propDef(placed.propId);
        expect(def, `${deckBundle.id} placed unknown prop ${placed.propId}`).toBeDefined();
        const [x, y] = anchor.split(',').map(Number);
        for (let dx = 0; dx < def!.w; dx += 1) {
          for (let dy = 0; dy < def!.h; dy += 1) {
            const key = `${x + dx},${y + dy}`;
            expect(unitCells.has(key), `${deckBundle.id} prop overlaps unit at ${key}`).toBe(false);
            occupied.add(key);
          }
        }
      }
      for (const key of Object.keys(plan.board.doodads)) {
        expect(occupied.has(key), `${deckBundle.id} doodad overlaps occupant at ${key}`).toBe(false);
        occupied.add(key);
      }
      for (const placement of plan.board.floatingArtwork ?? []) {
        // Landmarks are rear-apron scenery: never on the tactical stage, always
        // resolvable in the installed structure-art library.
        expect(placement.id.startsWith('card-landmark-'), `${deckBundle.id} foreign artwork ${placement.id}`).toBe(true);
        expect(placement.scale).toBeGreaterThan(0);
      }
    }
  });

  it('varies terrain, cover, and props across the deck while staying deterministic', () => {
    const plans = PIECE_BUNDLE_DECK.map((deckBundle) => runCardScenePlan(deckBundle));
    expect(new Set(plans.map((plan) => plan.familyId)).size).toBeGreaterThan(1);
    expect(plans.some((plan) => Object.keys(plan.board.cover).length > 0)).toBe(true);
    expect(plans.some((plan) => Object.keys(plan.board.props).length > 0)).toBe(true);
  });

  it('applies the authored board wholesale while units and frame stay derived', () => {
    const generated = runCardScenePlan(bundle('ppb', ['pawn', 'pawn', 'bishop']), null);
    const rerolled = runCardScenePlan(bundle('ppb', ['pawn', 'pawn', 'bishop']), { salt: 3 });
    expect(rerolled.board.cells).not.toEqual(generated.board.cells);
    expect(Object.values(rerolled.board.units).map((unit) => unit.unitId).sort())
      .toEqual(Object.values(generated.board.units).map((unit) => unit.unitId).sort());

    // An authored board (unit-less, as the editor saves it) replaces the scene body;
    // the mustered formation is still derived from the card.
    const authoredSource = { ...generated.board, units: {}, doodads: {}, props: {}, floatingArtwork: [] };
    const authored = runCardScenePlan(bundle('ppb', ['pawn', 'pawn', 'bishop']), {
      board: encodeBoard(authoredSource),
    });
    expect(authored.authored).toBe(true);
    expect(authored.board.doodads).toEqual({});
    expect(authored.board.props).toEqual({});
    expect(authored.board.units).toEqual(generated.board.units);
    expect(authored.board.cells).toEqual(generated.board.cells);
    expect(authored.frame).toEqual(defaultCardSceneFrame());

    const framed = runCardScenePlan(bundle('ppb', ['pawn', 'pawn', 'bishop']), {
      frame: { x: 20, y: 10, width: 180 },
    });
    expect(framed.frame).toEqual({ x: 20, y: 10, width: 180 });
    expect(framed.board.cells).toEqual(generated.board.cells);
  });

  it('reads the hydrated live override document by default', () => {
    const generated = runCardScenePlan(bundle('pr', ['pawn', 'rook']));
    const authoredSource = { ...generated.board, units: {}, doodads: {}, props: {}, floatingArtwork: [] };
    applyLiveCardScenes({
      id: 'default',
      data: {
        overrides: {
          pr: { board: encodeBoard(authoredSource), frame: { x: -10, y: 5, width: 200 } },
        },
      },
      clientSchemaVersion: 1,
      revision: 0,
      createdAt: null,
      updatedAt: null,
      updatedBy: null,
    });
    try {
      const overridden = runCardScenePlan(bundle('pr', ['pawn', 'rook']));
      expect(overridden.authored).toBe(true);
      expect(overridden.board.doodads).toEqual({});
      expect(overridden.frame).toEqual({ x: -10, y: 5, width: 200 });
      expect(overridden.board.units).toEqual(generated.board.units);
    } finally {
      resetLiveCardScenes();
    }
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

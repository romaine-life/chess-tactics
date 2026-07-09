import { afterEach, describe, expect, it } from 'vitest';
import { pieceSpritePath, UNIT_PALETTES } from '../core/pieces';
import {
  applyLiveUnitCatalog,
  productionUnitAssets,
  resetLiveUnitCatalog,
  rookDirections,
  unitAssetById,
  unitAssets,
  type LiveUnitCatalog,
} from './unitCatalog';

afterEach(() => resetLiveUnitCatalog());

describe('unit catalog production subset', () => {
  it('ships only the accepted production unit set', () => {
    expect(unitAssets.length).toBe(6);
    expect(unitAssets.map((unit) => unit.id).sort()).toEqual(['bishop', 'king', 'knight', 'pawn', 'queen', 'rook']);
    expect(productionUnitAssets).toHaveLength(unitAssets.length);
    expect(productionUnitAssets.every((unit) => unit.factionMode === 'palette' && !unit.speculative)).toBe(true);
    expect(unitAssetById('pawn-codexsheet')?.id).toBe('pawn');
    expect(unitAssetById('rook-blender-v4-calibrated')?.id).toBe('rook');
  });

  it('swaps accepted sprite URLs without changing the stable piece id', () => {
    const sprites = Object.fromEntries(UNIT_PALETTES.map((palette) => [
      palette,
      Object.fromEntries(rookDirections.map((direction) => [direction, {
        url: `/api/unit-sprites/${'a'.repeat(64)}.png`,
        sha256: 'a'.repeat(64),
        width: 96,
        height: 96,
        byteLength: 100,
      }])),
    ]));
    const catalog: LiveUnitCatalog = {
      schemaVersion: 1,
      revision: 7,
      families: [
        { family: 'pawn', acceptedAssetId: 'asset-pawn', displayScalePercent: 87, rowRevision: 2 },
        ...(['rook', 'knight', 'bishop', 'queen', 'king'] as const).map((family) => ({
          family,
          acceptedAssetId: null,
          displayScalePercent: 100,
          rowRevision: 0,
        })),
      ],
      assets: [{
        id: 'asset-pawn',
        family: 'pawn',
        label: 'Pawn art',
        method: 'Native',
        notes: '',
        status: 'candidate',
        accepted: true,
        footprint: { shape: 'circle', sourceCanvasWidth: 96, sourceCanvasHeight: 96, sourceFootprintPx: 40 },
        anchor: { x: 0.5, y: 0.78 },
        rowRevision: 4,
        sprites,
        spriteCount: 48,
        complete: true,
      }],
    };

    expect(applyLiveUnitCatalog(catalog)).toBe(true);
    expect(unitAssetById('pawn')?.id).toBe('pawn');
    expect(unitAssetById('pawn-codexsheet')?.id).toBe('pawn');
    expect(unitAssetById('pawn')?.defaultScale).toBe(87);
    expect(pieceSpritePath('pawn', 'crimson', 'north-east')).toBe(`/api/unit-sprites/${'a'.repeat(64)}.png`);

    expect(applyLiveUnitCatalog({
      ...catalog,
      revision: 8,
      families: catalog.families.map((family) => ({
        ...family,
        acceptedAssetId: null,
        displayScalePercent: 100,
      })),
      assets: [],
    })).toBe(true);
    expect(unitAssetById('pawn')?.catalogAssetId).toBeUndefined();
    expect(unitAssetById('pawn')?.defaultScale).toBe(100);
    expect(pieceSpritePath('pawn', 'crimson', 'north-east')).toBe('/assets/units/pawn/crimson/north-east.png');
  });
});

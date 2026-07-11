import { afterEach, describe, expect, it } from 'vitest';
import { pieceSpritePath } from '../core/pieces';
import { testLiveUnitCatalog } from '../test/liveUnitCatalog';
import {
  applyLiveUnitCatalog,
  productionUnitAssets,
  resetLiveUnitCatalog,
  unitAssetById,
  unitAssets,
} from './unitCatalog';

afterEach(() => resetLiveUnitCatalog());

describe('live unit catalog', () => {
  it('has no board-art source before the required catalog is hydrated', () => {
    expect(unitAssets).toEqual([]);
    expect(() => pieceSpritePath('pawn', 'crimson', 'north-east')).toThrow(/not hydrated/);
  });

  it('hydrates all six stable production identities from live assets', () => {
    const catalog = testLiveUnitCatalog({ revision: 7, scales: { pawn: 87 } });

    expect(applyLiveUnitCatalog(catalog)).toBe(true);
    expect(unitAssets.map((unit) => unit.id).sort()).toEqual(['bishop', 'king', 'knight', 'pawn', 'queen', 'rook']);
    expect(productionUnitAssets).toHaveLength(6);
    expect(productionUnitAssets.every((unit) => unit.accepted && unit.complete && !unit.speculative)).toBe(true);
    expect(unitAssetById('pawn')?.defaultScale).toBe(87);
    expect(unitAssetById('pawn-vintage')).toBeUndefined();
    expect(pieceSpritePath('pawn', 'crimson', 'north-east')).toBe(`/api/unit-sprites/${'a'.repeat(64)}.png`);
  });

  it('rejects an incomplete catalog instead of selecting another art source', () => {
    const catalog = testLiveUnitCatalog();
    catalog.families[0] = { ...catalog.families[0], acceptedAssetId: null };

    expect(() => applyLiveUnitCatalog(catalog)).toThrow(/has no accepted asset/);
    expect(unitAssets).toEqual([]);
    expect(() => pieceSpritePath('pawn')).toThrow(/not hydrated/);
  });

  it('atomically swaps immutable URLs without changing gameplay ids', () => {
    applyLiveUnitCatalog(testLiveUnitCatalog({ revision: 1, sha256: 'a'.repeat(64) }));
    expect(pieceSpritePath('rook')).toContain('a'.repeat(64));

    applyLiveUnitCatalog(testLiveUnitCatalog({ revision: 2, sha256: 'b'.repeat(64) }));
    expect(unitAssetById('rook')?.id).toBe('rook');
    expect(pieceSpritePath('rook')).toContain('b'.repeat(64));
  });

  it('normalizes art authored at the published family size to logical 100 percent', () => {
    applyLiveUnitCatalog(testLiveUnitCatalog({ scales: { pawn: 66 }, nativeScales: { pawn: 66 } }));

    expect(unitAssetById('pawn')?.nativeScalePercent).toBe(66);
    expect(unitAssetById('pawn')?.defaultScale).toBe(100);
  });

  it('reviews candidates at their own native 100 percent independent of the published family scale', () => {
    const catalog = testLiveUnitCatalog({ scales: { rook: 100 } });
    const accepted = catalog.assets.find((asset) => asset.family === 'rook')!;
    catalog.assets.push({
      ...accepted,
      id: 'candidate-rook',
      accepted: false,
      nativeScalePercent: 73,
      footprint: { ...accepted.footprint, sourceCanvasWidth: 57, sourceCanvasHeight: 67 },
    });

    applyLiveUnitCatalog(catalog);

    expect(unitAssetById('candidate-rook')?.defaultScale).toBe(100);
  });

  it('derives the native baseline while reading a pre-baseline catalog', () => {
    const catalog = testLiveUnitCatalog();
    catalog.assets[0].footprint.sourceCanvasWidth = 51;
    catalog.assets[0].footprint.sourceCanvasHeight = 61;
    (catalog.assets[0] as { nativeScalePercent?: number }).nativeScalePercent = undefined;

    expect(applyLiveUnitCatalog(catalog)).toBe(true);
    expect(unitAssetById(catalog.assets[0].family)?.nativeScalePercent).toBe(66);
  });
});

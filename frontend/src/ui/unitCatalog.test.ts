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
});

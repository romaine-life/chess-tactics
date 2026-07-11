import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { testLiveUnitCatalog } from '../test/liveUnitCatalog';
import { applyLiveUnitCatalog, resetLiveUnitCatalog, unitAssetById } from './unitCatalog';
import { UnitSizeControls } from './UnitSizeControls';
import {
  candidateReviewFamilyScale,
  unitDeliveryRasterForAsset,
  unitSizeHandoffSpec,
  type UnitSizeDraft,
} from './unitSizeTuning';

const draft: UnitSizeDraft = {
  pawn: 112,
  rook: 101,
  knight: 102,
  bishop: 103,
  queen: 104,
  king: 105,
};

describe('UnitSizeControls', () => {
  beforeEach(() => applyLiveUnitCatalog(testLiveUnitCatalog()));
  afterEach(() => resetLiveUnitCatalog());

  it('renders controls only for the selected family', () => {
    const html = renderToStaticMarkup(<UnitSizeControls unit={unitAssetById('pawn')!} />);

    expect(html).toContain('Pawn Size');
    expect(html).toContain('aria-label="Pawn size"');
    expect(html).not.toContain('Knight');
    expect(html).not.toContain('Reset all');
  });

  it('hands off only the selected family', () => {
    const spec = JSON.parse(unitSizeHandoffSpec('pawn', draft)) as {
      units: Record<string, { scalePercent: number }>;
    };

    expect(Object.keys(spec.units)).toEqual(['pawn']);
    expect(spec.units.pawn?.scalePercent).toBe(112);
  });

  it('reports baked target art as logical 100 percent', () => {
    const catalog = testLiveUnitCatalog({ scales: { pawn: 66 }, nativeScales: { pawn: 66 } });
    const pawn = catalog.assets.find((asset) => asset.family === 'pawn')!;
    pawn.footprint.sourceCanvasWidth = 51;
    pawn.footprint.sourceCanvasHeight = 61;
    applyLiveUnitCatalog(catalog);
    const spec = JSON.parse(unitSizeHandoffSpec('pawn', { ...draft, pawn: 66 }, unitAssetById('pawn')!)) as {
      units: Record<string, { scalePercent: number; nativeTargetPx: { w: number; h: number } }>;
    };

    expect(spec.units.pawn?.scalePercent).toBe(100);
    expect(spec.units.pawn?.nativeTargetPx).toEqual({ w: 51, h: 61 });
    expect(unitDeliveryRasterForAsset(unitAssetById('pawn')!, { ...draft, pawn: 66 })).toEqual({ width: 51, height: 61 });
  });

  it('initializes an active candidate review from its native family baseline', () => {
    const candidate = { ...unitAssetById('rook')!, speculative: true, nativeScalePercent: 73 };

    expect(candidateReviewFamilyScale(candidate)).toBe(73);
    expect(candidateReviewFamilyScale({ ...candidate, speculative: false })).toBeNull();
    expect(candidateReviewFamilyScale({ ...candidate, archived: true })).toBeNull();
  });
});

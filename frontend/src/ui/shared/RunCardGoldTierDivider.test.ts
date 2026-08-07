import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { AdminLiveMediaCatalog, AdminLiveMediaSlot, AdminLiveMediaVersion } from '../../net/liveMediaAdmin';
import {
  RUN_CARD_GOLD_TIER_COIN_DEFAULTS,
  RUN_CARD_GOLD_TIER_DIVIDER_SHA256,
  RUN_CARD_GOLD_TIER_DIVIDER_SLOT,
  runCardGoldTierDividerReviewHref,
  runCardGoldTierDividerReviewProof,
  runCardGoldTierDividerSelection,
} from './RunCardGoldTierDivider';

const source = readFileSync(new URL('./RunCardGoldTierDivider.tsx', import.meta.url), 'utf8');
const enchiridion = readFileSync(new URL('../Enchiridion.tsx', import.meta.url), 'utf8');
const chartulary = readFileSync(new URL('../HeldCardCodex.tsx', import.meta.url), 'utf8');
const studio = readFileSync(new URL('../RunCardGoldTierDividerStudio.tsx', import.meta.url), 'utf8');
const studioShell = readFileSync(new URL('../TilePreview.tsx', import.meta.url), 'utf8');
const geometry = JSON.parse(readFileSync(new URL('./runCardGoldTierDividerGeometry.json', import.meta.url), 'utf8')) as {
  coin: { size: number; x: number; y: number };
};
const style = readFileSync(new URL('../../style.css', import.meta.url), 'utf8');

function fixture(): {
  catalog: AdminLiveMediaCatalog;
  slot: AdminLiveMediaSlot;
  version: AdminLiveMediaVersion;
} {
  const slot = {
    slot: RUN_CARD_GOLD_TIER_DIVIDER_SLOT,
    rowRevision: 4,
    activeVersionId: null,
  } as AdminLiveMediaSlot;
  const version = {
    id: '50510000-0000-4000-8000-000000000001',
    slot: RUN_CARD_GOLD_TIER_DIVIDER_SLOT,
    status: 'candidate',
    rowRevision: 7,
    media: {
      sha256: RUN_CARD_GOLD_TIER_DIVIDER_SHA256,
      mediaType: 'image/png',
      width: 688,
      height: 384,
      immutableUrl: `/api/media/${RUN_CARD_GOLD_TIER_DIVIDER_SHA256}`,
    },
  } as AdminLiveMediaVersion;
  return {
    slot,
    version,
    catalog: { slots: [slot], versions: [version] } as AdminLiveMediaCatalog,
  };
}

describe('RunCardGoldTierDivider', () => {
  it('selects only the exact PixelLab bytes from the closed semantic slot', () => {
    const { catalog, version } = fixture();
    expect(runCardGoldTierDividerSelection(catalog, version.id)?.version).toBe(version);
    expect(runCardGoldTierDividerSelection({
      ...catalog,
      versions: [{ ...version, media: { ...version.media!, sha256: 'a'.repeat(64) } }],
    }, version.id)).toBeNull();
    expect(runCardGoldTierDividerReviewHref(version.id))
      .toBe(`/enchiridion/cards?goldTierDividerReview=${version.id}`);
  });

  it('builds review evidence for the exact three-slice gallery renderer', () => {
    const { slot, version } = fixture();
    const surfaceUrl = `http://ui-generation.chess-tactics.localhost${runCardGoldTierDividerReviewHref(version.id)}`;
    expect(runCardGoldTierDividerReviewProof({ slot, version, surfaceUrl })).toEqual(expect.objectContaining({
      surfaceUrl,
      canonicalScale: 1,
      spatialResampling: true,
      frameWidth: 688,
      frameHeight: 384,
      drawHeight: 38,
      leftCapWidth: 47,
      rightCapWidth: 20,
      slice: { top: 138, right: 56, bottom: 139, left: 132 },
      selectedCandidates: [{
        slot: RUN_CARD_GOLD_TIER_DIVIDER_SLOT,
        versionId: version.id,
        sha256: RUN_CARD_GOLD_TIER_DIVIDER_SHA256,
        rowRevision: 7,
      }],
      slotSnapshots: [{
        slot: RUN_CARD_GOLD_TIER_DIVIDER_SLOT,
        rowRevision: 4,
        activeVersionId: null,
      }],
    }));
  });

  it('takes its runtime baseline from the same Git-owned geometry that Studio edits', () => {
    expect(RUN_CARD_GOLD_TIER_COIN_DEFAULTS).toEqual(geometry.coin);
    expect(source).toContain("'--run-card-gold-tier-coin-size': `${coinTuning.size}px`");
    expect(style).toMatch(/--run-card-cost-coin-size: var\(--run-card-gold-tier-coin-size\);/);
    expect(style).not.toMatch(/--run-card-gold-tier-coin-(?:size|x|y),/);
    expect(studio).toContain('RUN_CARD_GOLD_TIER_COIN_DEFAULTS');
    expect(studio).toContain('<SliderRow');
    expect(studio).toContain('Save runtime defaults');
    expect(studio).toContain('<RunCardGoldTierDivider');
    expect(studioShell).toContain("id: 'carddivider'");
    expect(studioShell).toContain("openViewer('carddivider')");
    expect(enchiridion).not.toContain('goldTierCoinTune');
    expect(enchiridion).not.toContain('GoldTierCoinTuner');
  });

  it('keeps the rails text-free, retains the live coin, and owns both card galleries', () => {
    expect(source).toContain('<DividerSlice sourceUrl={source.url} viewBox="0 138 132 107" />');
    expect(source).toContain('<DividerSlice sourceUrl={source.url} viewBox="132 138 500 107" />');
    expect(source).toContain('<DividerSlice sourceUrl={source.url} viewBox="632 138 56 107" />');
    expect(source).toContain('<RunCardCostCoin value={value}');
    expect(source).not.toContain('<text');
    expect(enchiridion).toContain('<RunCardGoldTierDivider value={value} source={goldTierDividerSource} />');
    expect(chartulary).toContain('<RunCardGoldTierDivider value={value} source={goldTierDividerSource} />');
  });

  it('keeps the cradle inside the horizontal scroll clip while the finial retains the full row width', () => {
    expect(style).toMatch(/\.run-card-gold-tier-divider \{[^}]*inline-size: calc\(100% \+ 7px\);/s);
    expect(style).toMatch(/\.run-card-gold-tier-divider \{[^}]*margin-inline-start: -7px;/s);
    expect(style).not.toMatch(/\.run-card-gold-tier-divider \{[^}]*margin-inline-start: -14px;/s);
  });
});

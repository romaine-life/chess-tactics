import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { RUN_CARD_CATALOG, RUN_OFFER_CARD_COUNT, RUN_STARTER_CARDS } from '../run/model';

describe('formation card Studio gallery', () => {
  it('reviews the complete live catalog through the shared RunCard', () => {
    const source = readFileSync(new URL('./RunCardPrototype.tsx', import.meta.url), 'utf8');
    expect(RUN_CARD_CATALOG).toHaveLength(RUN_OFFER_CARD_COUNT + RUN_STARTER_CARDS.length);
    expect(source).toContain('RUN_CARD_CATALOG.map');
    expect(source).toContain('<RunCard card={card} mode="reference"');
    expect(source).not.toMatch(/ability|cardicons|propertyCandidate/i);
  });

  it('reviews the selected Standard-frame rarity triplet from live storage', () => {
    const source = readFileSync(new URL('./RunCardPrototype.tsx', import.meta.url), 'utf8');
    expect(source).toContain("get('rarityStudy') === '1'");
    expect(source).toContain("label: 'Common'");
    expect(source).toContain("label: 'Uncommon'");
    expect(source).toContain("label: 'Rare'");
    expect(source).toContain('runCardRarityFrameReviewProof');
    expect(source).toContain('acceptLiveMediaVersions');
    expect(source).not.toContain('/tmp-shots/');
    expect(source).toContain('<RunCardFace');
    expect(source).toContain('Rarity colors the artwork frame');
  });
});

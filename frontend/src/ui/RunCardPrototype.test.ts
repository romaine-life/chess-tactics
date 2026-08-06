import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { RUN_CARD_CATALOG } from '../run/model';

describe('formation card Studio gallery', () => {
  it('reviews the complete live catalog through the shared RunCard', () => {
    const source = readFileSync(new URL('./RunCardPrototype.tsx', import.meta.url), 'utf8');
    expect(RUN_CARD_CATALOG).toHaveLength(20);
    expect(source).toContain('RUN_CARD_CATALOG.map');
    expect(source).toContain('<RunCard card={card} mode="reference"');
    expect(source).not.toMatch(/ability|cardicons|propertyCandidate/i);
  });
});

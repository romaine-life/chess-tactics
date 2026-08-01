import { describe, expect, it } from 'vitest';
import { RUN_CARD_APPROVED_TUNING } from './RunCardFace';
import { runCardPrototypeContent, runCardPrototypeVariantFromSearch } from './RunCardPrototype';

describe('Run Card Layout review variant', () => {
  it('addresses the Pestiferous review state in the URL', () => {
    expect(runCardPrototypeVariantFromSearch('?mode=viewer&cardVariant=pestiferous')).toBe('pestiferous');
    expect(runCardPrototypeVariantFromSearch('?mode=viewer&cardVariant=unknown')).toBe('standard');
  });

  it('uses the accepted affected-card type line without changing the card identity', () => {
    expect(runCardPrototypeContent('pestiferous')).toMatchObject({
      name: 'Parish Militia',
      typeLine: 'Units — Pestiferous',
    });
    expect(runCardPrototypeContent('standard').typeLine).toBe('Units');
  });

  it('shares one optically centered type-line tuning across ordinary and qualified cards', () => {
    expect(RUN_CARD_APPROVED_TUNING).toMatchObject({
      typeSize: 5.3,
      typeX: 1.35,
      typeY: 0.65,
    });
  });
});

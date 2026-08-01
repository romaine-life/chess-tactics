import { describe, expect, it } from 'vitest';
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
});

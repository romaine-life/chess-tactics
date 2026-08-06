import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('Formation Lab', () => {
  it('reviews the exact live formation inventory and names the fallback', () => {
    const source = readFileSync(new URL('./DeploymentLab.tsx', import.meta.url), 'utf8');
    expect(source).toContain('RUN_CARD_CATALOG.map');
    expect(source).toContain('tries the complete shape first');
    expect(source).toContain('seeded legal-square fallback');
    expect(source).not.toMatch(/adlected|eutactic|agminate|manualPlacements/i);
  });
});

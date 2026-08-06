import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('Bona Vacantia relic choice', () => {
  it('commits every active relic directly without a unit target branch', () => {
    const source = readFileSync(new URL('./RunBonaVacantia.tsx', import.meta.url), 'utf8');
    expect(source).toContain('replace(takeVacantiaLipsanon(run, lipsanonId))');
    expect(source).not.toMatch(/targetUnit|needsUnit|lipsanonNeedsUnitTarget|RunArmyWorkspace/);
  });
});

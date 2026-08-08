import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync(new URL('./RunBonaVacantia.tsx', import.meta.url), 'utf8');

describe('Bona Vacantia relic choice', () => {
  it('commits every active relic directly without a unit target branch', () => {
    expect(source).toContain('replace(takeVacantiaLipsanon(run, lipsanonId))');
    expect(source).not.toMatch(/targetUnit|needsUnit|lipsanonNeedsUnitTarget|RunArmyWorkspace/);
  });
});

describe('Bona Vacantia opening card grant', () => {
  it('hands the take to the Run phase so the card can travel into the Chartulary', () => {
    // Taking the grant ends the phase, so a flight owned here would be released into a
    // Deployment still preparing. The press only dims the row; the admission and the carry
    // belong to the Run phase, which outlives this workspace.
    expect(source).toContain('takeCard(coreId, source)');
    expect(source).toContain('onSelect={(source) => {');
    expect(source).not.toContain('takeVacantiaCard');
    expect(source).not.toContain('useRunCardFlights');
  });
});

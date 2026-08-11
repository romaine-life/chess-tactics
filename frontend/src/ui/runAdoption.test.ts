import { describe, expect, it } from 'vitest';
import type { RunDocument } from '../run/model';
import { runAdoptionFacts } from './runAdoption';

const NOW = Date.parse('2026-08-10T12:00:00.000Z');

const run = (overrides: Partial<RunDocument> = {}): RunDocument => ({
  id: 'run-1',
  updatedAt: '2026-08-10T11:30:00.000Z',
  phase: 'battle',
  battleIndex: 2,
  army: [{}, {}, {}],
  goldTenths: 440,
  ataraxiaTier: 0,
  war: {
    id: 'war-1',
    name: 'Crown of Valoria',
    description: '',
    battles: [{}, {}, {}, {}, {}, {}, {}, {}, {}, {}],
  },
  ...overrides,
} as unknown as RunDocument);

const labels = (facts: ReturnType<typeof runAdoptionFacts>): string[] => facts.map((fact) => fact.label);

describe('Run adoption candidate facts', () => {
  it('states where the Run stands, what it carries, and when it was last played', () => {
    const browser = run();
    const account = run({ id: 'run-2' });
    const facts = runAdoptionFacts(browser, account, NOW);
    expect(labels(facts)).toEqual(['Progress', 'Army', 'Gold', 'Last played']);
    expect(facts).toContainEqual({ label: 'Progress', value: 'Battle 3 of 10' });
    expect(facts).toContainEqual({ label: 'Army', value: '3 units' });
    // An army of one is reachable — the King is not counted — and "1 units" is not a sentence.
    expect(runAdoptionFacts(run({ army: [{}] } as Partial<RunDocument>), account, NOW))
      .toContainEqual({ label: 'Army', value: '1 unit' });
    expect(facts).toContainEqual({ label: 'Last played', value: '30 minutes ago' });
  });

  it('omits the War when both Runs are in the same one — the usual case', () => {
    // The sentence this replaced named each side's War and nothing else, which is why it
    // settled nothing: two Runs on one account are almost always the same War.
    expect(labels(runAdoptionFacts(run(), run({ id: 'run-2' }), NOW))).not.toContain('War');
  });

  it('states the War only when the two Runs disagree about it', () => {
    const other = run({ id: 'run-2', war: { ...run().war, name: 'Bona Vacantia' } } as Partial<RunDocument>);
    expect(runAdoptionFacts(run(), other, NOW)).toContainEqual({ label: 'War', value: 'Crown of Valoria' });
    expect(runAdoptionFacts(other, run(), NOW)).toContainEqual({ label: 'War', value: 'Bona Vacantia' });
  });

  it('never states Ataraxia, which has exactly one tier and so cannot tell two Runs apart', () => {
    expect(labels(runAdoptionFacts(run(), run({ id: 'run-2' }), NOW))).not.toContain('Ataraxia');
  });

  it('distinguishes two Runs sitting at different points of the same War', () => {
    const browser = run({ battleIndex: 5, phase: 'sectio' } as Partial<RunDocument>);
    const account = run({ id: 'run-2', battleIndex: 1, phase: 'deployment' } as Partial<RunDocument>);
    expect(runAdoptionFacts(browser, account, NOW)).toContainEqual({ label: 'Progress', value: 'Sectio after Battle 6' });
    expect(runAdoptionFacts(account, browser, NOW)).toContainEqual({ label: 'Progress', value: 'Deploy for Battle 2' });
  });
});

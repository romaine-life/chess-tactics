import { describe, expect, it } from 'vitest';
import { readTooltipGlossary } from './tooltipGlossary';

describe('tooltip glossary text without unit abilities', () => {
  it('renders copy without injecting retired keyword controls', () => {
    const reading = readTooltipGlossary('Deploy the formation shown.', 'Formation');
    expect(reading.content).toBe('Deploy the formation shown.');
    expect(reading.entries).toEqual([]);
  });
});

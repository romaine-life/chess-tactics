import { describe, expect, it } from 'vitest';
import { strategikonRouteLabels } from './strategikonRoute';

describe('Strategikon title-route labels', () => {
  it.each([
    ['/run/strategikon/chartulary', ['Strategikon', 'Chartulary']],
    ['/run/strategikon/prosopography', ['Strategikon', 'Prosopography']],
    ['/run/strategikon/lipsanotheca', ['Strategikon', 'Lipsanotheca']],
    ['/run/strategikon/enchiridion/units', ['Strategikon', 'Enchiridion', 'Units']],
    ['/run/strategikon/enchiridion/card-types', ['Strategikon', 'Enchiridion', 'Card Types']],
    ['/play/strategikon/enchiridion/ataraxia', ['Strategikon', 'Enchiridion', 'Ataraxia']],
  ] as const)('names every visible segment in %s', (path, expected) => {
    expect(strategikonRouteLabels(path)).toEqual(expected);
  });
});

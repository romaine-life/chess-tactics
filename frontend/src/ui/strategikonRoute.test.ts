import { describe, expect, it } from 'vitest';
import { strategikonAddress, strategikonRouteCrumbs, strategikonRouteLabels } from './strategikonRoute';

describe('Strategikon title-route labels', () => {
  it.each([
    ['/run/strategikon', ['Strategikon']],
    ['/run/strategikon/enchiridion', ['Strategikon', 'Enchiridion']],
    ['/run/strategikon/chartulary', ['Strategikon', 'Chartulary']],
    ['/run/strategikon/prosopography', ['Strategikon', 'Prosopography']],
    ['/run/strategikon/lipsanotheca', ['Strategikon', 'Lipsanotheca']],
    ['/run/strategikon/enchiridion/units', ['Strategikon', 'Enchiridion', 'Units']],
    ['/run/strategikon/enchiridion/card-types', ['Strategikon', 'Enchiridion', 'Card Types']],
    ['/play/strategikon/enchiridion/ataraxia', ['Strategikon', 'Enchiridion', 'Ataraxia']],
  ] as const)('names every visible segment in %s', (path, expected) => {
    expect(strategikonRouteLabels(path)).toEqual(expected);
  });

  it('links the nested Enchiridion ancestry and exact visible reference', () => {
    expect(strategikonRouteCrumbs('/run/strategikon/enchiridion/lipsana')).toEqual([
      { label: 'Strategikon', to: '/run/strategikon' },
      { label: 'Enchiridion', to: '/run/strategikon/enchiridion' },
      { label: 'Lipsana', to: '/run/strategikon/enchiridion/lipsana' },
    ]);
  });

  it('links a terminal Strategikon section directly', () => {
    expect(strategikonRouteCrumbs('/play/strategikon/chartulary')).toEqual([
      { label: 'Strategikon', to: '/play/strategikon' },
      { label: 'Chartulary', to: '/play/strategikon/chartulary' },
    ]);
  });

  it('resolves the two retained shell roots without implicit children', () => {
    expect(strategikonAddress('/run/strategikon')).toEqual({
      base: '/run', section: null, reference: null,
    });
    expect(strategikonAddress('/run/strategikon/enchiridion')).toEqual({
      base: '/run', section: 'enchiridion', reference: null,
    });
    expect(strategikonAddress('/run/strategikon/enchiridion/unknown')).toEqual({
      base: '/run', section: 'enchiridion', reference: null,
    });
  });
});

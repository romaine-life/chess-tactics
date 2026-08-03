import { describe, expect, it } from 'vitest';
import { craftDestination } from './useRunCraft';

describe('where a craft link lands', () => {
  it('lands on the Run screen when the address says nothing else', () => {
    expect(craftDestination('')).toBe('/run');
    expect(craftDestination('?view=army')).toBe('/run?view=army');
  });

  it('lands inside the Run workspace a `to` names, and consumes the parameter', () => {
    expect(craftDestination('?to=/run/strategikon/chartulary')).toBe('/run/strategikon/chartulary');
    expect(craftDestination('?to=/run/strategikon/enchiridion/cards&view=army'))
      .toBe('/run/strategikon/enchiridion/cards?view=army');
  });

  it('ignores a destination that would leave the crafted Run', () => {
    // The link's job is to land on the Run it just crafted. Anything else — another screen,
    // another site, or a second craft — would make it mean something other than what it says.
    expect(craftDestination('?to=/editor/level')).toBe('/run');
    expect(craftDestination('?to=https://example.com')).toBe('/run');
    expect(craftDestination('?to=//example.com')).toBe('/run');
    expect(craftDestination('?to=/runaway')).toBe('/run');
    expect(craftDestination('?to=/run/craft/abcdef123456')).toBe('/run');
  });
});

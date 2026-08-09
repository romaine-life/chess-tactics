import { describe, expect, it } from 'vitest';
import { presentedRunAddress } from './runRoute';

const presented = (path: string, search = ''): string => {
  const address = presentedRunAddress(path, search);
  return `${address.path}${address.search}`;
};

describe('the Run address a craft link presents', () => {
  it('presents the Run screen when the address says nothing else', () => {
    expect(presented('/run/craft/abcdef123456')).toBe('/run');
    expect(presented('/run/craft/abcdef123456', '?view=army')).toBe('/run?view=army');
  });

  it('presents the Run workspace a `to` names, and consumes the parameter', () => {
    expect(presented('/run/craft/abcdef123456', '?to=/run/strategikon/chartulary'))
      .toBe('/run/strategikon/chartulary');
    expect(presented('/run/craft/abcdef123456', '?to=/run/strategikon/enchiridion/cards&view=army'))
      .toBe('/run/strategikon/enchiridion/cards?view=army');
    expect(presented('/run/craft/abcdef123456', '?to=%2Frun%3Fview%3Dbattle-preview'))
      .toBe('/run?view=battle-preview');
    expect(presented('/run/craft/abcdef123456', '?to=%2Frun%3Fview%3Dbattle-preview&run=expected'))
      .toBe('/run?view=battle-preview&run=expected');
  });

  it('ignores a destination that would leave the crafted Run', () => {
    // The link's job is to present the Run it just crafted. Anything else — another screen,
    // another site, or a second craft — would make it mean something other than what it says.
    expect(presented('/run/craft/abcdef123456', '?to=/editor/level')).toBe('/run');
    expect(presented('/run/craft/abcdef123456', '?to=https://example.com')).toBe('/run');
    expect(presented('/run/craft/abcdef123456', '?to=//example.com')).toBe('/run');
    expect(presented('/run/craft/abcdef123456', '?to=/runaway')).toBe('/run');
    expect(presented('/run/craft/abcdef123456', '?to=/run/craft/abcdef123456')).toBe('/run');
  });

  it('leaves every other address exactly as it is', () => {
    // Only a craft link presents something other than itself, so this is a no-op everywhere
    // the scene graph, the title bar and the Run screen call it.
    expect(presented('/run')).toBe('/run');
    expect(presented('/run', '?view=army&to=/run/strategikon')).toBe('/run?view=army&to=/run/strategikon');
    expect(presented('/run/strategikon/chartulary', '?run=1')).toBe('/run/strategikon/chartulary?run=1');
    expect(presented('/editor/level', '?document=abc')).toBe('/editor/level?document=abc');
  });
});

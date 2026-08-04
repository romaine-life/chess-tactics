import { describe, expect, it } from 'vitest';
import { isRunRoutePath, isRunStrategikonPath } from './runRoute';

describe('Run route family', () => {
  it('includes the empty Strategikon root and all explicit descendants', () => {
    for (const path of [
      '/run/strategikon',
      '/run/strategikon/enchiridion',
      '/run/strategikon/enchiridion/units',
      '/run/strategikon/chartulary',
    ]) {
      expect(isRunRoutePath(path)).toBe(true);
      expect(isRunStrategikonPath(path)).toBe(true);
    }
  });

  it('does not mistake the Run root or a lookalike prefix for Strategikon', () => {
    expect(isRunStrategikonPath('/run')).toBe(false);
    expect(isRunStrategikonPath('/run/strategikonic')).toBe(false);
  });
});

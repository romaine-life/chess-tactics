import { describe, expect, it, vi } from 'vitest';
import { cssTimeMs, uiFadeTiming } from './motionTokens';

describe('UI motion tokens', () => {
  it('resolves the shared fade without copying its duration or easing', () => {
    const getComputedStyle = vi.fn(() => ({
      getPropertyValue: (name: string) => name === '--ds-duration-fade'
        ? '350ms'
        : name === '--ds-ease-standard'
          ? 'cubic-bezier(0.2, 0, 0, 1)'
          : '',
    }));
    vi.stubGlobal('getComputedStyle', getComputedStyle);

    expect(uiFadeTiming({} as Element)).toEqual({
      duration: 350,
      easing: 'cubic-bezier(0.2, 0, 0, 1)',
      fill: 'both',
    });
    expect(cssTimeMs('0.35s')).toBe(350);

    vi.unstubAllGlobals();
  });
});

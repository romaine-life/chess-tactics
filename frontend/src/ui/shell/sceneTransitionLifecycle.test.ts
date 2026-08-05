import { describe, expect, it, vi } from 'vitest';
import { sceneTransitionDurationMs } from './sceneTransitionLifecycle';

describe('scene transition lifecycle', () => {
  it('waits through an outgoing fade delay before completing the incoming fade', () => {
    vi.stubGlobal('getComputedStyle', vi.fn(() => ({
      transitionDuration: '350ms',
      transitionDelay: '350ms',
    })));
    const root = {
      dataset: {},
      children: [],
      querySelectorAll: () => [],
    } as unknown as HTMLElement;

    expect(sceneTransitionDurationMs(root)).toBe(700);

    vi.unstubAllGlobals();
  });
});

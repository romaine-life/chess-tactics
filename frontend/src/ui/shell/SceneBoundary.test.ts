import { describe, expect, it } from 'vitest';
import { sceneBoundaryLifecycle } from './SceneBoundary';

describe('scene boundary lifecycle authority', () => {
  it('never activates an incoming scene during the outgoing exit', () => {
    expect(sceneBoundaryLifecycle('exiting', 'incoming')).toEqual({
      preparing: true,
      revealing: false,
      deactivating: false,
    });
  });

  it('keeps an incoming scene preparing through its entrance', () => {
    expect(sceneBoundaryLifecycle('entering', 'incoming')).toEqual({
      preparing: true,
      revealing: true,
      deactivating: false,
    });
  });

  it('deactivates the outgoing scene and activates only a committed single scene', () => {
    expect(sceneBoundaryLifecycle('exiting', 'outgoing').deactivating).toBe(true);
    expect(sceneBoundaryLifecycle('current', 'single')).toEqual({
      preparing: false,
      revealing: false,
      deactivating: false,
    });
  });
});

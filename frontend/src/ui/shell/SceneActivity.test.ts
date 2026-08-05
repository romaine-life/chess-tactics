import { describe, expect, it, vi } from 'vitest';
import { createSceneActivityAuthority, type SceneMotion } from './SceneActivity';

function controlledAnimation() {
  let playState: AnimationPlayState = 'running';
  let currentTime: CSSNumberish | null = 17;
  const pause = vi.fn(() => { playState = 'paused'; });
  const play = vi.fn(() => { playState = 'running'; });
  const cancel = vi.fn(() => { playState = 'idle'; });
  const animation = {
    get playState() { return playState; },
    get currentTime() { return currentTime; },
    set currentTime(value) { currentTime = value; },
    pause,
    play,
    cancel,
    effect: null,
    finished: new Promise<Animation>(() => {}),
  } as unknown as Animation;
  return { animation, pause, play, cancel };
}

describe('scene activity authority', () => {
  it('does not run entered actions until the director activates the scene', () => {
    const authority = createSceneActivityAuthority();
    const run = vi.fn();
    const cleanup = vi.fn();
    authority.registerEnteredAction('deployment-deal', () => {
      run();
      return cleanup;
    });

    expect(run).not.toHaveBeenCalled();
    authority.activate();
    authority.activate();
    expect(run).toHaveBeenCalledTimes(1);

    authority.deactivate();
    authority.dispose();
    expect(cleanup).toHaveBeenCalledTimes(1);
  });

  it('holds imperative motion at its first frame until activation', () => {
    const authority = createSceneActivityAuthority();
    const controlled = controlledAnimation();
    const element = { animate: vi.fn(() => controlled.animation) } as unknown as Element;

    expect(authority.motion.animate(element, [{ opacity: 0 }, { opacity: 1 }], 420))
      .toBe(controlled.animation);
    expect(controlled.pause).toHaveBeenCalledTimes(1);
    expect(controlled.animation.currentTime).toBe(0);
    expect(controlled.play).not.toHaveBeenCalled();

    authority.activate();
    expect(controlled.play).toHaveBeenCalledTimes(1);
    authority.deactivate();
    expect(controlled.cancel).toHaveBeenCalledTimes(1);
  });

  it('constructs entry motion during preparation and releases that same motion at commit', () => {
    const authority = createSceneActivityAuthority();
    const controlled = controlledAnimation();
    const element = { animate: vi.fn(() => controlled.animation) } as unknown as Element;
    const prepare = vi.fn((motion: SceneMotion) => {
      motion.animate(element, [{ opacity: 0 }, { opacity: 1 }], { duration: 420, fill: 'both' });
    });

    authority.registerEntryMotion('deployment-deal', prepare);

    expect(prepare).toHaveBeenCalledTimes(1);
    expect(element.animate).toHaveBeenCalledTimes(1);
    expect(controlled.animation.currentTime).toBe(0);
    expect(controlled.play).not.toHaveBeenCalled();

    authority.activate();
    expect(element.animate).toHaveBeenCalledTimes(1);
    expect(controlled.play).toHaveBeenCalledTimes(1);
  });

  it('holds descendant CSS motion discovered during scene preparation', () => {
    const authority = createSceneActivityAuthority();
    const controlled = controlledAnimation();
    const listeners = new Map<string, EventListener>();
    const root = {
      getAnimations: vi.fn(() => [controlled.animation]),
      addEventListener: vi.fn((type: string, listener: EventListener) => listeners.set(type, listener)),
      removeEventListener: vi.fn((type: string) => listeners.delete(type)),
    } as unknown as HTMLElement;

    const release = authority.holdPreparingMotion(root);
    expect(controlled.pause).toHaveBeenCalledTimes(1);
    expect(listeners.has('animationstart')).toBe(true);
    expect(listeners.has('transitionrun')).toBe(true);

    release();
    authority.activate();
    expect(controlled.play).toHaveBeenCalledTimes(1);
    expect(listeners.size).toBe(0);
  });
});

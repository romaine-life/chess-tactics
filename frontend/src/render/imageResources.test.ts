import { afterEach, describe, expect, it, vi } from 'vitest';
import { ImageResourceError, loadDecodedImage } from './imageResources';

class FakeImage {
  static loads = 0;
  decoding = '';
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  decode = vi.fn(async () => {});

  set src(value: string) {
    FakeImage.loads += 1;
    queueMicrotask(() => value.includes('fail') ? this.onerror?.() : this.onload?.());
  }
}

afterEach(() => {
  vi.unstubAllGlobals();
  FakeImage.loads = 0;
});

describe('shared decoded image resources', () => {
  it('deduplicates fetch/decode work for every consumer of the same immutable URL', async () => {
    vi.stubGlobal('Image', FakeImage);
    const url = '/api/media/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
    const [first, second] = await Promise.all([loadDecodedImage(url), loadDecodedImage(url)]);
    expect(first).toBe(second);
    expect(FakeImage.loads).toBe(1);
  });

  // The startup and scene-readiness gates both block on this promise, and `decode()` may stay
  // pending forever on a document the browser is not painting. Unbounded, that stranded the app
  // with no error at all: React never mounted and index.html's static "Loading..." stayed up.
  // A loaded image is usable whether or not it was pre-decoded, so the wait is bounded.
  it('hands over a loaded image whose decode never settles', async () => {
    vi.useFakeTimers();
    class NeverDecodes extends FakeImage {
      decode = vi.fn(() => new Promise<void>(() => {}));
    }
    vi.stubGlobal('Image', NeverDecodes);
    const pending = loadDecodedImage('/api/media/never-decodes.png');
    let settled = false;
    void pending.then(() => { settled = true; });
    await vi.advanceTimersByTimeAsync(0);
    expect(settled).toBe(false);
    await vi.advanceTimersByTimeAsync(5_000);
    await expect(pending).resolves.toBeInstanceOf(NeverDecodes);
    vi.useRealTimers();
  });

  // A stalled request fires neither `load` nor `error`, so an unbounded gate waits for the rest of
  // the session. Observed in the wild: six media requests issued and never completed while the
  // server answered every one 200, leaving the Controls panel's surface in `loading` behind a
  // blank screen. Unlike a skipped pre-decode there are no pixels here, so this must REJECT — the
  // caller's retry and error surface are the right outcome and both already exist.
  it('fails an image that never arrives, instead of waiting for it forever', async () => {
    vi.useFakeTimers();
    class NeverArrives extends FakeImage {
      set src(_value: string) { FakeImage.loads += 1; } // no load, no error — just silence
    }
    vi.stubGlobal('Image', NeverArrives);
    const pending = loadDecodedImage('/api/media/never-arrives.png');
    const settled = vi.fn();
    void pending.then(settled, settled);
    await vi.advanceTimersByTimeAsync(19_000);
    expect(settled).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(2_000);
    await expect(pending).rejects.toBeInstanceOf(ImageResourceError);
    vi.useRealTimers();
  });

  it('does not cache a failed record as readiness and permits a retry', async () => {
    vi.stubGlobal('Image', FakeImage);
    await expect(loadDecodedImage('/fail-once.png')).rejects.toBeInstanceOf(ImageResourceError);
    await expect(loadDecodedImage('/fail-once.png')).rejects.toBeInstanceOf(ImageResourceError);
    expect(FakeImage.loads).toBe(2);
  });
});


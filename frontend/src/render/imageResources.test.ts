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

  it('does not cache a failed record as readiness and permits a retry', async () => {
    vi.stubGlobal('Image', FakeImage);
    await expect(loadDecodedImage('/fail-once.png')).rejects.toBeInstanceOf(ImageResourceError);
    await expect(loadDecodedImage('/fail-once.png')).rejects.toBeInstanceOf(ImageResourceError);
    expect(FakeImage.loads).toBe(2);
  });
});


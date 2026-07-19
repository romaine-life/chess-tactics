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

  it('does not cache a failed record as readiness and permits a retry', async () => {
    vi.stubGlobal('Image', FakeImage);
    await expect(loadDecodedImage('/fail-once.png')).rejects.toBeInstanceOf(ImageResourceError);
    await expect(loadDecodedImage('/fail-once.png')).rejects.toBeInstanceOf(ImageResourceError);
    expect(FakeImage.loads).toBe(2);
  });
});


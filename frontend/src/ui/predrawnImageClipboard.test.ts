import { describe, expect, it, vi } from 'vitest';
import {
  PredrawnImageClipboardError,
  copyPredrawnPngBlobToClipboard,
  copyPredrawnPngToClipboard,
  createPredrawnPngIngressGuard,
  predrawnPngFromDataTransfer,
  predrawnPngFromPasteEvent,
  readPredrawnPngFromClipboard,
  type PredrawnClipboardItemConstructor,
  type PredrawnClipboardWriteItem,
} from './predrawnImageClipboard';

const PNG_BYTES = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 1, 2, 3, 4]);

function pngBlob(extra = new Uint8Array()): Blob {
  return new Blob([PNG_BYTES, extra], { type: 'image/png' });
}

function expectClipboardError(
  value: unknown,
  code: PredrawnImageClipboardError['code'],
  message: RegExp,
): void {
  expect(value).toBeInstanceOf(PredrawnImageClipboardError);
  expect(value).toMatchObject({ code });
  expect((value as Error).message).toMatch(message);
}

async function expectClipboardRejection(
  promise: Promise<unknown>,
  code: PredrawnImageClipboardError['code'],
  message: RegExp,
): Promise<void> {
  const error = await promise.then(
    () => {
      throw new Error(`Expected clipboard operation to reject with ${code}.`);
    },
    (cause: unknown) => cause,
  );
  expectClipboardError(error, code, message);
}

describe('copyPredrawnPngToClipboard', () => {
  it('writes the exact authenticated full-resolution PNG through a promised ClipboardItem payload', async () => {
    const source = pngBlob(new Uint8Array([9, 8, 7]));
    let resolveFetch: ((response: Response) => void) | undefined;
    const fetchPng = vi.fn(() => new Promise<Response>((resolve) => {
      resolveFetch = resolve;
    }));
    let promisedPng: Promise<Blob> | undefined;
    let constructed = false;
    class FakeClipboardItem implements PredrawnClipboardWriteItem {
      constructor(items: Record<string, Blob | Promise<Blob>>) {
        constructed = true;
        expect(items['image/png']).toBeInstanceOf(Promise);
        promisedPng = items['image/png'] as Promise<Blob>;
      }
    }
    const write = vi.fn(async () => {
      expect(constructed).toBe(true);
      expect(resolveFetch).toBeTypeOf('function');
    });

    const copying = copyPredrawnPngToClipboard('/api/background/source/content', {
      fetch: fetchPng,
      clipboard: { write },
      ClipboardItem: FakeClipboardItem as PredrawnClipboardItemConstructor,
    });
    expect(write).toHaveBeenCalledTimes(1);
    resolveFetch?.(new Response(source, {
      status: 200,
      headers: { 'Content-Type': 'image/png' },
    }));

    const copied = await copying;
    const clipboardBlob = await promisedPng!;
    expect(fetchPng).toHaveBeenCalledWith('/api/background/source/content', {
      credentials: 'include',
      cache: 'no-store',
    });
    expect(await copied.arrayBuffer()).toEqual(await source.arrayBuffer());
    expect(await clipboardBlob.arrayBuffer()).toEqual(await source.arrayBuffer());
  });

  it('reports unsupported image copy before attempting a fetch', async () => {
    const fetchPng = vi.fn();
    await expectClipboardRejection(copyPredrawnPngToClipboard('/source.png', {
      clipboard: null,
      ClipboardItem: null,
      fetch: fetchPng,
    }), 'unsupported', /Chrome.*HTTPS or localhost.*download the PNG/i);
    expect(fetchPng).not.toHaveBeenCalled();
  });

  it('turns clipboard permission rejection into an actionable error', async () => {
    class FakeClipboardItem {}
    const denied = new DOMException('denied', 'NotAllowedError');
    await expectClipboardRejection(copyPredrawnPngToClipboard('/source.png', {
      clipboard: { write: vi.fn().mockRejectedValue(denied) },
      ClipboardItem: FakeClipboardItem as PredrawnClipboardItemConstructor,
      fetch: vi.fn().mockResolvedValue(new Response(pngBlob(), {
        headers: { 'Content-Type': 'image/png' },
      })),
    }), 'permission-denied', /Focus this tab.*allow clipboard access/i);
  });

  it('rejects a non-PNG response without transcoding it', async () => {
    let payload: Promise<Blob> | undefined;
    class FakeClipboardItem {
      constructor(items: Record<string, Blob | Promise<Blob>>) {
        payload = items['image/png'] as Promise<Blob>;
      }
    }
    const write = vi.fn(async () => {
      await payload;
    });
    await expectClipboardRejection(copyPredrawnPngToClipboard('/source.png', {
      clipboard: { write },
      ClipboardItem: FakeClipboardItem as PredrawnClipboardItemConstructor,
      fetch: vi.fn().mockResolvedValue(new Response(new Blob(['jpeg'], { type: 'image/jpeg' }), {
        headers: { 'Content-Type': 'image/jpeg' },
      })),
    }), 'load-failed', /stored generation reference is not a PNG.*capture the reference again/i);
  });

  it('reports a failed authenticated source fetch directly', async () => {
    let payload: Promise<Blob> | undefined;
    class FakeClipboardItem {
      constructor(items: Record<string, Blob | Promise<Blob>>) {
        payload = items['image/png'] as Promise<Blob>;
      }
    }
    const write = vi.fn(async () => {
      await payload;
    });
    await expectClipboardRejection(copyPredrawnPngToClipboard('/missing.png', {
      clipboard: { write },
      ClipboardItem: FakeClipboardItem as PredrawnClipboardItemConstructor,
      fetch: vi.fn().mockResolvedValue(new Response(null, { status: 404 })),
    }), 'load-failed', /could not be loaded \(404\).*Refresh/i);
  });

  it('describes invalid fetched PNG bytes as a stored-reference failure, not a clipboard failure', async () => {
    let payload: Promise<Blob> | undefined;
    class FakeClipboardItem {
      constructor(items: Record<string, Blob | Promise<Blob>>) {
        payload = items['image/png'] as Promise<Blob>;
      }
    }
    const write = vi.fn(async () => {
      await payload;
    });
    await expectClipboardRejection(copyPredrawnPngToClipboard('/invalid.png', {
      clipboard: { write },
      ClipboardItem: FakeClipboardItem as PredrawnClipboardItemConstructor,
      fetch: vi.fn().mockResolvedValue(new Response(
        new Blob(['invalid png'], { type: 'image/png' }),
        { headers: { 'Content-Type': 'image/png' } },
      )),
    }), 'load-failed', /stored generation reference is labeled as PNG.*bytes are invalid/i);
  });
});

describe('copyPredrawnPngBlobToClipboard', () => {
  it('copies an exact rendered PNG through a promised ClipboardItem payload', async () => {
    const source = pngBlob(new Uint8Array([4, 5, 6]));
    let clipboardPayload: Promise<Blob> | undefined;
    class FakeClipboardItem implements PredrawnClipboardWriteItem {
      constructor(items: Record<string, Blob | Promise<Blob>>) {
        clipboardPayload = items['image/png'] as Promise<Blob>;
      }
    }
    const write = vi.fn(async () => {});

    const copied = await copyPredrawnPngBlobToClipboard(Promise.resolve(source), {
      clipboard: { write },
      ClipboardItem: FakeClipboardItem as PredrawnClipboardItemConstructor,
    });

    const clipboardBlob = await clipboardPayload!;
    expect(write).toHaveBeenCalledTimes(1);
    expect(await copied.arrayBuffer()).toEqual(await source.arrayBuffer());
    expect(await clipboardBlob.arrayBuffer()).toEqual(await source.arrayBuffer());
  });
});

describe('readPredrawnPngFromClipboard', () => {
  it('returns the exact image/png Blob from the async Clipboard API', async () => {
    const expected = pngBlob(new Uint8Array([5, 4, 3]));
    const getType = vi.fn().mockResolvedValue(expected);
    const result = await readPredrawnPngFromClipboard({
      clipboard: {
        read: vi.fn().mockResolvedValue([
          { types: ['text/plain'], getType: vi.fn() },
          { types: ['text/html', 'image/png'], getType },
        ]),
      },
    });

    expect(result).toBe(expected);
    expect(getType).toHaveBeenCalledWith('image/png');
  });

  it('reports an unsupported async clipboard reader', async () => {
    await expectClipboardRejection(
      readPredrawnPngFromClipboard({ clipboard: {} }),
      'unsupported',
      /Chrome.*HTTPS or localhost.*choose the AI-painted PNG/i,
    );
  });

  it('reports permission denial from clipboard.read', async () => {
    await expectClipboardRejection(readPredrawnPngFromClipboard({
      clipboard: {
        read: vi.fn().mockRejectedValue(new DOMException('denied', 'SecurityError')),
      },
    }), 'permission-denied', /Focus this tab.*allow clipboard access/i);
  });

  it('reports a clipboard with no PNG instead of accepting another image format', async () => {
    await expectClipboardRejection(readPredrawnPngFromClipboard({
      clipboard: {
        read: vi.fn().mockResolvedValue([
          { types: ['image/jpeg'], getType: vi.fn() },
        ]),
      },
    }), 'no-png', /Copy the AI-painted board image itself/i);
  });

  it('asks ClipboardItem for the exact advertised PNG MIME string', async () => {
    const expected = pngBlob();
    const getType = vi.fn().mockResolvedValue(expected);
    await readPredrawnPngFromClipboard({
      clipboard: {
        read: vi.fn().mockResolvedValue([
          { types: ['image/png; charset=binary'], getType },
        ]),
      },
    });
    expect(getType).toHaveBeenCalledWith('image/png; charset=binary');
  });
});

describe('native paste extraction', () => {
  it('extracts the exact PNG file from a DataTransfer item for Ctrl+V', async () => {
    const expected = pngBlob(new Uint8Array([6, 6, 6]));
    const result = await predrawnPngFromDataTransfer({
      items: [
        { kind: 'string', type: 'text/html', getAsFile: () => null },
        { kind: 'file', type: 'image/png', getAsFile: () => expected },
      ],
      files: [],
    });
    expect(result).toBe(expected);
  });

  it('uses the DataTransfer file list when item access is unavailable', async () => {
    const expected = pngBlob(new Uint8Array([7, 7, 7]));
    const result = await predrawnPngFromPasteEvent({
      clipboardData: {
        files: [
          new Blob(['not a png'], { type: 'image/jpeg' }),
          expected,
        ],
      },
    });
    expect(result).toBe(expected);
  });

  it('reports missing paste data and non-PNG clipboard contents clearly', async () => {
    await expectClipboardRejection(
      predrawnPngFromPasteEvent({ clipboardData: null }),
      'unsupported',
      /did not expose pasted image data.*Paste AI-painted board/i,
    );
    await expectClipboardRejection(predrawnPngFromDataTransfer({
      items: [{ kind: 'file', type: 'image/jpeg', getAsFile: () => new Blob() }],
    }), 'no-png', /does not contain a PNG image/i);
  });

  it('rejects a falsely labeled PNG without changing its bytes', async () => {
    const mislabeled = new Blob(['not png bytes'], { type: 'image/png' });
    await expectClipboardRejection(predrawnPngFromDataTransfer({
      files: [mislabeled],
    }), 'no-png', /labeled as PNG.*bytes are not a PNG/i);
  });
});

describe('pipeline PNG ingress lifecycle', () => {
  it('accepts only the latest operation for the currently selected slot', () => {
    const guard = createPredrawnPngIngressGuard('slot-a');
    const first = guard.begin('slot-a');
    const second = guard.begin('slot-a');

    expect(guard.isCurrent(first)).toBe(false);
    expect(guard.isCurrent(second)).toBe(true);

    guard.selectAttempt('slot-b');
    expect(guard.isCurrent(second)).toBe(false);
    expect(guard.isCurrent(guard.begin('slot-b'))).toBe(true);
  });

  it('rejects late completions after disposal and can reactivate under Strict Mode', () => {
    const guard = createPredrawnPngIngressGuard('slot-a');
    const operation = guard.begin('slot-a');
    guard.dispose();
    expect(guard.isCurrent(operation)).toBe(false);

    guard.activate();
    const remountedOperation = guard.begin('slot-a');
    expect(guard.isCurrent(remountedOperation)).toBe(true);
  });
});

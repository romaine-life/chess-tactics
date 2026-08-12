import { afterEach, describe, expect, it, vi } from 'vitest';

function memoryStorage(): Storage {
  const values = new Map<string, string>();
  return {
    get length() { return values.size; },
    clear: () => values.clear(),
    getItem: (key) => values.get(key) ?? null,
    key: (index) => [...values.keys()][index] ?? null,
    removeItem: (key) => { values.delete(key); },
    setItem: (key, value) => { values.set(key, value); },
  };
}

/** Deterministic bytes: the module must hex-encode exactly what it was handed. */
function countingCrypto(): Pick<Crypto, 'getRandomValues'> {
  let next = 0;
  return {
    getRandomValues: (<T extends ArrayBufferView | null>(array: T): T => {
      const bytes = array as unknown as Uint8Array;
      for (let index = 0; index < bytes.length; index += 1) bytes[index] = (next += 1) & 0xff;
      return array;
    }) as Crypto['getRandomValues'],
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});

describe('guest Run identity', () => {
  it('mints a 64-hex key and persists it under the guest key', async () => {
    const storage = memoryStorage();
    vi.stubGlobal('localStorage', storage);
    vi.stubGlobal('crypto', countingCrypto());

    const { ensureGuestRunKey } = await import('./guestIdentity');
    const key = ensureGuestRunKey();

    expect(key).toMatch(/^[0-9a-f]{64}$/);
    expect(storage.getItem('chess-tactics:guest-run-key:v1')).toBe(key);
  });

  it('reuses the key it already holds rather than minting a second identity', async () => {
    const storage = memoryStorage();
    vi.stubGlobal('localStorage', storage);
    vi.stubGlobal('crypto', countingCrypto());

    const { ensureGuestRunKey, readGuestRunKey } = await import('./guestIdentity');
    const first = ensureGuestRunKey();

    expect(ensureGuestRunKey()).toBe(first);
    expect(readGuestRunKey()).toBe(first);
  });

  it('does not mint on a read, so loading the game leaves nothing behind', async () => {
    const storage = memoryStorage();
    vi.stubGlobal('localStorage', storage);
    vi.stubGlobal('crypto', countingCrypto());

    const { readGuestRunKey } = await import('./guestIdentity');

    expect(readGuestRunKey()).toBeNull();
    expect(storage.length).toBe(0);
  });

  it('refuses a stored value that is not a full 32 bytes of hex', async () => {
    const storage = memoryStorage();
    storage.setItem('chess-tactics:guest-run-key:v1', 'not-a-key');
    vi.stubGlobal('localStorage', storage);
    vi.stubGlobal('crypto', countingCrypto());

    const { ensureGuestRunKey, readGuestRunKey } = await import('./guestIdentity');

    expect(readGuestRunKey()).toBeNull();
    // A malformed value is replaced rather than repaired: it names an identity nothing wrote.
    expect(ensureGuestRunKey()).toMatch(/^[0-9a-f]{64}$/);
  });

  it('has no weak fallback: without secure randomness there is no guest identity', async () => {
    const storage = memoryStorage();
    vi.stubGlobal('localStorage', storage);
    vi.stubGlobal('crypto', {});

    const { ensureGuestRunKey } = await import('./guestIdentity');

    // A guessable key would hand the guest's server row to whoever guessed it — strictly worse
    // than the local-only play it would be replacing.
    expect(ensureGuestRunKey()).toBeNull();
    expect(storage.length).toBe(0);
  });

  it('survives storage being unavailable without throwing', async () => {
    vi.stubGlobal('localStorage', undefined);
    vi.stubGlobal('crypto', countingCrypto());

    const { ensureGuestRunKey, readGuestRunKey, clearGuestRunKey } = await import('./guestIdentity');

    expect(readGuestRunKey()).toBeNull();
    expect(ensureGuestRunKey()).toBeNull();
    expect(() => clearGuestRunKey()).not.toThrow();
  });

  it('forgets the key once the account has adopted the row it named', async () => {
    const storage = memoryStorage();
    vi.stubGlobal('localStorage', storage);
    vi.stubGlobal('crypto', countingCrypto());

    const { clearGuestRunKey, ensureGuestRunKey, readGuestRunKey } = await import('./guestIdentity');
    ensureGuestRunKey();
    clearGuestRunKey();

    expect(readGuestRunKey()).toBeNull();
    expect(storage.getItem('chess-tactics:guest-run-key:v1')).toBeNull();
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createBlankLevel } from '../core/level';
import { createRun, type RunDocument, type RunWarSnapshot } from './model';

/**
 * A signed-out Run reaching the server at all (ADR-0588).
 *
 * Before guest identity these assertions could not be written: `queueRemoteSave` returned
 * immediately whenever the store was not joined to an account, so no signed-out mutation ever
 * left the browser. Each test here fails against that behaviour.
 */

const GUEST_KEY = 'a'.repeat(64);
const GUEST_KEY_STORAGE = 'chess-tactics:guest-run-key:v1';
const LOCAL_RUN_STORAGE = 'chess-tactics:active-run:v1';

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

function war(): RunWarSnapshot {
  return {
    id: 'war-guest-test',
    name: 'Guest Test War',
    description: 'A guest persistence fixture.',
    battles: [
      { level: createBlankLevel('battle-guest-test'), loot: false },
      { level: createBlankLevel('battle-guest-test-2'), loot: false },
    ],
  };
}

const signedOut = { user: { signed_in: false } };
const signedIn = { user: { signed_in: true, email: 'player@example.com' } };

const authSession = vi.hoisted(() => ({ startAuthSession: vi.fn() }));
const activeRun = vi.hoisted(() => ({
  loadActiveRun: vi.fn(),
  saveActiveRun: vi.fn(),
  deleteActiveRun: vi.fn(),
  adoptGuestRun: vi.fn(),
  craftActiveRunFromLink: vi.fn(),
  mintRunCraftLink: vi.fn(),
}));

vi.mock('../net/authSession', () => ({
  startAuthSession: authSession.startAuthSession,
  reportAuthSessionFailure: () => false,
}));
vi.mock('../net/activeRun', () => activeRun);

/** The store is held on a global so it survives Vite module replacement, so a test that wants a
 * fresh one has to take the previous store off that global too. */
async function freshStore(storage: Storage) {
  vi.stubGlobal('localStorage', storage);
  delete (globalThis as Record<string, unknown>).__ctActiveRunStore;
  vi.resetModules();
  return (await import('./store')).useActiveRun;
}

/** Let the store's queued save run. Saves are chained off the mutation rather than awaited by
 * it, so an assertion about the network has to give that chain a turn. */
const drain = () => new Promise((resolve) => { setTimeout(resolve, 0); });

beforeEach(() => {
  vi.clearAllMocks();
  activeRun.saveActiveRun.mockResolvedValue({ run: null, revision: 1, updated_at: null });
  activeRun.loadActiveRun.mockResolvedValue({ run: null, revision: 0, updated_at: null });
  activeRun.adoptGuestRun.mockResolvedValue({ run: null, revision: 0, updated_at: null, adopted: false });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
  delete (globalThis as Record<string, unknown>).__ctActiveRunStore;
});

describe('a signed-out Run persists to the server', () => {
  it('joins the guest document rather than staying browser-only', async () => {
    authSession.startAuthSession.mockResolvedValue(signedOut);
    const useActiveRun = await freshStore(memoryStorage());

    await useActiveRun.getState().hydrate();

    expect(useActiveRun.getState().remoteOwner).toBe('guest');
  });

  it('uploads a mutation made while signed out', async () => {
    authSession.startAuthSession.mockResolvedValue(signedOut);
    const useActiveRun = await freshStore(memoryStorage());
    await useActiveRun.getState().hydrate();

    const run = createRun(war(), 7);
    useActiveRun.getState().replace(run);
    await drain();

    expect(activeRun.saveActiveRun).toHaveBeenCalledTimes(1);
    expect((activeRun.saveActiveRun.mock.calls[0][0] as RunDocument).id).toBe(run.id);
  });

  it('reads nothing from the server before the browser holds an identity', async () => {
    authSession.startAuthSession.mockResolvedValue(signedOut);
    const useActiveRun = await freshStore(memoryStorage());

    await useActiveRun.getState().hydrate();

    // Loading the game is not playing it: the first save is what mints the key and its row.
    expect(activeRun.loadActiveRun).not.toHaveBeenCalled();
  });

  it('recovers the guest row when local storage has lost the Run', async () => {
    const storage = memoryStorage();
    storage.setItem(GUEST_KEY_STORAGE, GUEST_KEY);
    const stranded = createRun(war(), 11);
    activeRun.loadActiveRun.mockResolvedValue({ run: stranded, revision: 4, updated_at: null });
    authSession.startAuthSession.mockResolvedValue(signedOut);
    const useActiveRun = await freshStore(storage);

    await useActiveRun.getState().hydrate();

    expect(useActiveRun.getState().run?.id).toBe(stranded.id);
    expect(useActiveRun.getState().remoteRevision).toBe(4);
    expect(JSON.parse(storage.getItem(LOCAL_RUN_STORAGE) ?? 'null').id).toBe(stranded.id);
  });

  it('keeps the browser Run when it disagrees with the row, and pushes it up', async () => {
    const storage = memoryStorage();
    storage.setItem(GUEST_KEY_STORAGE, GUEST_KEY);
    const browserRun = createRun(war(), 21);
    storage.setItem(LOCAL_RUN_STORAGE, JSON.stringify(browserRun));
    activeRun.loadActiveRun.mockResolvedValue({ run: createRun(war(), 22), revision: 2, updated_at: null });
    authSession.startAuthSession.mockResolvedValue(signedOut);
    const useActiveRun = await freshStore(storage);

    await useActiveRun.getState().hydrate();
    await drain();

    // A guest row is written by exactly one browser, so that browser is the authority and there
    // is no second party to offer a choice to.
    expect(useActiveRun.getState().run?.id).toBe(browserRun.id);
    expect(useActiveRun.getState().adoptionConflict).toBeNull();
    expect(activeRun.saveActiveRun).toHaveBeenCalled();
  });

  it('stays local and reports nothing when the browser cannot mint an identity', async () => {
    authSession.startAuthSession.mockResolvedValue(signedOut);
    const storage = memoryStorage();
    const useActiveRun = await freshStore(storage);
    vi.stubGlobal('crypto', {});
    const { HttpError } = await import('../net/http');
    activeRun.saveActiveRun.mockRejectedValue(new HttpError('save', 401, 'sign_in_required'));

    await useActiveRun.getState().hydrate();
    useActiveRun.getState().replace(createRun(war(), 31));
    await drain();

    expect(useActiveRun.getState().remoteOwner).toBeNull();
    // Not an error to show anybody: this is the local-only play signed-out players always had.
    expect(useActiveRun.getState().persistenceError).toBeNull();
  });
});

describe('signing in inherits the guest Run', () => {
  it('adopts the guest row and forgets the key that named it', async () => {
    const storage = memoryStorage();
    storage.setItem(GUEST_KEY_STORAGE, GUEST_KEY);
    const guestRun = createRun(war(), 41);
    activeRun.adoptGuestRun.mockResolvedValue({ run: guestRun, revision: 3, updated_at: null, adopted: true });
    activeRun.loadActiveRun.mockResolvedValue({ run: guestRun, revision: 3, updated_at: null });
    authSession.startAuthSession.mockResolvedValue(signedIn);
    const useActiveRun = await freshStore(storage);

    await useActiveRun.getState().hydrate();

    expect(activeRun.adoptGuestRun).toHaveBeenCalledTimes(1);
    expect(useActiveRun.getState().remoteOwner).toBe('account');
    expect(useActiveRun.getState().run?.id).toBe(guestRun.id);
    // The row is the account's now; a key that could still write it would be authority the
    // player no longer holds.
    expect(storage.getItem(GUEST_KEY_STORAGE)).toBeNull();
  });

  it('keeps the key when adoption fails, so the next hydrate can retry', async () => {
    const storage = memoryStorage();
    storage.setItem(GUEST_KEY_STORAGE, GUEST_KEY);
    activeRun.adoptGuestRun.mockRejectedValue(new Error('unreachable'));
    authSession.startAuthSession.mockResolvedValue(signedIn);
    const useActiveRun = await freshStore(storage);

    await useActiveRun.getState().hydrate();

    expect(storage.getItem(GUEST_KEY_STORAGE)).toBe(GUEST_KEY);
    // Signing in is not blocked by a guest row that could not be moved yet.
    expect(useActiveRun.getState().remoteOwner).toBe('account');
  });

  it('asks for no adoption when the browser never played as a guest', async () => {
    authSession.startAuthSession.mockResolvedValue(signedIn);
    const useActiveRun = await freshStore(memoryStorage());

    await useActiveRun.getState().hydrate();

    expect(activeRun.adoptGuestRun).not.toHaveBeenCalled();
  });
});

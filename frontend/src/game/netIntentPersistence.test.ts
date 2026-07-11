import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearPersistedNetIntent, loadPersistedNetIntent, persistNetIntent } from './netIntentPersistence';

function memoryStorage(): Storage {
  const values = new Map<string, string>();
  return {
    get length() { return values.size; },
    clear: () => values.clear(),
    getItem: (key) => values.get(key) ?? null,
    key: (index) => Array.from(values.keys())[index] ?? null,
    removeItem: (key) => { values.delete(key); },
    setItem: (key, value) => { values.set(key, value); },
  };
}

describe('durable net move intent', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal('localStorage', memoryStorage());
    vi.setSystemTime(new Date('2026-07-11T12:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('survives reload-shaped reads and clears only the matching identity', () => {
    const intent = {
      lobbyId: 'lobby-1',
      localSide: 'enemy' as const,
      intentId: 'intent-one',
      expectedMoveCount: 7,
      pieceId: 'enemy-pawn',
      move: { x: 4, y: 6, promotion: 'knight' as const },
      createdAt: Date.now(),
    };
    expect(persistNetIntent(intent)).toBe(true);
    expect(loadPersistedNetIntent('lobby-1', 'enemy')).toMatchObject(intent);
    expect(loadPersistedNetIntent('lobby-1', 'player')).toBeNull();

    // A different signed-in seat cannot consume or erase the original seat's identity.
    clearPersistedNetIntent('lobby-1', 'newer-intent');
    expect(loadPersistedNetIntent('lobby-1', 'enemy')).not.toBeNull();
    clearPersistedNetIntent('lobby-1', 'intent-one');
    expect(loadPersistedNetIntent('lobby-1', 'enemy')).toBeNull();
  });

  it('drops malformed and expired records instead of replaying them', () => {
    localStorage.setItem('ct:net-intent:lobby-2:player', '{broken');
    expect(loadPersistedNetIntent('lobby-2', 'player')).toBeNull();

    persistNetIntent({
      lobbyId: 'lobby-3',
      localSide: 'player',
      intentId: 'old-intent',
      expectedMoveCount: 0,
      pieceId: 'pawn',
      move: { x: 1, y: 1 },
      createdAt: Date.now() - 25 * 60 * 60 * 1000,
    });
    expect(loadPersistedNetIntent('lobby-3', 'player')).toBeNull();
  });
});

import { afterEach, describe, expect, it, vi } from 'vitest';
import { createBlankLevel } from '../core/level';
import { CURRENT_RUN_SAVE_VERSION, createRun, runCardUnitIds, type RunDocument, type RunWarSnapshot } from './model';

function legacyCards(cards: RunDocument['cards']) {
  return cards.map((card) => {
    const { unitSeats: _unitSeats, ...legacy } = card;
    return { ...legacy, unitIds: runCardUnitIds(card) };
  });
}

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
    id: 'war-store-test',
    name: 'Store Test War',
    description: 'A Run persistence fixture.',
    battles: [{ level: createBlankLevel('battle-store-test'), loot: false }],
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});

describe('Run browser persistence', () => {
  it('chains a version-16 Shop save into the sole current Sectio shape on first read', async () => {
    const storage = memoryStorage();
    const current = createRun(war(), 73);
    const { runSaveVersion: _runSaveVersion, sectio, ...version16 } = current;
    const {
      adlectedCardOfferIds,
      alienatedUnits,
      ...version16Shop
    } = sectio!;
    storage.setItem('chess-tactics:active-run:v1', JSON.stringify({
      ...version16,
      cards: legacyCards(current.cards),
      formatVersion: 16,
      phase: 'shop',
      shop: {
        ...version16Shop,
        entrySnapshot: {
          ...version16Shop.entrySnapshot,
          cards: legacyCards(version16Shop.entrySnapshot.cards),
        },
        purchasedCardOfferIds: adlectedCardOfferIds,
        soldUnits: alienatedUnits,
      },
    }));
    vi.stubGlobal('localStorage', storage);

    const { useActiveRun } = await import('./store');
    const persisted = JSON.parse(storage.getItem('chess-tactics:active-run:v1') ?? 'null');

    expect(useActiveRun.getState().run).toEqual(current);
    expect(persisted.runSaveVersion).toBe(CURRENT_RUN_SAVE_VERSION);
    expect(persisted).not.toHaveProperty('formatVersion');
    expect(persisted).not.toHaveProperty('shop');
    expect(persisted.phase).toBe('sectio');
  });
});

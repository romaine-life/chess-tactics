import { afterEach, describe, expect, it, vi } from 'vitest';
import { createBlankLevel } from '../core/level';
import { CURRENT_RUN_SAVE_VERSION, createRun, type RunWarSnapshot } from './model';

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
  it('rewrites a version-16 save into the sole current storage shape on first read', async () => {
    const storage = memoryStorage();
    const current = createRun(war(), 73);
    const { runSaveVersion: _runSaveVersion, ...version16 } = current;
    storage.setItem('chess-tactics:active-run:v1', JSON.stringify({
      ...version16,
      formatVersion: 16,
    }));
    vi.stubGlobal('localStorage', storage);

    const { useActiveRun } = await import('./store');
    const persisted = JSON.parse(storage.getItem('chess-tactics:active-run:v1') ?? 'null');

    expect(useActiveRun.getState().run).toEqual(current);
    expect(persisted.runSaveVersion).toBe(CURRENT_RUN_SAVE_VERSION);
    expect(persisted).not.toHaveProperty('formatVersion');
  });
});

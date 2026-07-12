// The run library's pure helpers: upsertTdRun (the autosave's write path — first
// save records a run, later saves update it in place preserving identity/adoption)
// and migrateTdRuns (the retired single-document field becomes Run 1).

import { describe, it, expect } from 'vitest';
import { freshTdSession, upsertTdRun, type TdAdoptionRecord, type TdRunDoc, type TdRunsDoc, type TdSessionDoc } from './tdSession';
import { migrateTdRuns, sanitizeTdRuns, type BooksBlob } from './openingBooks';
import type { TrainOptions } from '../game/tdValues';

const OPTS: TrainOptions = { games: 10, seed: 1, maxPlies: 20 };

const payloadOf = (opts: TrainOptions, extra?: Partial<TdSessionDoc>): TdSessionDoc => ({
  opts, seedCount: 1, session: freshTdSession(opts), probeLog: [], summary: null, kept: false, ...extra,
});

const adoptionOf = (marker: number): TdAdoptionRecord => ({
  at: `t${marker}`, vector: [marker], pieceValues: {} as TdAdoptionRecord['pieceValues'],
  fromGames: marker, seeds: [1], source: 'live-weights',
});

describe('upsertTdRun', () => {
  it('a first save records Run 1 in a fresh library and points activeId at it', () => {
    const { lib, run } = upsertTdRun(undefined, payloadOf(OPTS), null);
    expect(run.id).toBe(1);
    expect(run.name).toBe('Run 1');
    expect(typeof run.createdAt).toBe('string');
    expect(lib).toEqual({ nextId: 2, activeId: 1, runs: [run] });
  });

  it('a save with no attached run records a NEW run beside the existing ones', () => {
    const first = upsertTdRun(undefined, payloadOf(OPTS), null);
    const second = upsertTdRun(first.lib, payloadOf({ ...OPTS, games: 100 }), null);
    expect(second.run.id).toBe(2);
    expect(second.run.name).toBe('Run 2');
    expect(second.lib.runs.map((r) => r.id)).toEqual([1, 2]);
    expect(second.lib.activeId).toBe(2);
    expect(second.lib.nextId).toBe(3);
    // The shelved run is untouched.
    expect(second.lib.runs[0]).toEqual(first.run);
  });

  it('a save into an existing run updates in place, preserving name/createdAt/adoption', () => {
    const seeded = upsertTdRun(undefined, payloadOf(OPTS, { adoption: adoptionOf(1) }), null);
    const renamed: TdRunsDoc = {
      ...seeded.lib,
      runs: seeded.lib.runs.map((r) => ({ ...r, name: 'The 600-game baseline' })),
    };
    const { lib, run } = upsertTdRun(renamed, payloadOf(OPTS, { kept: true }), 1);
    expect(run.id).toBe(1);
    expect(run.name).toBe('The 600-game baseline');
    expect(run.createdAt).toBe(seeded.run.createdAt);
    expect(run.adoption).toEqual(adoptionOf(1));   // plain autosave payload never clears it
    expect(run.kept).toBe(true);
    expect(lib.nextId).toBe(2);                    // no allocation
    expect(lib.runs).toHaveLength(1);
  });

  it('a payload that carries an adoption (the Adopt path) replaces the run’s record', () => {
    const seeded = upsertTdRun(undefined, payloadOf(OPTS, { adoption: adoptionOf(1) }), null);
    const { run } = upsertTdRun(seeded.lib, payloadOf(OPTS, { adoption: adoptionOf(2) }), 1);
    expect(run.adoption).toEqual(adoptionOf(2));
  });

  it('an attached id that no longer exists (run deleted elsewhere) records a new run instead of resurrecting it', () => {
    const seeded = upsertTdRun(undefined, payloadOf(OPTS), null);
    const emptied: TdRunsDoc = { ...seeded.lib, runs: [] };
    const { lib, run } = upsertTdRun(emptied, payloadOf(OPTS), 1);
    expect(run.id).toBe(2);
    expect(lib.runs.map((r) => r.id)).toEqual([2]);
  });
});

describe('migrateTdRuns', () => {
  const legacy = payloadOf(OPTS, { kept: true, adoption: adoptionOf(600) });

  it('wraps the retired tdSession field as Run 1 (contents intact), hoists its adoption to the blob-level live slot, and drops the field', () => {
    const blob: BooksBlob = { nextId: 1, books: [], tdSession: legacy };
    const out = migrateTdRuns(blob);
    expect(out.tdSession).toBeUndefined();
    expect(out.tdRuns).toEqual({ nextId: 2, activeId: 1, runs: [{ id: 1, name: 'Run 1', ...legacy }] });
    expect(out.tdAdoption).toEqual({ ...adoptionOf(600), runId: 1, runName: 'Run 1' });
  });

  it('is a no-op without the legacy field', () => {
    const blob: BooksBlob = { nextId: 1, books: [] };
    expect(migrateTdRuns(blob)).toBe(blob);
  });

  it('drops a stale legacy field when a library already exists (never double-migrates)', () => {
    const lib: TdRunsDoc = { nextId: 3, activeId: 2, runs: [{ id: 2, name: 'Run 2', ...payloadOf(OPTS) }] };
    const out = migrateTdRuns({ nextId: 1, books: [], tdSession: legacy, tdRuns: lib });
    expect(out.tdSession).toBeUndefined();
    expect(out.tdRuns).toEqual(lib);
    expect(out.tdAdoption).toBeUndefined();
  });

  it('drops a malformed legacy doc instead of migrating it (the old code ignored it too)', () => {
    const mangled = { opts: { games: 10 } } as unknown as TdSessionDoc; // no session.train
    const out = migrateTdRuns({ nextId: 1, books: [], tdSession: mangled });
    expect(out.tdSession).toBeUndefined();
    expect(out.tdRuns).toBeUndefined();
  });
});

describe('sanitizeTdRuns', () => {
  it('drops runs the pane cannot render and keeps the rest (same object when clean)', () => {
    const good: TdRunDoc = { id: 1, name: 'Run 1', ...payloadOf(OPTS) };
    const mangled = { id: 2, name: 'Run 2', opts: OPTS, session: {} } as unknown as TdRunDoc;
    const noId = { name: 'ghost', ...payloadOf(OPTS) } as unknown as TdRunDoc;
    const dirty: TdRunsDoc = { nextId: 4, activeId: 2, runs: [good, mangled, noId] };
    expect(sanitizeTdRuns(dirty).runs).toEqual([good]);
    const clean: TdRunsDoc = { nextId: 2, activeId: 1, runs: [good] };
    expect(sanitizeTdRuns(clean)).toBe(clean);
  });
});

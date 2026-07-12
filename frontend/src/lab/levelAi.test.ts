// The level-AI document's pure helpers: an AI APPROACH is a named recipe with its
// OWN parameter slot — set/clear repoint the level without touching sibling
// approaches — and the retired bare-vector adoption fields migrate in on load.

import { describe, it, expect } from 'vitest';
import { MATERIAL_SEARCH, type AiApproachId } from '../game/aiApproach';
import {
  clearLevelAiApproach, migrateLevelAi, pointLevelAi, sanitizeLevelAi, setLevelAiApproach,
  type BooksBlob, type LevelAiDoc,
} from './openingBooks';
import type { TdAdoptionRecord } from './tdSession';

const rec = (marker: number, vector: number[]): TdAdoptionRecord => ({
  at: `t${marker}`, vector, pieceValues: {} as TdAdoptionRecord['pieceValues'],
  fromGames: marker, seeds: [1], source: 'live-weights', runId: 1, runName: 'Run 1',
});

const bare: BooksBlob = { nextId: 1, books: [] };

describe('setLevelAiApproach / clearLevelAiApproach', () => {
  it('adopting points the level at the approach and stores its config (vector + provenance)', () => {
    const out = setLevelAiApproach(bare, MATERIAL_SEARCH, { vector: [1, 2], adoption: rec(600, [1, 2]) });
    expect(out.levelAi).toEqual({
      live: 'material-search',
      approaches: { 'material-search': { vector: [1, 2], adoption: rec(600, [1, 2]) } },
    });
  });

  it('re-adopting replaces the approach config whole — a Training-tab set (no record) correctly drops the values-pane record', () => {
    const fromPane = setLevelAiApproach(bare, MATERIAL_SEARCH, { vector: [1], adoption: rec(1, [1]) });
    const fromTab = setLevelAiApproach(fromPane, MATERIAL_SEARCH, { vector: [2] });
    expect(fromTab.levelAi?.approaches['material-search']).toEqual({ vector: [2] });
  });

  it("a sibling approach's config survives repointing — switching is repointing, never overwriting", () => {
    // Only one id exists today; the invariant under test is exactly what a second id relies on.
    const future = 'future-approach' as AiApproachId;
    const withFuture = setLevelAiApproach(bare, future, { vector: [9, 9] });
    const repointed = setLevelAiApproach(withFuture, MATERIAL_SEARCH, { vector: [1] });
    expect(repointed.levelAi?.live).toBe('material-search');
    expect(repointed.levelAi?.approaches[future]).toEqual({ vector: [9, 9] });
    // Clearing the live one falls back without touching the sibling…
    const cleared = clearLevelAiApproach(repointed, MATERIAL_SEARCH);
    expect(cleared.levelAi).toEqual({ approaches: { [future]: { vector: [9, 9] } } });
    // …and clearing a NON-live sibling must preserve `live` and its config — a
    // clear-anything-unsets-live regression would knock the level back to stock.
    const siblingCleared = clearLevelAiApproach(repointed, future);
    expect(siblingCleared.levelAi).toEqual({
      live: 'material-search',
      approaches: { 'material-search': { vector: [1] } },
    });
  });

  it('clearing the only approach removes the document; clearing with none set is a no-op', () => {
    const set = setLevelAiApproach(bare, MATERIAL_SEARCH, { vector: [1] });
    expect(clearLevelAiApproach(set, MATERIAL_SEARCH).levelAi).toBeUndefined();
    expect(clearLevelAiApproach(bare, MATERIAL_SEARCH)).toBe(bare);
  });
});

describe('pointLevelAi — the approach picker verb (repoint, never destroy)', () => {
  const future = 'future-approach' as AiApproachId;

  it('switching to stock unsets live but KEEPS every config, so switching back restores the values', () => {
    const set = setLevelAiApproach(bare, MATERIAL_SEARCH, { vector: [1, 2] });
    const toStock = pointLevelAi(set, null);
    expect(toStock.levelAi).toEqual({ approaches: { 'material-search': { vector: [1, 2] } } });
    const back = pointLevelAi(toStock, MATERIAL_SEARCH);
    expect(back.levelAi).toEqual({ live: 'material-search', approaches: { 'material-search': { vector: [1, 2] } } });
  });

  it('repoints between two adopted approaches without touching either config', () => {
    const both = setLevelAiApproach(
      setLevelAiApproach(bare, future, { vector: [9] }),
      MATERIAL_SEARCH, { vector: [1] },
    );
    const toFuture = pointLevelAi(both, future);
    expect(toFuture.levelAi?.live).toBe(future);
    const expected: Record<string, { vector: number[] }> = { 'future-approach': { vector: [9] }, 'material-search': { vector: [1] } };
    expect(toFuture.levelAi?.approaches).toEqual(expected);
  });

  it('pointing at an approach with no config on this level is a no-op (nothing to put in force)', () => {
    expect(pointLevelAi(bare, MATERIAL_SEARCH)).toBe(bare);
    const set = setLevelAiApproach(bare, MATERIAL_SEARCH, { vector: [1] });
    expect(pointLevelAi(set, future)).toBe(set);           // future has no config
    expect(pointLevelAi(set, MATERIAL_SEARCH)).toBe(set);  // already live
    expect(pointLevelAi(bare, null)).toBe(bare);           // already stock
  });
});

describe('migrateLevelAi', () => {
  it('folds adoptedWeights + its matching record into a LIVE material-search config and drops the retired fields', () => {
    const out = migrateLevelAi({ ...bare, adoptedWeights: [1, 2], tdAdoption: rec(600, [1, 2]) });
    expect(out.adoptedWeights).toBeUndefined();
    expect(out.tdAdoption).toBeUndefined();
    expect(out.levelAi).toEqual({
      live: 'material-search',
      approaches: { 'material-search': { vector: [1, 2], adoption: rec(600, [1, 2]) } },
    });
  });

  it('a record whose vector does not match the adopted one migrates WITHOUT the record (the old read path ignored it too)', () => {
    const out = migrateLevelAi({ ...bare, adoptedWeights: [1, 2], tdAdoption: rec(600, [3]) });
    expect(out.levelAi).toEqual({ live: 'material-search', approaches: { 'material-search': { vector: [1, 2] } } });
  });

  it('an orphaned record without a vector just drops (it was not in force)', () => {
    const out = migrateLevelAi({ ...bare, tdAdoption: rec(600, [1]) });
    expect(out.tdAdoption).toBeUndefined();
    expect(out.levelAi).toBeUndefined();
  });

  it('a blob that already has levelAi keeps it and drops the stale retired fields (never double-migrates)', () => {
    const doc: LevelAiDoc = { live: 'material-search', approaches: { 'material-search': { vector: [7] } } };
    const out = migrateLevelAi({ ...bare, levelAi: doc, adoptedWeights: [1], tdAdoption: rec(1, [1]) });
    expect(out.levelAi).toEqual(doc);
    expect(out.adoptedWeights).toBeUndefined();
    expect(out.tdAdoption).toBeUndefined();
  });

  it('is a no-op (same object) without the retired fields', () => {
    expect(migrateLevelAi(bare)).toBe(bare);
  });

  it('drops a corrupted non-all-numeric vector instead of migrating junk the sanitizer would reject', () => {
    const out = migrateLevelAi({ ...bare, adoptedWeights: [1, null, 3] as unknown as number[] });
    expect(out.adoptedWeights).toBeUndefined();
    expect(out.levelAi).toBeUndefined();
  });
});

describe('sanitizeLevelAi', () => {
  it('drops configs without an all-numeric vector, unsets live pointing at a missing approach, same object when clean', () => {
    const clean: LevelAiDoc = { live: 'material-search', approaches: { 'material-search': { vector: [1] } } };
    expect(sanitizeLevelAi(clean)).toBe(clean);

    const mangled = {
      live: 'material-search',
      approaches: { 'material-search': { vector: ['x'] }, ghost: { vector: [2] } },
    } as unknown as LevelAiDoc;
    expect(sanitizeLevelAi(mangled)).toEqual({ approaches: { ghost: { vector: [2] } } });

    const empty = { approaches: { 'material-search': {} } } as unknown as LevelAiDoc;
    expect(sanitizeLevelAi(empty)).toBeUndefined();
  });

  it("unsets a live id this build's registry does not know (a newer client's approach) but preserves its config — the level degrades to stock, never crashes the audit box", () => {
    const foreign = { live: 'psqt', approaches: { psqt: { vector: [2, 3] } } } as unknown as LevelAiDoc;
    expect(sanitizeLevelAi(foreign)).toEqual({ approaches: { psqt: { vector: [2, 3] } } });
    // The empty-string variant slips past truthiness checks — same rule applies.
    const emptyId = { live: '', approaches: { '': { vector: [2] } } } as unknown as LevelAiDoc;
    expect(sanitizeLevelAi(emptyId)).toEqual({ approaches: { '': { vector: [2] } } });
  });

  it('strips a malformed adoption record (no numeric vector) but keeps the config — the audit read compares record vectors in render', () => {
    const doc = {
      live: 'material-search',
      approaches: { 'material-search': { vector: [1, 2], adoption: { at: 't' } } },
    } as unknown as LevelAiDoc;
    expect(sanitizeLevelAi(doc)).toEqual({
      live: 'material-search',
      approaches: { 'material-search': { vector: [1, 2] } },
    });
  });
});

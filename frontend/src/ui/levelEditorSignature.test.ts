import { describe, expect, it } from 'vitest';
import { editorBoardToLevel, levelToEditorBoard } from '../core/levelBoard';
import type { EditorBoard } from './boardCode';
import {
  draftBaselineMatchesLevel,
  levelEditorLevelSignature,
  normalizedLevelEditorSignature,
} from './levelEditorSignature';

const emptyBoard = (overrides: Partial<EditorBoard> = {}): EditorBoard => ({
  cols: 4,
  rows: 4,
  playerFaction: null,
  cells: {},
  units: {},
  doodads: {},
  props: {},
  cover: {},
  features: {},
  featureCuts: {},
  featureExits: {},
  zones: {},
  ...overrides,
});

describe('level editor persisted signatures', () => {
  it('matches the editor candidate normalization for a saved level', () => {
    const level = editorBoardToLevel(emptyBoard(), { id: 'l1', name: 'Saved board' });
    expect(normalizedLevelEditorSignature(level)).toBe(levelEditorLevelSignature(level));
    expect(draftBaselineMatchesLevel(normalizedLevelEditorSignature(level), level)).toBe(true);
  });

  it('normalizes a legacy level without boardCode before comparing a draft', () => {
    const saved = editorBoardToLevel(emptyBoard(), { id: 'l2', name: 'Legacy board' });
    const legacy = { ...saved, boardCode: undefined };
    const normalized = normalizedLevelEditorSignature(legacy);
    expect(normalized).not.toBe(levelEditorLevelSignature(legacy));
    expect(draftBaselineMatchesLevel(normalized, legacy)).toBe(true);
  });

  it('matches the untouched editor projection even when the stored signature differs', () => {
    const encoded = editorBoardToLevel(emptyBoard(), { id: 'l-projected', name: 'Projected board' });
    const stored = { ...encoded, boardCode: undefined };
    const projected = editorBoardToLevel(levelToEditorBoard(stored), {
      id: stored.id,
      name: stored.name,
      objective: stored.objective,
    });

    expect(levelEditorLevelSignature(stored)).not.toBe(levelEditorLevelSignature(projected));
    expect(normalizedLevelEditorSignature(stored)).toBe(levelEditorLevelSignature(projected));
  });

  it('keeps authored subterrain in the cloud-comparison projection', () => {
    const level = editorBoardToLevel(emptyBoard({
      cols: 2,
      rows: 1,
      cells: { '0,0': 'grass-surf-0', '1,0': 'grass-surf-0' },
      subterrain: { '0,0:south': 'roots', '1,0:east': 'bedrock' },
    }), { id: 'l-subterrain', name: 'Subterrain board' });

    expect(levelToEditorBoard(level).subterrain).toEqual({
      '0,0:south': 'roots',
      '1,0:east': 'bedrock',
    });
    expect(normalizedLevelEditorSignature(level)).toBe(levelEditorLevelSignature(level));
  });

  it('rejects a draft baseline after the persisted level changes', () => {
    const before = editorBoardToLevel(emptyBoard(), { id: 'l3', name: 'Before' });
    const after = { ...before, name: 'After' };
    expect(draftBaselineMatchesLevel(normalizedLevelEditorSignature(before), after)).toBe(false);
  });
});

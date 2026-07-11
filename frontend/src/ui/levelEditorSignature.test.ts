import { describe, expect, it } from 'vitest';
import { editorBoardToLevel } from '../core/levelBoard';
import type { EditorBoard } from './boardCode';
import {
  draftBaselineMatchesLevel,
  levelEditorLevelSignature,
  normalizedLevelEditorSignature,
} from './levelEditorSignature';

const emptyBoard = (): EditorBoard => ({
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

  it('rejects a draft baseline after the persisted level changes', () => {
    const before = editorBoardToLevel(emptyBoard(), { id: 'l3', name: 'Before' });
    const after = { ...before, name: 'After' };
    expect(draftBaselineMatchesLevel(normalizedLevelEditorSignature(before), after)).toBe(false);
  });
});

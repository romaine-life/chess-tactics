import { describe, expect, it } from 'vitest';
import { decodeBoard, encodeBoard, type EditorBoard } from './boardCode';
import { DEFAULT_SURVIVE_TURNS } from '../core/objectives';
import {
  hashDraftSeed,
  levelEditorDraftKey,
  parseLevelEditorDraft,
  serializeLevelEditorDraft,
  type LevelEditorDraft,
} from './levelEditorDraft';

const baseBoard = (over: Partial<EditorBoard> = {}): EditorBoard => ({
  cols: 6,
  rows: 6,
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
  ...over,
});

const baseDraft = (over: Partial<LevelEditorDraft> = {}): LevelEditorDraft => ({
  savedAt: 123,
  savedSig: 'clean-baseline',
  board: baseBoard({ cells: { '0,0': 'grass-surf-0' } }),
  levelName: 'Bridge sketch',
  objective: 'reach',
  placement: 'random',
  surviveTurns: 7,
  roster: { player: { rook: 1 }, enemy: { pawn: 3 } },
  ...over,
});

describe('levelEditorDraftKey', () => {
  it('scopes drafts by campaign level, standalone editor, or board-link seed', () => {
    const boardCode = encodeBoard(baseBoard({ cells: { '1,1': 'sand-surf-0' } }));
    expect(levelEditorDraftKey({ levelId: 'l42' })).toBe('ct:level-editor-draft:v1:level:l42');
    expect(levelEditorDraftKey({})).toBe('ct:level-editor-draft:v1:standalone');
    expect(levelEditorDraftKey({ levelId: 'l42', boardCode })).toBe(`ct:level-editor-draft:v1:board:${hashDraftSeed(boardCode)}`);
  });
});

describe('level editor draft codec', () => {
  it('round-trips the board and edit metadata through a compact board code', () => {
    const parsed = parseLevelEditorDraft(serializeLevelEditorDraft(baseDraft()))!;
    expect(parsed.levelName).toBe('Bridge sketch');
    expect(parsed.objective).toBe('reach');
    expect(parsed.placement).toBe('random');
    expect(parsed.surviveTurns).toBe(7);
    expect(parsed.roster).toEqual({ player: { rook: 1 }, enemy: { pawn: 3 } });
    expect(encodeBoard(parsed.board)).toBe(encodeBoard(baseDraft().board));
  });

  it('returns null for corrupt JSON or an undecodable board code', () => {
    expect(parseLevelEditorDraft('not json')).toBeNull();
    expect(parseLevelEditorDraft(JSON.stringify({ v: 1, savedSig: 'x', boardCode: 'nope' }))).toBeNull();
  });

  it('sanitizes optional edit metadata while preserving the board', () => {
    const raw = JSON.stringify({
      v: 1,
      savedAt: 1,
      savedSig: 'baseline',
      boardCode: encodeBoard(baseBoard({ units: { '2,2': { unitId: 'rook', direction: 'south', faction: 'navy-blue' } } })),
      levelName: '',
      objective: 'future-mode',
      placement: 'fixed',
      surviveTurns: -1,
      roster: { player: { rook: 1.8, pawn: 0 }, enemy: 'bad' },
    });
    const parsed = parseLevelEditorDraft(raw)!;
    expect(parsed.levelName).toBe('Untitled level');
    expect(parsed.objective).toBe('capture-all');
    expect(parsed.surviveTurns).toBe(DEFAULT_SURVIVE_TURNS);
    expect(parsed.roster).toEqual({ player: { rook: 1 }, enemy: {} });
    expect(decodeBoard(encodeBoard(parsed.board))?.units['2,2']).toEqual({ unitId: 'rook', direction: 'south', faction: 'navy-blue' });
  });
});

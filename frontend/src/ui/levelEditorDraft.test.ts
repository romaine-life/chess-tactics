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

  it('round-trips an authored battle clock, and stays untimed when absent', () => {
    const timed = parseLevelEditorDraft(serializeLevelEditorDraft(baseDraft({ timeControl: { initialSeconds: 300, incrementSeconds: 2 } })))!;
    expect(timed.timeControl).toEqual({ initialSeconds: 300, incrementSeconds: 2 });
    const untimed = parseLevelEditorDraft(serializeLevelEditorDraft(baseDraft()))!;
    expect(untimed.timeControl).toBeUndefined();
  });

  it('drops an out-of-range or malformed time control (restores untimed)', () => {
    const withTc = (timeControl: unknown): LevelEditorDraft => {
      const raw = JSON.parse(serializeLevelEditorDraft(baseDraft())) as Record<string, unknown>;
      raw.timeControl = timeControl;
      return parseLevelEditorDraft(JSON.stringify(raw))!;
    };
    expect(withTc({ initialSeconds: 0, incrementSeconds: 0 }).timeControl).toBeUndefined();
    expect(withTc({ initialSeconds: 2.5, incrementSeconds: 0 }).timeControl).toBeUndefined();
    expect(withTc({ initialSeconds: 300, incrementSeconds: -1 }).timeControl).toBeUndefined();
    expect(withTc({ initialSeconds: 300 }).timeControl).toBeUndefined();
    expect(withTc('blitz').timeControl).toBeUndefined();
    expect(withTc({ initialSeconds: 180, incrementSeconds: 5 }).timeControl).toEqual({ initialSeconds: 180, incrementSeconds: 5 });
  });

  it('round-trips authored victory rules, and stays undefined (preset) when absent', () => {
    const victory = [
      { if: [{ kind: 'eliminate' as const, side: 'player' as const }, { kind: 'turnLimit' as const, turns: 10 }], do: [{ kind: 'lose' as const, side: 'player' as const }] },
      { if: [{ kind: 'reach' as const, side: 'player' as const }], do: [{ kind: 'win' as const, side: 'player' as const }] },
    ];
    const custom = parseLevelEditorDraft(serializeLevelEditorDraft(baseDraft({ victory })))!;
    expect(custom.victory).toEqual(victory);
    const preset = parseLevelEditorDraft(serializeLevelEditorDraft(baseDraft()))!;
    expect(preset.victory).toBeUndefined();
  });

  it('drops a non-array victory (e.g. a pre-ADR-0064 draft) back to the preset', () => {
    const withVictory = (victory: unknown): LevelEditorDraft => {
      const raw = JSON.parse(serializeLevelEditorDraft(baseDraft())) as Record<string, unknown>;
      raw.victory = victory;
      return parseLevelEditorDraft(JSON.stringify(raw))!;
    };
    expect(withVictory({ win: [], lose: [] }).victory).toBeUndefined();
    expect(withVictory('nope').victory).toBeUndefined();
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

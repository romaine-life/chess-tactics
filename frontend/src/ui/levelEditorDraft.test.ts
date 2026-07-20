import { afterEach, describe, expect, it, vi } from 'vitest';
import { decodeBoard, encodeBoard, type EditorBoard } from './boardCode';
import { DEFAULT_SURVIVE_TURNS } from '../core/objectives';
import {
  acknowledgeScopedLevelEditorRecoveryConflict,
  clearScopedLevelEditorDraft,
  hashDraftSeed,
  levelEditorDraftKey,
  parseLevelEditorDraft,
  readScopedLevelEditorDraft,
  rebaseScopedLevelEditorDraft,
  scopedLevelEditorDraftKey,
  serializeLevelEditorDraft,
  writeScopedLevelEditorDraft,
  writeLevelEditorDraft,
  type LevelEditorDraft,
} from './levelEditorDraft';

afterEach(() => vi.unstubAllGlobals());

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
  surviveTurns: 7,
  ...over,
});

const stubLocalStorage = () => {
  const values = new Map<string, string>();
  const localStorage = {
    getItem: vi.fn((key: string) => values.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => { values.set(key, value); }),
    removeItem: vi.fn((key: string) => { values.delete(key); }),
  };
  vi.stubGlobal('window', { localStorage });
  return { localStorage, values };
};

describe('levelEditorDraftKey', () => {
  it('scopes drafts by campaign level, standalone editor, or board-link seed', () => {
    const boardCode = encodeBoard(baseBoard({ cells: { '1,1': 'sand-surf-0' } }));
    expect(levelEditorDraftKey({ levelId: 'l42' })).toBe('ct:level-editor-draft:v1:level:l42');
    expect(levelEditorDraftKey({})).toBe('ct:level-editor-draft:v1:standalone');
    expect(levelEditorDraftKey({ levelId: 'l42', boardCode })).toBe('ct:level-editor-draft:v1:level:l42');
    expect(levelEditorDraftKey({ boardCode })).toBe(`ct:level-editor-draft:v1:board:${hashDraftSeed(boardCode)}`);
  });

  it('binds cloud recovery to both the account and opaque document identity', () => {
    expect(levelEditorDraftKey({
      levelId: 'l42',
      boardCode: 'ignored-for-cloud-docs',
      documentId: 'doc-7f3c',
      ownerEmail: 'Nelson@Example.com ',
    })).toBe(`ct:level-editor-draft:v1:account:${hashDraftSeed('nelson@example.com')}:document:doc-7f3c`);
  });
});

describe('level editor draft codec', () => {
  it('reports whether the browser actually accepted the recovery write', () => {
    const setItem = vi.fn();
    vi.stubGlobal('window', { localStorage: { setItem } });
    expect(writeLevelEditorDraft('draft-key', baseDraft())).toBe(true);
    expect(setItem).toHaveBeenCalledOnce();

    setItem.mockImplementationOnce(() => { throw new Error('quota'); });
    expect(writeLevelEditorDraft('draft-key', baseDraft())).toBe(false);
  });

  it('round-trips the board and edit metadata through a compact board code', () => {
    const parsed = parseLevelEditorDraft(serializeLevelEditorDraft(baseDraft({
      campaignId: 'off-c-crown',
      documentId: 'doc-7f3c',
      ownerEmail: 'Nelson@Example.com',
      documentRevision: 7,
      cloudSignature: 'cloud-at-revision-7',
      editingId: 'l-created-after-first-save',
    })))!;
    expect(parsed.levelName).toBe('Bridge sketch');
    expect(parsed.documentId).toBe('doc-7f3c');
    expect(parsed.ownerEmail).toBe('nelson@example.com');
    expect(parsed.documentRevision).toBe(7);
    expect(parsed.cloudSignature).toBe('cloud-at-revision-7');
    expect(parsed.editingId).toBe('l-created-after-first-save');
    expect(parsed.campaignId).toBe('off-c-crown');
    expect(parsed.objective).toBe('reach');
    expect(parsed.surviveTurns).toBe(7);
    expect(encodeBoard(parsed.board)).toBe(encodeBoard(baseDraft().board));
  });

  it('round-trips an explicit unassigned campaign choice and ignores malformed values', () => {
    expect(parseLevelEditorDraft(serializeLevelEditorDraft(baseDraft({ campaignId: null })))!.campaignId).toBeNull();
    const raw = JSON.parse(serializeLevelEditorDraft(baseDraft())) as Record<string, unknown>;
    raw.campaignId = { nope: true };
    expect(parseLevelEditorDraft(JSON.stringify(raw))!.campaignId).toBeUndefined();
  });

  it('round-trips standalone authored fence posts through local draft storage', () => {
    const draft = baseDraft({ board: baseBoard({ fencePosts: { '0,0': 'wood', '6,6': 'stone' } }) });
    const parsed = parseLevelEditorDraft(serializeLevelEditorDraft(draft))!;
    expect(parsed.board.fencePosts).toEqual(draft.board.fencePosts);
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

  it('round-trips authored setup/promotion events, and stays undefined when absent', () => {
    const events = [
      { name: 'Deploy', trigger: { kind: 'setup' as const }, do: [{ kind: 'spawn' as const, side: 'player' as const, roster: { pawn: 1 }, zoneIds: ['deployment'] }] },
      { trigger: { kind: 'unit-enters-zone' as const, unit: { type: 'pawn' as const, side: 'player' as const }, zoneId: 'goal' }, do: [{ kind: 'promote' as const, target: { kind: 'triggering-unit' as const } }] },
    ];
    const custom = parseLevelEditorDraft(serializeLevelEditorDraft(baseDraft({ events })))!;
    expect(custom.events).toEqual(events);
    const plain = parseLevelEditorDraft(serializeLevelEditorDraft(baseDraft()))!;
    expect(plain.events).toBeUndefined();
  });

  it('normalizes legacy and interim promotion event drafts to trigger/action events', () => {
    const raw = JSON.parse(serializeLevelEditorDraft(baseDraft())) as Record<string, unknown>;
    raw.events = [
      { kind: 'spawn', name: 'Deploy', trigger: { kind: 'setup' }, side: 'player', roster: { pawn: 1 }, zoneIds: ['deployment'] },
      { kind: 'pawn-promotion', trigger: { kind: 'unit-enters-zone', unit: { type: 'pawn', side: 'player' }, zoneId: 'goal' }, defaultPromotion: 'queen' },
      { trigger: { kind: 'unit-enters-zone', unit: { type: 'pawn', side: 'enemy' }, zoneId: 'enemy-goal' } },
    ];
    const parsed = parseLevelEditorDraft(JSON.stringify(raw))!;

    expect(parsed.events).toEqual([
      { name: 'Deploy', trigger: { kind: 'setup' }, do: [{ kind: 'spawn', side: 'player', roster: { pawn: 1 }, zoneIds: ['deployment'] }] },
      { trigger: { kind: 'unit-enters-zone', unit: { type: 'pawn', side: 'player' }, zoneId: 'goal' }, do: [{ kind: 'promote', target: { kind: 'triggering-unit' } }] },
      { trigger: { kind: 'unit-enters-zone', unit: { type: 'pawn', side: 'enemy' }, zoneId: 'enemy-goal' }, do: [{ kind: 'promote', target: { kind: 'triggering-unit' } }] },
    ]);
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
    expect('placement' in parsed).toBe(false);
    expect('roster' in parsed).toBe(false);
    expect(decodeBoard(encodeBoard(parsed.board))?.units['2,2']).toEqual({ unitId: 'rook', direction: 'south', faction: 'navy-blue' });
  });
});

describe('scoped level editor recovery', () => {
  const identity = { documentId: 'doc-7f3c', ownerEmail: 'Nelson@Example.com ' };

  it('binds scoped reads and writes to the normalized account and document identity', () => {
    stubLocalStorage();

    expect(writeScopedLevelEditorDraft(identity, baseDraft({
      documentId: 'wrong-document',
      ownerEmail: 'wrong@example.com',
      documentRevision: 3,
    }))).toBe(true);

    expect(readScopedLevelEditorDraft(identity)).toMatchObject({
      documentId: 'doc-7f3c',
      ownerEmail: 'nelson@example.com',
      documentRevision: 3,
    });
    expect(readScopedLevelEditorDraft({ ...identity, documentId: 'doc-other' })).toBeNull();
  });

  it('rebases a matching recovery after a name-only cloud CAS without losing local board edits', () => {
    stubLocalStorage();
    const localBoard = baseBoard({ cells: { '2,2': 'lava-surf-0' } });
    writeScopedLevelEditorDraft(identity, baseDraft({
      board: localBoard,
      documentRevision: 3,
      cloudSignature: 'cloud-revision-3',
    }));

    expect(rebaseScopedLevelEditorDraft(identity, {
      expectedDocumentRevision: 3,
      expectedCloudSignature: 'cloud-revision-3',
      nextDocumentRevision: 4,
      nextCloudSignature: 'cloud-revision-4',
      levelName: 'Renamed bridge',
    })).toBe(true);

    const rebased = readScopedLevelEditorDraft(identity)!;
    expect(rebased.levelName).toBe('Renamed bridge');
    expect(rebased.documentRevision).toBe(4);
    expect(rebased.cloudSignature).toBe('cloud-revision-4');
    expect(rebased.savedSig).toBe('clean-baseline');
    expect(encodeBoard(rebased.board)).toBe(encodeBoard(localBoard));
  });

  it('preserves stale or conflicted recovery and clears only on an explicit cleanup acknowledgement', () => {
    const { values } = stubLocalStorage();
    writeScopedLevelEditorDraft(identity, baseDraft({
      documentRevision: 7,
      cloudSignature: 'cloud-revision-7',
    }));
    const key = scopedLevelEditorDraftKey(identity)!;
    const before = values.get(key);

    expect(rebaseScopedLevelEditorDraft(identity, {
      expectedDocumentRevision: 6,
      expectedCloudSignature: 'cloud-revision-6',
      nextDocumentRevision: 7,
      nextCloudSignature: 'cloud-revision-7',
      levelName: 'Must not replace recovery',
    })).toBe(false);
    expect(values.get(key)).toBe(before);

    writeScopedLevelEditorDraft(identity, { ...readScopedLevelEditorDraft(identity)!, recoveryConflict: true });
    const conflicted = values.get(key);
    expect(rebaseScopedLevelEditorDraft(identity, {
      expectedDocumentRevision: 7,
      expectedCloudSignature: 'cloud-revision-7',
      nextDocumentRevision: 8,
      nextCloudSignature: 'cloud-revision-8',
      levelName: 'Must not replace conflict',
    })).toBe(false);
    expect(values.get(key)).toBe(conflicted);

    clearScopedLevelEditorDraft(identity);
    expect(values.has(key)).toBe(false);
  });

  it('acknowledges only the exact conflicted recovery bound to the cloud revision on screen', () => {
    const { values } = stubLocalStorage();
    const localBoard = baseBoard({ cells: { '4,2': 'sand-surf-0' } });
    writeScopedLevelEditorDraft(identity, baseDraft({
      board: localBoard,
      documentRevision: 42,
      cloudSignature: 'cloud-revision-42',
      recoveryConflict: true,
    }));
    const key = scopedLevelEditorDraftKey(identity)!;
    const conflicted = values.get(key);

    expect(acknowledgeScopedLevelEditorRecoveryConflict(identity, {
      expectedDocumentRevision: 41,
      expectedCloudSignature: 'cloud-revision-41',
    })).toBe(false);
    expect(values.get(key)).toBe(conflicted);

    expect(acknowledgeScopedLevelEditorRecoveryConflict(identity, {
      expectedDocumentRevision: 42,
      expectedCloudSignature: 'other-cloud-content',
    })).toBe(false);
    expect(values.get(key)).toBe(conflicted);

    expect(acknowledgeScopedLevelEditorRecoveryConflict(identity, {
      expectedDocumentRevision: 42,
      expectedCloudSignature: 'cloud-revision-42',
    })).toBe(true);
    const acknowledged = readScopedLevelEditorDraft(identity)!;
    expect(acknowledged.recoveryConflict).toBeUndefined();
    expect(acknowledged.documentRevision).toBe(42);
    expect(acknowledged.cloudSignature).toBe('cloud-revision-42');
    expect(encodeBoard(acknowledged.board)).toBe(encodeBoard(localBoard));
  });
});

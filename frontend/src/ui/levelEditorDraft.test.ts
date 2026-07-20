import { afterEach, describe, expect, it, vi } from 'vitest';
import { decodeBoard, encodeBoard, type EditorBoard } from './boardCode';
import { DEFAULT_SURVIVE_TURNS } from '../core/objectives';
import {
  acknowledgeScopedLevelEditorRecoveryConflict,
  claimLevelEditorClientIdentity,
  clearPreservedScopedLevelEditorRecovery,
  clearScopedLevelEditorDraft,
  hashDraftSeed,
  isPreservedScopedLevelEditorRecoveryForwarded,
  levelEditorClientIdentity,
  levelEditorDraftKey,
  listPreservedScopedLevelEditorRecoveries,
  markPreservedScopedLevelEditorRecoveryForwarded,
  migrateLegacyScopedLevelEditorDraft,
  newLevelEditorClientIdentity,
  parseLevelEditorDraft,
  preserveScopedLevelEditorRecovery,
  readPreservedScopedLevelEditorRecovery,
  readScopedLevelEditorDraft,
  rebaseScopedLevelEditorDraft,
  retireLevelEditorClientIdentity,
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
  const makeStorage = (entries: Map<string, string>) => ({
    getItem: vi.fn((key: string) => entries.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => { entries.set(key, value); }),
    removeItem: vi.fn((key: string) => { entries.delete(key); }),
    key: vi.fn((index: number) => [...entries.keys()][index] ?? null),
    get length() { return entries.size; },
  });
  const localStorage = makeStorage(values);
  const sessionValues = new Map<string, string>();
  const sessionStorage = makeStorage(sessionValues);
  vi.stubGlobal('window', { localStorage, sessionStorage });
  return { localStorage, values, sessionStorage, sessionValues, makeStorage };
};

describe('levelEditorDraftKey', () => {
  it('scopes drafts by campaign level, standalone editor, or board-link seed', () => {
    const boardCode = encodeBoard(baseBoard({ cells: { '1,1': 'sand-surf-0' } }));
    expect(levelEditorDraftKey({ levelId: 'l42' })).toBe('ct:level-editor-draft:v1:level:l42');
    expect(levelEditorDraftKey({})).toBe('ct:level-editor-draft:v1:standalone');
    expect(levelEditorDraftKey({ levelId: 'l42', boardCode })).toBe('ct:level-editor-draft:v1:level:l42');
    expect(levelEditorDraftKey({ boardCode })).toBe(`ct:level-editor-draft:v1:board:${hashDraftSeed(boardCode)}`);
  });

  it('retains the old account+document address only as the v1 migration source', () => {
    expect(levelEditorDraftKey({
      levelId: 'l42',
      boardCode: 'ignored-for-cloud-docs',
      documentId: 'doc-7f3c',
      ownerEmail: 'Nelson@Example.com ',
    })).toBe(`ct:level-editor-draft:v1:account:${hashDraftSeed('nelson@example.com')}:document:doc-7f3c`);
  });

  it('binds current cloud recovery to account, document, and client session', () => {
    expect(levelEditorDraftKey({
      documentId: 'doc-7f3c',
      ownerEmail: 'Nelson@Example.com ',
      clientSessionId: 'session-tab-a',
    })).toBe(`ct:level-editor-draft:v2:account:${hashDraftSeed('nelson@example.com')}:document:doc-7f3c:session:session-tab-a`);
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
      clientSessionId: 'session-tab-a',
      documentRevision: 7,
      editGeneration: 11,
      cloudSignature: 'cloud-at-revision-7',
      editingId: 'l-created-after-first-save',
    })))!;
    expect(parsed.levelName).toBe('Bridge sketch');
    expect(parsed.documentId).toBe('doc-7f3c');
    expect(parsed.ownerEmail).toBe('nelson@example.com');
    expect(parsed.clientSessionId).toBe('session-tab-a');
    expect(parsed.documentRevision).toBe(7);
    expect(parsed.editGeneration).toBe(11);
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

describe('level editor client identity', () => {
  it('shares a device identity while giving separate tabs non-colliding session ids', () => {
    const { values, makeStorage } = stubLocalStorage();
    const firstTabStorage = new Map<string, string>();
    vi.stubGlobal('window', {
      localStorage: makeStorage(values),
      sessionStorage: makeStorage(firstTabStorage),
    });
    const first = levelEditorClientIdentity();
    expect(first).not.toBeNull();
    expect(first?.sessionKey).toMatch(/^[0-9a-f]{64}$/);
    expect(levelEditorClientIdentity()).toEqual(first);
    expect([...values.values()]).not.toContain(first?.sessionKey);

    const secondTabStorage = new Map<string, string>();
    vi.stubGlobal('window', {
      localStorage: makeStorage(values),
      sessionStorage: makeStorage(secondTabStorage),
    });
    const second = levelEditorClientIdentity();

    expect(second?.deviceId).toBe(first?.deviceId);
    expect(second?.sessionId).not.toBe(first?.sessionId);
    expect(second?.sessionKey).not.toBe(first?.sessionKey);
  });

  it('uses a distinct session UUID per document opening and reuses it on reload', () => {
    stubLocalStorage();

    const documentA = levelEditorClientIdentity('doc-a');
    const reloadedA = levelEditorClientIdentity('doc-a');
    const documentB = levelEditorClientIdentity('doc-b');

    expect(reloadedA).toEqual(documentA);
    expect(documentB?.deviceId).toBe(documentA?.deviceId);
    expect(documentB?.sessionId).not.toBe(documentA?.sessionId);
    expect(documentB?.sessionKey).not.toBe(documentA?.sessionKey);
  });

  it('refuses mutation authority instead of inventing a weak session secret without Web Crypto', () => {
    stubLocalStorage();
    vi.stubGlobal('crypto', undefined);

    expect(levelEditorClientIdentity()).toBeNull();
  });

  it('creates fresh one-shot authority for each Campaign Editor action', () => {
    stubLocalStorage();

    const first = newLevelEditorClientIdentity();
    const second = newLevelEditorClientIdentity();

    expect(first).not.toBeNull();
    expect(second?.deviceId).toBe(first?.deviceId);
    expect(second?.sessionId).not.toBe(first?.sessionId);
    expect(second?.sessionKey).not.toBe(first?.sessionKey);
  });

  it('rotates a terminal page credential without deleting its session-scoped draft key', () => {
    stubLocalStorage();
    const first = levelEditorClientIdentity('doc-terminal');

    retireLevelEditorClientIdentity('doc-terminal');
    const reopened = levelEditorClientIdentity('doc-terminal');

    expect(reopened?.deviceId).toBe(first?.deviceId);
    expect(reopened?.sessionId).not.toBe(first?.sessionId);
    expect(reopened?.sessionKey).not.toBe(first?.sessionKey);
  });

  it('rotates a duplicated-tab credential when its inherited Web Lock is occupied', async () => {
    const { values } = stubLocalStorage();
    const scope = 'doc-cloned-web-lock';
    const inherited = levelEditorClientIdentity(scope)!;
    const inheritedDraftIdentity = {
      documentId: scope,
      ownerEmail: 'nelson@example.com',
      clientSessionId: inherited.sessionId,
    };
    expect(writeScopedLevelEditorDraft(inheritedDraftIdentity, baseDraft())).toBe(true);
    const inheritedDraftKey = scopedLevelEditorDraftKey(inheritedDraftIdentity)!;
    const completedRequests: string[] = [];
    const request = vi.fn((
      name: string,
      _options: { mode: 'exclusive'; ifAvailable: true },
      callback: (lock: unknown | null) => void | Promise<void>,
    ) => {
      const callbackResult = name.endsWith(inherited.sessionId)
        ? callback(null)
        : callback({ name, mode: 'exclusive' });
      const completion = Promise.resolve(callbackResult).then(() => { completedRequests.push(name); });
      return completion;
    });
    vi.stubGlobal('navigator', { locks: { request } });

    try {
      const claimed = await claimLevelEditorClientIdentity(scope);

      expect(claimed).not.toBeNull();
      expect(claimed?.sessionId).not.toBe(inherited.sessionId);
      expect(claimed?.sessionKey).not.toBe(inherited.sessionKey);
      expect(values.has(inheritedDraftKey)).toBe(true);
      expect(request).toHaveBeenCalledTimes(2);
      expect(request.mock.calls[0][0]).toBe(`ct:level-editor-page-session:${inherited.sessionId}`);
      expect(request.mock.calls[0][1]).toEqual({ mode: 'exclusive', ifAvailable: true });
      expect(request.mock.calls[1][0]).toBe(`ct:level-editor-page-session:${claimed?.sessionId}`);

      const rotatedDraftIdentity = {
        documentId: scope,
        ownerEmail: 'nelson@example.com',
        clientSessionId: claimed!.sessionId,
      };
      expect(writeScopedLevelEditorDraft(rotatedDraftIdentity, baseDraft({ levelName: 'Duplicated tab' }))).toBe(true);
      expect(scopedLevelEditorDraftKey(rotatedDraftIdentity)).not.toBe(inheritedDraftKey);
      expect(readScopedLevelEditorDraft(inheritedDraftIdentity)?.levelName).toBe('Bridge sketch');
      expect(readScopedLevelEditorDraft(rotatedDraftIdentity)?.levelName).toBe('Duplicated tab');
      expect(listPreservedScopedLevelEditorRecoveries(rotatedDraftIdentity)).toEqual([
        expect.objectContaining({
          recoveryId: `session:${inherited.sessionId}`,
          draft: expect.objectContaining({ levelName: 'Bridge sketch' }),
        }),
      ]);

      // Repeated consumers in this page reuse its lifetime claim rather than racing themselves.
      await expect(claimLevelEditorClientIdentity(scope)).resolves.toEqual(claimed);
      expect(request).toHaveBeenCalledTimes(2);
    } finally {
      retireLevelEditorClientIdentity(scope);
    }
    await vi.waitFor(() => expect(completedRequests).toHaveLength(2));
  });

  it('uses BroadcastChannel only to detect an inherited collision when Web Locks are absent', async () => {
    stubLocalStorage();
    const scope = 'doc-cloned-broadcast';
    const inherited = levelEditorClientIdentity(scope)!;
    let probes = 0;

    class CollisionBroadcastChannel {
      onmessage: ((event: MessageEvent<unknown>) => void) | null = null;

      constructor(_name: string) {}

      postMessage(message: unknown): void {
        if (typeof message !== 'object' || message === null || !('type' in message) || message.type !== 'probe') return;
        probes += 1;
        if (probes !== 1 || !('claimantId' in message) || typeof message.claimantId !== 'string') return;
        queueMicrotask(() => this.onmessage?.({
          data: {
            protocol: 'ct:level-editor-page-session:v1',
            type: 'occupied',
            claimantId: 'already-open-page',
            targetId: message.claimantId,
          },
        } as MessageEvent<unknown>));
      }

      close(): void {}
    }

    vi.stubGlobal('navigator', {});
    vi.stubGlobal('BroadcastChannel', CollisionBroadcastChannel);
    try {
      const claimed = await claimLevelEditorClientIdentity(scope);

      expect(claimed?.sessionId).not.toBe(inherited.sessionId);
      expect(claimed?.sessionKey).not.toBe(inherited.sessionKey);
      expect(probes).toBe(2);
    } finally {
      retireLevelEditorClientIdentity(scope);
    }
  });

  it('fails closed when the browser offers no cross-context collision primitive', async () => {
    stubLocalStorage();
    const scope = 'doc-no-collision-primitive';
    const before = levelEditorClientIdentity(scope);
    vi.stubGlobal('navigator', {});
    vi.stubGlobal('BroadcastChannel', undefined);

    try {
      await expect(claimLevelEditorClientIdentity(scope)).resolves.toBeNull();
      expect(levelEditorClientIdentity(scope)).toEqual(before);
    } finally {
      retireLevelEditorClientIdentity(scope);
    }
  });
});

describe('scoped level editor recovery', () => {
  const identity = {
    documentId: 'doc-7f3c',
    ownerEmail: 'Nelson@Example.com ',
    clientSessionId: 'session-tab-current',
  };

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
      clientSessionId: 'session-tab-current',
      documentRevision: 3,
    });
    expect(readScopedLevelEditorDraft({ ...identity, documentId: 'doc-other' })).toBeNull();
  });

  it('keeps two tabs in separate cloud-recovery keys', () => {
    const { values } = stubLocalStorage();
    const first = { ...identity, clientSessionId: 'session-tab-first' };
    const second = { ...identity, clientSessionId: 'session-tab-second' };

    expect(scopedLevelEditorDraftKey(first)).not.toBe(scopedLevelEditorDraftKey(second));
    expect(writeScopedLevelEditorDraft(first, baseDraft({ levelName: 'First tab' }))).toBe(true);
    expect(writeScopedLevelEditorDraft(second, baseDraft({ levelName: 'Second tab' }))).toBe(true);

    expect(readScopedLevelEditorDraft(first)?.levelName).toBe('First tab');
    expect(readScopedLevelEditorDraft(second)?.levelName).toBe('Second tab');
    expect(values.get(scopedLevelEditorDraftKey(first)!)).not.toBe(values.get(scopedLevelEditorDraftKey(second)!));
    expect(listPreservedScopedLevelEditorRecoveries(first)).toEqual([
      expect.objectContaining({
        recoveryId: 'session:session-tab-second',
        source: 'edit-session',
        clientSessionId: 'session-tab-second',
        draft: expect.objectContaining({ levelName: 'Second tab' }),
      }),
    ]);
  });

  it('keeps a closed provisional page draft discoverable from the next page session', () => {
    stubLocalStorage();
    const provisionalDocumentId = 'pending-level-editor:off-l-hold-bridge';
    const closedPage = {
      documentId: provisionalDocumentId,
      ownerEmail: 'nelson@example.com',
      clientSessionId: 'session-page-that-closed',
    };
    const reopenedPage = {
      ...closedPage,
      clientSessionId: 'session-page-that-reopened',
    };

    expect(writeScopedLevelEditorDraft(closedPage, baseDraft({ levelName: 'Offline bridge scenery' }))).toBe(true);
    expect(readScopedLevelEditorDraft(reopenedPage)).toBeNull();
    expect(listPreservedScopedLevelEditorRecoveries(reopenedPage)).toEqual([
      expect.objectContaining({
        recoveryId: 'session:session-page-that-closed',
        clientSessionId: 'session-page-that-closed',
        draft: expect.objectContaining({ levelName: 'Offline bridge scenery' }),
      }),
    ]);
  });

  it('forwards only the acknowledged source content to the acknowledged target document', () => {
    stubLocalStorage();
    const sourcePage = {
      documentId: 'pending-level-editor:off-l-hold-bridge',
      ownerEmail: 'nelson@example.com',
      clientSessionId: 'session-page-that-closed',
    };
    const reopenedPage = {
      ...sourcePage,
      clientSessionId: 'session-page-that-reopened',
    };

    expect(writeScopedLevelEditorDraft(sourcePage, baseDraft({
      levelName: 'Exact forwarded scene',
      savedAt: 100,
    }))).toBe(true);
    const exactRecovery = listPreservedScopedLevelEditorRecoveries(reopenedPage)[0];

    expect(isPreservedScopedLevelEditorRecoveryForwarded(
      reopenedPage,
      exactRecovery,
      'resolved-document-a',
    )).toBe(false);
    expect(markPreservedScopedLevelEditorRecoveryForwarded(
      reopenedPage,
      exactRecovery,
      'resolved-document-a',
    )).toBe(true);
    expect(isPreservedScopedLevelEditorRecoveryForwarded(
      reopenedPage,
      exactRecovery,
      'resolved-document-a',
    )).toBe(true);
    expect(isPreservedScopedLevelEditorRecoveryForwarded(
      reopenedPage,
      exactRecovery,
      'resolved-document-b',
    )).toBe(false);

    expect(writeScopedLevelEditorDraft(sourcePage, baseDraft({
      levelName: 'Changed source scene',
      savedAt: 101,
    }))).toBe(true);
    const changedRecovery = listPreservedScopedLevelEditorRecoveries(reopenedPage)[0];
    expect(changedRecovery.recoveryId).toBe(exactRecovery.recoveryId);
    expect(isPreservedScopedLevelEditorRecoveryForwarded(
      reopenedPage,
      changedRecovery,
      'resolved-document-a',
    )).toBe(false);
    expect(isPreservedScopedLevelEditorRecoveryForwarded(
      reopenedPage,
      exactRecovery,
      'resolved-document-a',
    )).toBe(true);
  });

  it('archives a legacy v1 cloud recovery instead of mounting or overwriting it', () => {
    const { values } = stubLocalStorage();
    const legacyIdentity = { documentId: identity.documentId, ownerEmail: identity.ownerEmail };
    const legacyKey = levelEditorDraftKey(legacyIdentity);
    const legacyDraft = baseDraft({
      documentId: identity.documentId,
      ownerEmail: 'nelson@example.com',
      levelName: 'Unsynced legacy scenery',
      documentRevision: 7,
    });
    expect(writeLevelEditorDraft(legacyKey, legacyDraft)).toBe(true);

    // A newly opened edit session starts from cloud truth. The old recovery is
    // archived for explicit inspection and never becomes this session's draft.
    expect(readScopedLevelEditorDraft(identity)).toBeNull();
    expect(values.has(legacyKey)).toBe(false);
    const preserved = listPreservedScopedLevelEditorRecoveries(identity);
    expect(preserved).toHaveLength(1);
    expect(preserved[0]).toMatchObject({
      source: 'legacy-v1',
      clientSessionId: 'session-tab-current',
      draft: { levelName: 'Unsynced legacy scenery', documentRevision: 7 },
    });

    expect(writeScopedLevelEditorDraft(identity, baseDraft({ levelName: 'Current cloud session' }))).toBe(true);
    expect(readScopedLevelEditorDraft(identity)?.levelName).toBe('Current cloud session');
    expect(readPreservedScopedLevelEditorRecovery(identity, preserved[0].recoveryId)?.draft.levelName)
      .toBe('Unsynced legacy scenery');
  });

  it('freezes a displaced current-session candidate with edit-session provenance across listing', () => {
    stubLocalStorage();
    const archived = preserveScopedLevelEditorRecovery(identity, baseDraft({
      levelName: 'Live RAM candidate',
      documentRevision: 9,
      editGeneration: 4,
    }));

    expect(archived).toMatchObject({
      source: 'edit-session',
      clientSessionId: identity.clientSessionId,
      draft: { levelName: 'Live RAM candidate', documentRevision: 9, editGeneration: 4 },
    });
    expect(archived?.recoveryId).toMatch(/^session:session-tab-current:/);
    expect(listPreservedScopedLevelEditorRecoveries(identity)).toEqual([
      expect.objectContaining({
        recoveryId: archived?.recoveryId,
        source: 'edit-session',
        draft: expect.objectContaining({ levelName: 'Live RAM candidate' }),
      }),
    ]);
  });

  it('migrates legacy recovery only after the archive write succeeds and clears exactly one recovery', () => {
    const { localStorage, values } = stubLocalStorage();
    const legacyIdentity = { documentId: identity.documentId, ownerEmail: identity.ownerEmail };
    const legacyKey = levelEditorDraftKey(legacyIdentity);
    writeLevelEditorDraft(legacyKey, baseDraft({
      documentId: identity.documentId,
      ownerEmail: 'nelson@example.com',
      levelName: 'Keep until archived',
    }));
    localStorage.setItem.mockImplementationOnce((key: string) => {
      if (key.includes(':recovery:')) throw new Error('quota');
    });

    expect(migrateLegacyScopedLevelEditorDraft(identity)).toBeNull();
    expect(values.has(legacyKey)).toBe(true);

    const migrated = migrateLegacyScopedLevelEditorDraft(identity);
    expect(migrated?.source).toBe('legacy-v1');
    expect(values.has(legacyKey)).toBe(false);
    expect(clearPreservedScopedLevelEditorRecovery(identity, migrated!.recoveryId)).toBe(true);
    expect(readPreservedScopedLevelEditorRecovery(identity, migrated!.recoveryId)).toBeNull();
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

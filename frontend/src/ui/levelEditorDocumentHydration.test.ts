// @ts-nocheck -- source-structure regression guard; node built-ins are outside the app tsconfig.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const levelEditor = readFileSync(new URL('./LevelEditor.tsx', import.meta.url), 'utf8');

describe('Level Editor document hydration', () => {
  it('re-resolves the document from the shared auth owner without a private auth probe', () => {
    expect(levelEditor).toContain("from '../net/authSession';");
    expect(levelEditor).toContain('const sharedAuthStatus = useAuthSession((session) => session.status);');
    expect(levelEditor).toContain('if (!sharedAuthStatus) return undefined;');
    expect(levelEditor).toContain('const auth = sharedAuthStatus;');
    expect(levelEditor).toContain('}, [authResolutionKey, documentLoadAttempt]);');
    expect(levelEditor).not.toContain('fetchMeStatus');
    expect(levelEditor).not.toContain('fetchReachableAuthStatus');
    expect(levelEditor).not.toContain('setMe(');
  });

  it('restores explicit Subterrain before the working copy can autosave', () => {
    const sharedHydration = levelEditor.match(
      /const applyEditorBoard = \(board: EditorBoard\): void => \{[\s\S]*?\n  \};/,
    )?.[0] ?? '';
    const hydration = levelEditor.match(
      /const applyLevelDocument = \(\s*level: Level,[\s\S]*?\n  \};/,
    )?.[0] ?? '';
    const historyHydration = levelEditor.match(
      /const applyEditorBoardWithSelectionSafety = \(board: EditorBoard\): void => \{[\s\S]*?\n  \};/,
    )?.[0] ?? '';

    expect(sharedHydration).toContain('setBoardSubterrain(board.subterrain ?? {});');
    expect(hydration).toContain('const board = levelToEditorBoard(level);');
    expect(hydration).toContain('applyEditorBoard(board);');
    expect(historyHydration).toContain('applyEditorBoard(board);');
  });

  it('does not hide a validated AI plate when takeover rehydrates the same Level body', () => {
    const hydration = levelEditor.match(
      /const applyLevelDocument = \(\s*level: Level,[\s\S]*?\n  \};/,
    )?.[0] ?? '';

    expect(hydration).toContain(
      'if (predrawnSelectionNeedsRevalidation(currentEditorBoardRef.current, board)) {',
    );
    expect(hydration.indexOf('setPredrawnSelectionValidation('))
      .toBeGreaterThan(hydration.indexOf('if (predrawnSelectionNeedsRevalidation('));
    expect(hydration).toContain('applyEditorBoard(board);');
  });

  it('synchronously hands a reconnect-only RAM candidate across document canonicalization', () => {
    const handoffStart = levelEditor.indexOf('const offlineSessionHandoffDraft: LevelEditorDraft = {');
    const handoffWrite = levelEditor.indexOf('offlineSessionHandoffReady = writeScopedLevelEditorDraft(', handoffStart);
    const recoveryClear = levelEditor.indexOf('offlineRecoveryLevelRef.current = null;', handoffWrite);
    const canonicalNavigation = levelEditor.indexOf('navigateApp(canonicalEditorHref', recoveryClear);

    expect(handoffStart).toBeGreaterThan(-1);
    expect(handoffWrite).toBeGreaterThan(handoffStart);
    expect(recoveryClear).toBeGreaterThan(handoffWrite);
    expect(canonicalNavigation).toBeGreaterThan(recoveryClear);
    expect(levelEditor.slice(handoffStart, handoffWrite)).toContain('board: levelToEditorBoard(recoveredLevel)');
    expect(levelEditor.slice(handoffWrite, canonicalNavigation)).toContain('if (recoveryHandoffReady)');
  });

  it('archives every rejected local candidate instead of clearing dirty-cloud or baseline-mismatched RAM', () => {
    const unsafeStart = levelEditor.indexOf('if (localDiverged && !restoreLocal && localLevel) {');
    const preserve = levelEditor.indexOf('preserveScopedLevelEditorRecovery(scopedDraftIdentity, unsafeDraft)', unsafeStart);
    const handoffGate = levelEditor.indexOf('const recoveryHandoffReady = offlineSessionHandoffReady', preserve);
    const recoveryClear = levelEditor.indexOf('offlineRecoveryLevelRef.current = null;', handoffGate);

    expect(unsafeStart).toBeGreaterThan(-1);
    expect(preserve).toBeGreaterThan(unsafeStart);
    expect(handoffGate).toBeGreaterThan(preserve);
    expect(recoveryClear).toBeGreaterThan(handoffGate);
    expect(levelEditor.slice(unsafeStart, preserve)).toContain('board: levelToEditorBoard(localLevel)');
    expect(levelEditor).toContain('claimedUnscopedDraft && recoveryDraftIsClaimed && !unsafeLocalRecovery');
    expect(levelEditor.slice(handoffGate, recoveryClear)).toContain('if (recoveryHandoffReady)');
  });

  it('keeps board Undo alive when the same working copy syncs back', () => {
    const hydration = levelEditor.match(
      /const applyLevelDocument = \(\s*level: Level,[\s\S]*?\n  \};/,
    )?.[0] ?? '';
    const syncBranch = hydration.indexOf("if (options.hydration === 'sync') {");
    const selectionSafety = hydration.indexOf('applyEditorBoardWithSelectionSafety(board);', syncBranch);
    const loadBranch = hydration.indexOf('} else {', selectionSafety);
    const historyReset = hydration.indexOf('setUndoStack([]);', loadBranch);

    expect(syncBranch).toBeGreaterThan(-1);
    expect(selectionSafety).toBeGreaterThan(syncBranch);
    expect(loadBranch).toBeGreaterThan(selectionSafety);
    // Both stacks and the region selection reset on a document LOAD only. Autosave acknowledgement
    // re-mounts the same body about a second after every stroke; resetting there deleted Undo.
    expect(historyReset).toBeGreaterThan(loadBranch);
    expect(hydration.indexOf('setRedoStack([]);')).toBeGreaterThan(loadBranch);
    expect(hydration.indexOf('setRegionSelection(new Set());')).toBeGreaterThan(loadBranch);
    expect(hydration.match(/setUndoStack\(\[\]\);/g)).toHaveLength(1);
  });

  it('declares every acknowledged re-mount of the open working copy a sync', () => {
    // The ref-dispatched hydrations are exactly the paths that re-mount the document already open:
    // autosave acknowledgement, its merge and conflict merges, and the shared-sync poll. A new one
    // added without `hydration: 'sync'` silently reintroduces the vanishing-Undo defect.
    const remounts = levelEditor.match(/applyLevelDocumentRef\.current\([^\n]*\n?/g) ?? [];

    expect(remounts.length).toBeGreaterThan(0);
    for (const remount of remounts) {
      expect(remount).toContain("hydration: 'sync'");
    }
  });

  it('keeps an accepted claimed draft current across the document remount', () => {
    const migrationStart = levelEditor.indexOf(
      'if (claimedUnscopedDraft && recoveryDraftIsClaimed && !unsafeLocalRecovery && scopedDraftKey && ownerEmail) {',
    );
    const migrationEnd = levelEditor.indexOf(
      'const recoveryHandoffReady = offlineSessionHandoffReady',
      migrationStart,
    );
    const migration = levelEditor.slice(migrationStart, migrationEnd);

    expect(migrationStart).toBeGreaterThan(-1);
    expect(migrationEnd).toBeGreaterThan(migrationStart);
    expect(migration).toContain('editGeneration: editSessionRef.current?.edit_generation,');
    expect(migration).toContain('recoveryConflict: recoveryConflict || undefined,');
    expect(migration).not.toContain('localRecoveryConflict');
  });
});

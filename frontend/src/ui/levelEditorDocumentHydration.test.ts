// @ts-nocheck -- source-structure regression guard; node built-ins are outside the app tsconfig.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const levelEditor = readFileSync(new URL('./LevelEditor.tsx', import.meta.url), 'utf8');

describe('Level Editor document hydration', () => {
  it('restores explicit Subterrain before the working copy can autosave', () => {
    const sharedHydration = levelEditor.match(
      /const applyEditorBoard = \(board: EditorBoard\): void => \{[\s\S]*?\n  \};/,
    )?.[0] ?? '';
    const hydration = levelEditor.match(
      /const applyLevelDocument = \(level: Level,[\s\S]*?\n  \};/,
    )?.[0] ?? '';
    const historyHydration = levelEditor.match(
      /const applyEditorBoardWithSelectionSafety = \(board: EditorBoard\): void => \{[\s\S]*?\n  \};/,
    )?.[0] ?? '';

    expect(sharedHydration).toContain('setBoardSubterrain(board.subterrain ?? {});');
    expect(hydration).toContain('applyEditorBoard(levelToEditorBoard(level));');
    expect(historyHydration).toContain('applyEditorBoard(board);');
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

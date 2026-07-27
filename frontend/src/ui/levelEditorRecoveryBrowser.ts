import type { EditorDocumentRecovery } from '../net/editorDocuments';

/** Recoveries arrive newest-first. Keep the same recovery selected across background refreshes. */
export function serverRecoveryCursorIndex(
  recoveries: readonly EditorDocumentRecovery[],
  selectedRecoveryId: string | null,
): number {
  if (!recoveries.length) return -1;
  const selectedIndex = selectedRecoveryId
    ? recoveries.findIndex((recovery) => recovery.recovery_id === selectedRecoveryId)
    : -1;
  return selectedIndex >= 0 ? selectedIndex : 0;
}

/** Step without wrapping so the disabled chevrons make the list boundaries legible. */
export function stepServerRecoveryCursor(
  recoveries: readonly EditorDocumentRecovery[],
  selectedRecoveryId: string | null,
  delta: -1 | 1,
): string | null {
  const currentIndex = serverRecoveryCursorIndex(recoveries, selectedRecoveryId);
  if (currentIndex < 0) return null;
  const nextIndex = Math.max(0, Math.min(recoveries.length - 1, currentIndex + delta));
  return recoveries[nextIndex]?.recovery_id ?? null;
}

/** After deleting the selected card, stay at its ordinal (the next older copy) when possible. */
export function serverRecoveryCursorAfterRemoval(
  recoveries: readonly EditorDocumentRecovery[],
  selectedRecoveryId: string | null,
  removedRecoveryId: string,
): string | null {
  const remaining = recoveries.filter((recovery) => recovery.recovery_id !== removedRecoveryId);
  if (!remaining.length) return null;
  if (selectedRecoveryId !== removedRecoveryId
    && selectedRecoveryId
    && remaining.some((recovery) => recovery.recovery_id === selectedRecoveryId)) {
    return selectedRecoveryId;
  }
  const removedIndex = recoveries.findIndex((recovery) => recovery.recovery_id === removedRecoveryId);
  const replacementIndex = Math.min(Math.max(removedIndex, 0), remaining.length - 1);
  return remaining[replacementIndex]?.recovery_id ?? remaining[0].recovery_id;
}

export function serverRecoveryReasonLabel(recovery: EditorDocumentRecovery): string {
  switch (recovery.reason) {
    case 'takeover': return 'Saved when editing moved to another tab';
    case 'lease-expired': return 'Saved when that editing session expired';
    case 'displaced-upload': return 'Uploaded by the previous tab after editing moved';
    case 'pre-restore': return 'Current work saved before another copy was restored';
  }
}

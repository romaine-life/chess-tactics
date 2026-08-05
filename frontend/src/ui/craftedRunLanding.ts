import type { RunDocument } from '../run/model';

export type CraftedBattleResult = 'player';

type RunBattleIdentity = Pick<RunDocument, 'id' | 'phase' | 'battleIndex'>;

interface PendingCraftedBattleResult {
  runId: string;
  battleIndex: number;
  result: CraftedBattleResult;
}

// A terminal board is match state, not Run state. Keep the admin crafter's landing instruction
// between its response and the freshly mounted Battle without adding a review-only field to the
// persisted Run document. Every ordinary craft clears an older instruction, and the fresh Run id
// prevents one link's result from leaking onto another Battle.
let pending: PendingCraftedBattleResult | null = null;

export function registerCraftedBattleResult(
  run: RunBattleIdentity,
  result: CraftedBattleResult | null,
): void {
  pending = result && run.phase === 'battle'
    ? { runId: run.id, battleIndex: run.battleIndex, result }
    : null;
}

export function craftedBattleResultFor(run: RunBattleIdentity): CraftedBattleResult | null {
  return pending
    && run.phase === 'battle'
    && pending.runId === run.id
    && pending.battleIndex === run.battleIndex
      ? pending.result
      : null;
}

export function clearCraftedBattleResult(run: RunBattleIdentity): void {
  if (pending?.runId === run.id && pending.battleIndex === run.battleIndex) pending = null;
}

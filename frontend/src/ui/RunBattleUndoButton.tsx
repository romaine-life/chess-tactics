import type { ReactElement } from 'react';
import { useSkirmish } from '../game/SkirmishStoreContext';
import { RUN_BATTLE_UNDO_COST_TENTHS, formatGold } from '../run/model';
import { chromeUnitClassNames } from './chromeUnitRegistry';
import { RunGoldAmount } from './RunResources';
import { ChromeButton } from './shared/ChromeButton';

/** The one canonical paid-Undo action shared by Battle Controls and its result card. */
export function RunBattleUndoButton({
  testId,
  className = '',
}: {
  testId: string;
  className?: string;
}): ReactElement | null {
  const runUndoEnabled = useSkirmish((state) => state.runUndoEnabled);
  const checkpoint = useSkirmish((state) => state.undoCheckpoint);
  const canUndoLastPlayerMove = useSkirmish((state) => state.canUndoLastPlayerMove);
  const undoLastPlayerMove = useSkirmish((state) => state.undoLastPlayerMove);
  if (!runUndoEnabled) return null;

  const canUndo = Boolean(checkpoint) && canUndoLastPlayerMove();
  const cost = formatGold(RUN_BATTLE_UNDO_COST_TENTHS);
  const title = canUndo
    ? `Undo your last move and the opponent’s reply for ${cost} gold.`
    : checkpoint
      ? `Undo costs ${cost} gold.`
      : 'Make a move before undoing.';

  return (
    <ChromeButton
      unit="inner-text-button"
      className={chromeUnitClassNames('inner-text-button', 'app-header-button', className)}
      data-testid={testId}
      data-ui-sfx="gold"
      disabled={!canUndo}
      aria-label={`Undo last move for ${cost} gold`}
      title={title}
      onClick={() => { undoLastPlayerMove(); }}
    >
      <span>Undo</span>
      <RunGoldAmount
        valueTenths={RUN_BATTLE_UNDO_COST_TENTHS}
        className="run-gold-amount--button"
      />
    </ChromeButton>
  );
}

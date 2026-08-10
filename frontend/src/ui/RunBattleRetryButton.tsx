import type { CSSProperties, ReactElement } from 'react';
import { formatGold } from '../run/model';
import { chromeUnitClassNames } from './chromeUnitRegistry';
import { RunGoldAmount } from './RunResources';
import { ChromeButton } from './shared/ChromeButton';

/** The canonical paid Run Battle retry action shared by Controls and the result card. */
export function RunBattleRetryButton({
  testId,
  costTenths,
  canRetry,
  onRetry,
  unavailableReason,
  className = '',
  style,
}: {
  testId: string;
  costTenths: number;
  canRetry: boolean;
  onRetry: () => void;
  unavailableReason?: string;
  className?: string;
  /** The host's leaf-surface phase for this seat in its row (`leafSurfacePhase`). */
  style?: CSSProperties;
}): ReactElement {
  const cost = formatGold(costTenths);
  return (
    <ChromeButton
      unit="inner-text-button"
      className={chromeUnitClassNames('inner-text-button', 'app-header-button', className)}
      style={style}
      data-testid={testId}
      data-ui-sfx="gold"
      disabled={!canRetry}
      aria-label={`Retry Battle for ${cost} gold`}
      title={canRetry ? `Retry Battle for ${cost} gold.` : unavailableReason ?? `Retry Battle costs ${cost} gold.`}
      onClick={onRetry}
    >
      <span>Retry</span>
      <RunGoldAmount valueTenths={costTenths} className="run-gold-amount--button" />
    </ChromeButton>
  );
}

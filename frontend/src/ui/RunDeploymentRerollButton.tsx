import type { ReactElement } from 'react';
import { formatGold } from '../run/model';
import { chromeUnitClassNames } from './chromeUnitRegistry';
import { RunGoldAmount } from './RunResources';
import { ChromeButton } from './shared/ChromeButton';

/** The canonical paid action for replaying every placement in the current Deployment. */
export function RunDeploymentRerollButton({
  testId,
  costTenths,
  canReroll,
  onReroll,
  departing = false,
  className = '',
}: {
  testId: string;
  costTenths: number;
  canReroll: boolean;
  onReroll: () => void;
  departing?: boolean;
  className?: string;
}): ReactElement {
  const cost = formatGold(costTenths);
  const label = `Reroll deployment for ${cost} gold`;
  const accessibleLabel = departing ? 'Units withdrawing for deployment reroll' : label;
  return (
    <ChromeButton
      unit="inner-text-button"
      className={chromeUnitClassNames('inner-text-button', 'app-header-button', className)}
      data-testid={testId}
      data-ui-sfx="gold"
      disabled={departing || !canReroll}
      aria-label={accessibleLabel}
      aria-busy={departing || undefined}
      title={departing ? 'Units are leaving the battlefield.' : canReroll ? `${label}. Redo every unit placement.` : `Reroll deployment costs ${cost} gold.`}
      onClick={onReroll}
    >
      <span>{departing ? 'Withdrawing…' : 'Reroll deployment'}</span>
      <RunGoldAmount valueTenths={costTenths} className="run-gold-amount--button" />
    </ChromeButton>
  );
}

import type { ReactElement } from 'react';
import type { RunDeploymentMode } from '../run/model';
import { HouseSelect, type HouseSelectOption } from './shared/HouseSelect';

const OPTIONS: readonly HouseSelectOption<RunDeploymentMode>[] = [
  {
    value: 'arranged',
    label: (
      <span className="run-ataraxia-option-copy">
        <span>Arrange formations</span>
        <small>Reveal the dealt hand, then rotate and place its cards yourself.</small>
      </span>
    ),
  },
  {
    value: 'automatic',
    label: (
      <span className="run-ataraxia-option-copy">
        <span>Automatic formations</span>
        <small>Cards settle from right to left in their seeded deal order.</small>
      </span>
    ),
  },
];

export function RunDeploymentModeSelector({
  value,
  onChange,
  fillSurface,
}: {
  value: RunDeploymentMode;
  onChange: (mode: RunDeploymentMode) => void;
  fillSurface?: string;
}): ReactElement {
  return (
    <section className="run-ataraxia-selector run-deployment-mode-selector" aria-labelledby="run-deployment-mode-title">
      <h3 id="run-deployment-mode-title">Deployment</h3>
      <HouseSelect
        value={value}
        options={OPTIONS}
        onChange={onChange}
        ariaLabel="Deployment mode"
        className="run-ataraxia-select"
        testId="run-deployment-mode-select"
        fillSurface={fillSurface}
      />
      <p className="run-ataraxia-effect">
        {value === 'arranged'
          ? 'See the complete Battle hand and build its starting position.'
          : 'Let the shuffled cards build the position in order.'}
      </p>
    </section>
  );
}

import type { ReactElement } from 'react';
import { ATARAXIA_BY_TIER, type AtaraxiaTier } from '../run/model';
import { chromeUnitClassNames } from './chromeUnitRegistry';
import { InnerChromeBox } from './shared/ChromeBox';

export function AtaraxiaSelector({
  value,
  highestUnlockedTier,
  onChange,
}: {
  value: AtaraxiaTier;
  highestUnlockedTier: AtaraxiaTier;
  onChange: (tier: AtaraxiaTier) => void;
}): ReactElement {
  return (
    <InnerChromeBox className="run-ataraxia-selector" aria-labelledby="run-ataraxia-title">
      <header>
        <span className="play-action-kicker">Run difficulty</span>
        <h3 id="run-ataraxia-title">Ataraxia</h3>
      </header>
      <div className="run-ataraxia-options" role="radiogroup" aria-label="Ataraxia tier">
        {([0, 1] as const).map((tier) => {
          const definition = ATARAXIA_BY_TIER[tier];
          const locked = tier > highestUnlockedTier;
          return (
            <button
              type="button"
              role="radio"
              aria-checked={value === tier}
              data-chrome-unit="inner-text-button"
              data-ataraxia-tier={tier}
              className={chromeUnitClassNames('inner-text-button', 'app-header-button', value === tier && 'active')}
              disabled={locked}
              key={tier}
              onClick={() => onChange(tier)}
            >
              <strong>{definition.label}</strong>
              <span>{tier === 0 ? 'Baseline' : definition.title}</span>
              {locked ? <small>Win a No Ataraxia Run to unlock</small> : null}
            </button>
          );
        })}
      </div>
      <p>{ATARAXIA_BY_TIER[value].effect}</p>
    </InnerChromeBox>
  );
}

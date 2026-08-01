import type { ReactElement } from 'react';
import { ATARAXIA_BY_TIER, type AtaraxiaTier } from '../run/model';
import { HouseSelect, type HouseSelectOption } from './shared/HouseSelect';

const ATARAXIA_TIERS: readonly AtaraxiaTier[] = [0, 1];

export function AtaraxiaSelector({
  value,
  highestUnlockedTier,
  onChange,
}: {
  value: AtaraxiaTier;
  highestUnlockedTier: AtaraxiaTier;
  onChange: (tier: AtaraxiaTier) => void;
}): ReactElement {
  const options: readonly HouseSelectOption[] = ATARAXIA_TIERS.map((tier) => {
    const definition = ATARAXIA_BY_TIER[tier];
    const locked = tier > highestUnlockedTier;
    const unlockNote = locked ? 'Complete Ataraxia 0 to unlock' : null;
    return {
      value: String(tier),
      disabled: locked,
      title: unlockNote ?? undefined,
      label: (
        <span className="run-ataraxia-option-copy">
          <span>{definition.label} — {definition.title}</span>
          {unlockNote ? <small>{unlockNote}</small> : null}
        </span>
      ),
    };
  });

  return (
    <section className="run-ataraxia-selector" aria-labelledby="run-ataraxia-title">
      <h3 id="run-ataraxia-title">Ataraxia</h3>
      <HouseSelect
        value={String(value)}
        options={options}
        onChange={(next) => onChange(Number(next) as AtaraxiaTier)}
        ariaLabel="Ataraxia"
        className="run-ataraxia-select"
        testId="run-ataraxia-select"
      />
      <p className="run-ataraxia-effect">{ATARAXIA_BY_TIER[value].effect}</p>
    </section>
  );
}

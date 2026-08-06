import type { ReactElement } from 'react';
import { ATARAXIA_BY_TIER, ATARAXIA_TIERS, type AtaraxiaTier } from '../run/model';
import { HouseSelect, type HouseSelectOption } from './shared/HouseSelect';

export function AtaraxiaSelector({
  value,
  highestUnlockedTier,
  onChange,
  fillSurface,
}: {
  value: AtaraxiaTier;
  highestUnlockedTier: AtaraxiaTier;
  onChange: (tier: AtaraxiaTier) => void;
  fillSurface?: string;
}): ReactElement {
  const options: readonly HouseSelectOption[] = ATARAXIA_TIERS.map((tier) => {
    const definition = ATARAXIA_BY_TIER[tier];
    const locked = tier > highestUnlockedTier;
    // The ladder is linear, so the tier below is exactly the one that opens this rung.
    const unlockNote = locked
      ? `Complete ${ATARAXIA_BY_TIER[(tier - 1) as AtaraxiaTier].label} to unlock`
      : null;
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
        fillSurface={fillSurface}
      />
      <p className="run-ataraxia-effect">{ATARAXIA_BY_TIER[value].effect}</p>
    </section>
  );
}

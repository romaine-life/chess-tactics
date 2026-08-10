import type { ReactElement } from 'react';
import { ATARAXIA_BY_TIER, ATARAXIA_TIERS, type AtaraxiaTier } from '../run/model';
import { HouseSelect, type HouseSelectOption } from './shared/HouseSelect';
import { SectionBox } from './shared/SectionBox';

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

  // The selected tier's `effect` is not restated under the picker. Every tier the ladder installs
  // says it in the option the picker is already showing, and the baseline's -- the only rung there
  // is -- reads "Standard rules.", which is a line of copy spent saying that the default is the
  // default. The Enchiridion's Ataraxia reference is where the ladder is explained in full.
  return (
    <SectionBox title="Ataraxia" titleId="run-ataraxia-title" className="run-ataraxia-selector">
      <HouseSelect
        value={String(value)}
        options={options}
        onChange={(next) => onChange(Number(next) as AtaraxiaTier)}
        ariaLabel="Ataraxia"
        className="run-ataraxia-select"
        testId="run-ataraxia-select"
        fillSurface={fillSurface}
      />
    </SectionBox>
  );
}

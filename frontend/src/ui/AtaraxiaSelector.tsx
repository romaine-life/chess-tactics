import type { ReactElement } from 'react';
import { ATARAXIA_BY_TIER, ATARAXIA_TIERS, type AtaraxiaTier } from '../run/model';
import { HouseSelect, type HouseSelectOption } from './shared/HouseSelect';

// The Ataraxia CELL of Start New Run's one box: its name, and the dropdown inserted under it.
//
// It used to be a box of its own, standing above three more boxes with the page showing through
// between them. The whole column is now a single divided box and this is its first cell, so it
// draws no frame at all — the box's own frame is around it and the rail under it is the boundary
// that used to be a gap. See the box's mount in PlayMenu.

export function AtaraxiaSelector({
  value,
  highestUnlockedTier,
  onChange,
  fillSurface,
  named = true,
}: {
  value: AtaraxiaTier;
  highestUnlockedTier: AtaraxiaTier;
  onChange: (tier: AtaraxiaTier) => void;
  fillSurface?: string;
  /**
   * False where this is one setting inside somebody else's row — the War editor's War group.
   * A second name there would state the same word twice, so it renders as the bare picker and
   * the row around it supplies the name.
   */
  named?: boolean;
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
  const picker = (
    <HouseSelect
      value={String(value)}
      options={options}
      onChange={(next) => onChange(Number(next) as AtaraxiaTier)}
      ariaLabel="Ataraxia"
      className="run-ataraxia-select"
      testId="run-ataraxia-select"
      fillSurface={fillSurface}
    />
  );
  if (!named) return picker;
  return (
    <>
      <div className="run-prep-cell-head">
        <span className="run-prep-cell-name" id="run-ataraxia-title">Ataraxia</span>
      </div>
      {picker}
    </>
  );
}

import type { ReactElement, ReactNode } from 'react';
import { ATARAXIA_BY_TIER, ATARAXIA_TIERS, type AtaraxiaTier } from '../run/model';
import { ChromeDividedGridRow } from './shared/ChromeDividedGrid';
import { HouseSelect, type HouseSelectOption } from './shared/HouseSelect';

// Ataraxia: the bare picker for a row that already names it (the War editor), and the CELLS it
// takes in the one box behind Run preparation's **New** tab (ADR-0571's box, ADR-0582's name).
//
// It used to be a box of its own, standing above three more boxes with the page showing through
// between them. The column is a single divided box now and this is its first pair of cells: a name,
// and the picker SEATED in the cell under it — the wood filling the whole area between the rails,
// with no frame of its own, because the box's rails are already its edges. See the box in PlayMenu.

function ataraxiaOptions(highestUnlockedTier: AtaraxiaTier): readonly HouseSelectOption[] {
  return ATARAXIA_TIERS.map((tier) => {
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
}

export type AtaraxiaSelectorProps = {
  value: AtaraxiaTier;
  highestUnlockedTier: AtaraxiaTier;
  onChange: (tier: AtaraxiaTier) => void;
  fillSurface?: string;
};

/**
 * One setting inside somebody else's row — the War editor's War group. The row supplies the name,
 * and the picker keeps its own frame because it is standing on a field rather than filling a cell.
 */
export function AtaraxiaSelector({
  value,
  highestUnlockedTier,
  onChange,
  fillSurface,
}: AtaraxiaSelectorProps): ReactElement {
  // The selected tier's `effect` is not restated under the picker. Every tier the ladder installs
  // says it in the option the picker is already showing, and the baseline's -- the only rung there
  // is -- reads "Standard rules.", which is a line of copy spent saying that the default is the
  // default. The Enchiridion's Ataraxia reference is where the ladder is explained in full.
  return (
    <HouseSelect
      value={String(value)}
      options={ataraxiaOptions(highestUnlockedTier)}
      onChange={(next) => onChange(Number(next) as AtaraxiaTier)}
      ariaLabel="Ataraxia"
      className="run-ataraxia-select"
      testId="run-ataraxia-select"
      fillSurface={fillSurface}
    />
  );
}

/**
 * The same choice as CELLS of Run preparation's box — an array rather than a component, because
 * only a direct child of the box is a row it lays a rail around (see ChromeDividedGrid).
 */
export function ataraxiaPrepCells({
  value,
  highestUnlockedTier,
  onChange,
  fillSurface,
}: AtaraxiaSelectorProps): ReactNode[] {
  return [
    <ChromeDividedGridRow key="ataraxia-name" spans="all" className="run-prep-cell run-prep-name">
      <span className="run-prep-cell-name" id="run-ataraxia-title">Ataraxia</span>
    </ChromeDividedGridRow>,
    <ChromeDividedGridRow key="ataraxia-choice" spans="all" className="run-prep-plate">
      <HouseSelect
        seated
        value={String(value)}
        options={ataraxiaOptions(highestUnlockedTier)}
        onChange={(next) => onChange(Number(next) as AtaraxiaTier)}
        ariaLabel="Ataraxia"
        className="run-ataraxia-select"
        testId="run-ataraxia-select"
        fillSurface={fillSurface}
      />
    </ChromeDividedGridRow>,
  ];
}

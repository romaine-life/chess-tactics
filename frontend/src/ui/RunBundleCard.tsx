import type { ReactElement } from 'react';
import { runCardName } from '../run/cardNames';
import { GOLD_SCALE, bundleLabel, type PieceBundle } from '../run/model';
import { chromeUnitClassNames } from './chromeUnitRegistry';
import { RunCardScene } from './RunCardScene';
import { RunGoldAmount } from './RunResources';

// One bundle card face shared by the opening draft, the shop, the art-review page, and
// the Enchiridion. The artwork is the card's seeded battlefield vignette: every bundle
// piece mustered with its canonical installed board sprite (ADR-0225) inside the shared
// read-only board renderer. `mode='reference'` mounts the identical face without an
// action for reference hosts.
export function RunBundleCard({
  bundle,
  mode,
  bought = false,
  disabled = false,
  onSelect,
}: {
  bundle: PieceBundle;
  mode: 'draft' | 'shop' | 'reference';
  bought?: boolean;
  disabled?: boolean;
  onSelect?: () => void;
}): ReactElement {
  const label = bundleLabel(bundle);
  const name = runCardName(bundle);
  const face = (
    <>
      <RunCardScene bundle={bundle} className="run-bundle-card-scene" />
      <span className="run-bundle-card-plate" aria-hidden={mode !== 'reference'}>
        <strong className="run-bundle-card-name">{name}</strong>
        {name === label ? null : <small className="run-bundle-card-contents">{label}</small>}
      </span>
      <span className="run-bundle-card-footer" aria-hidden={mode !== 'reference'}>
        {mode === 'draft'
          ? <strong>Take</strong>
          : <RunGoldAmount valueTenths={bundle.value * GOLD_SCALE} />}
        {bought ? <strong>Purchased</strong> : null}
      </span>
    </>
  );
  if (mode === 'reference') {
    return (
      <span
        data-chrome-unit="inner-box"
        className={chromeUnitClassNames('inner-box', 'run-bundle-card is-reference')}
        aria-label={`${name}. ${label}. Worth ${bundle.value} gold.`}
      >
        {face}
      </span>
    );
  }
  const actionLabel = mode === 'draft'
    ? `Take ${name} — ${label}`
    : `${bought ? 'Purchased' : 'Buy'} ${name} — ${label} — for ${bundle.value} gold`;
  return (
    <button
      type="button"
      data-ui-sfx={mode === 'shop' ? 'card-purchase' : undefined}
      data-chrome-unit="inner-box"
      className={chromeUnitClassNames('inner-box', 'run-bundle-card', bought && 'active is-purchased')}
      aria-label={actionLabel}
      disabled={disabled}
      onClick={onSelect}
    >
      {face}
    </button>
  );
}

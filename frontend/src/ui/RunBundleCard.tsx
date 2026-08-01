import type { ReactElement } from 'react';
import { resolvedLiveMediaUrl } from '@chess-tactics/board-render';
import { runCardArtSlot, runCardFlavor, runCardName } from '../run/cardNames';
import { bundleLabel, type PieceBundle, type PurchasablePieceType } from '../run/model';
import { RUN_CARD_FRAME_SLOT, RunCardFace, type RunCardFaceContent } from './RunCardFace';

const CARD_PIECE_ORDER: readonly PurchasablePieceType[] = Object.freeze(['pawn', 'knight', 'bishop', 'rook', 'queen']);

function grantsForBundle(bundle: PieceBundle): RunCardFaceContent['grants'] {
  return CARD_PIECE_ORDER.flatMap((unit) => {
    const count = bundle.pieces.filter((piece) => piece === unit).length;
    return count > 0 ? [{ unit, count }] : [];
  });
}

// One trading-card face shared by the Studio instrument, opening draft, shop, art
// review, and Enchiridion. Runtime hosts add interaction around the approved face;
// they do not substitute a parallel offer-box layout.
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
  const artUrl = resolvedLiveMediaUrl(runCardArtSlot(bundle));
  const frameUrl = resolvedLiveMediaUrl(RUN_CARD_FRAME_SLOT);
  const card = {
    name,
    cost: bundle.value,
    typeLine: 'Units',
    grants: grantsForBundle(bundle),
    flavor: runCardFlavor(bundle),
  } satisfies RunCardFaceContent;
  const face = (
    <RunCardFace
      card={card}
      frameUrl={frameUrl}
      artUrl={artUrl}
      ariaHidden={mode !== 'reference'}
    />
  );
  if (mode === 'reference') {
    return (
      <span
        className="run-bundle-card is-reference"
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
      className={`run-bundle-card${bought ? ' active is-purchased' : ''}`}
      aria-label={actionLabel}
      disabled={disabled}
      onClick={onSelect}
    >
      {face}
    </button>
  );
}

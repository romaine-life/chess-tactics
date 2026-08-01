import type { ReactElement } from 'react';
import { resolvedLiveMediaUrl } from '@chess-tactics/board-render';
import { runCardArtSlot, runCardFlavor, runCardName } from '../run/cardNames';
import {
  bundleLabel,
  type PieceBundle,
  type PurchasablePieceType,
  type RunBundleOffer,
} from '../run/model';
import {
  RUN_CARD_FRAME_SLOT,
  RUN_CARD_PESTIFEROUS_FRAME_SLOT,
  RunCardFace,
  type RunCardFaceContent,
} from './RunCardFace';

const CARD_PIECE_ORDER: readonly PurchasablePieceType[] = Object.freeze(['pawn', 'knight', 'bishop', 'rook', 'queen']);

function grantsForBundle(bundle: PieceBundle | RunBundleOffer): RunCardFaceContent['grants'] {
  return CARD_PIECE_ORDER.flatMap((unit) => {
    const pieceIndices = bundle.pieces.flatMap((piece, index) => piece === unit ? [index] : []);
    const plaguedPieceIndex = 'offerId' in bundle ? bundle.plaguedPieceIndex : null;
    const plaguedIndex = plaguedPieceIndex === null ? -1 : pieceIndices.indexOf(plaguedPieceIndex);
    return pieceIndices.length > 0
      ? [{
          unit,
          count: pieceIndices.length,
          plaguedIndices: plaguedIndex >= 0 ? [plaguedIndex] : [],
        }]
      : [];
  });
}

function plaguedTargetLabel(bundle: PieceBundle | RunBundleOffer): string {
  if (!('offerId' in bundle) || bundle.plaguedPieceIndex === null) return '';
  const target = bundle.pieces[bundle.plaguedPieceIndex];
  return target ? ` Plagued ${target}.` : '';
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
  bundle: PieceBundle | RunBundleOffer;
  mode: 'draft' | 'shop' | 'reference';
  bought?: boolean;
  disabled?: boolean;
  onSelect?: () => void;
}): ReactElement {
  const label = bundleLabel(bundle);
  const name = runCardName(bundle);
  const artUrl = resolvedLiveMediaUrl(runCardArtSlot(bundle));
  const cardType = 'cardType' in bundle ? bundle.cardType : null;
  const frameUrl = resolvedLiveMediaUrl(
    cardType === 'pestiferous' ? RUN_CARD_PESTIFEROUS_FRAME_SLOT : RUN_CARD_FRAME_SLOT,
  );
  const cost = 'cost' in bundle ? bundle.cost : bundle.value;
  const card = {
    name,
    cost,
    typeLine: cardType === 'pestiferous' ? 'Units — Pestiferous' : 'Units',
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
        aria-label={`${name}. ${label}. Worth ${cost} gold.${plaguedTargetLabel(bundle)}`}
      >
        {face}
      </span>
    );
  }
  const actionLabel = mode === 'draft'
    ? `Take ${name} — ${label}`
    : `${bought ? 'Purchased' : 'Buy'} ${name} — ${label} — for ${cost} gold.${plaguedTargetLabel(bundle)}`;
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

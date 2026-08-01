import type { ReactElement } from 'react';
import { resolvedLiveMediaUrl } from '@chess-tactics/board-render';
import { runCardArtSlot, runCardFlavor, runCardName } from '../run/cardNames';
import {
  cardContentsLabel,
  PIECE_LABEL,
  type PurchasablePieceType,
  type RunCardOffer,
  type RunCoreCard,
} from '../run/model';
import {
  RUN_CARD_FRAME_SLOT,
  RUN_CARD_CONCINNOUS_FRAME_SLOT,
  RUN_CARD_PESTIFEROUS_FRAME_SLOT,
  RunCardFace,
  type RunCardFaceContent,
} from './RunCardFace';
import { InnerChromeBox } from './shared/ChromeBox';

const CARD_PIECE_ORDER: readonly PurchasablePieceType[] = Object.freeze(['pawn', 'knight', 'bishop', 'rook', 'queen']);

function grantsForCard(card: RunCoreCard): RunCardFaceContent['grants'] {
  return CARD_PIECE_ORDER.flatMap((unit) => {
    const count = card.pieces.filter((piece) => piece === unit).length;
    return count > 0 ? [{ unit, count }] : [];
  });
}

function concinnousTargetLabel(card: RunCardOffer): string {
  const targetIndex = card.effectTargetIndex;
  if (!Number.isSafeInteger(targetIndex) || targetIndex === null || !card.pieces[targetIndex]) return 'Target unavailable';
  const target = card.pieces[targetIndex];
  const occurrences = card.pieces.filter((piece) => piece === target).length;
  if (occurrences === 1) return PIECE_LABEL[target];
  const ordinal = card.pieces.slice(0, targetIndex + 1).filter((piece) => piece === target).length;
  return `${PIECE_LABEL[target]} ${ordinal}`;
}

// One trading-card face shared by the Studio instrument, opening shop, later shops,
// art review, and Enchiridion. Runtime hosts add interaction around the approved face;
// they do not substitute a parallel offer-box layout.
export function RunCard({
  card,
  mode,
  purchased = false,
  disabled = false,
  onSelect,
}: {
  card: RunCoreCard | RunCardOffer;
  mode: 'shop' | 'reference';
  purchased?: boolean;
  disabled?: boolean;
  onSelect?: () => void;
}): ReactElement {
  const label = cardContentsLabel(card);
  const name = runCardName(card);
  const artUrl = resolvedLiveMediaUrl(runCardArtSlot(card));
  const cardType = 'cardType' in card ? card.cardType : null;
  const frameUrl = resolvedLiveMediaUrl(
    cardType === 'pestiferous'
      ? RUN_CARD_PESTIFEROUS_FRAME_SLOT
      : cardType === 'concinnous'
        ? RUN_CARD_CONCINNOUS_FRAME_SLOT
        : RUN_CARD_FRAME_SLOT,
  );
  const cost = 'cost' in card ? card.cost : card.value;
  const faceContent = {
    name,
    cost,
    typeLine: cardType === 'pestiferous'
      ? 'Units — Pestiferous'
      : cardType === 'concinnous'
        ? 'Units — Concinnous'
        : 'Units',
    grants: grantsForCard(card),
    properties: cardType === 'concinnous' && 'effectTargetIndex' in card
      ? [{ name: 'Positioned', target: purchased ? concinnousTargetLabel(card) : 'Target hidden' }]
      : undefined,
    flavor: runCardFlavor(card),
  } satisfies RunCardFaceContent;
  const face = (
    <RunCardFace
      card={faceContent}
      frameUrl={frameUrl}
      artUrl={artUrl}
      ariaHidden={mode !== 'reference'}
    />
  );
  if (mode === 'reference') {
    return (
      <span
        className="run-card-action is-reference"
        aria-label={`${name}. ${label}. Worth ${cost} gold.`}
      >
        {face}
      </span>
    );
  }
  const actionLabel = `${purchased ? 'Purchased' : 'Buy'} ${name} — ${label} — for ${cost} gold${cardType === 'concinnous' && 'effectTargetIndex' in card ? ` — Positioned: ${purchased ? concinnousTargetLabel(card) : 'target hidden'}` : ''}`;
  return (
    <span className="run-card-offer">
      <button
        type="button"
        data-ui-sfx="gold-sell"
        className={`run-card-action${purchased ? ' is-purchased' : ''}`}
        aria-label={actionLabel}
        disabled={disabled}
        onClick={onSelect}
      >
        {face}
      </button>
      {purchased ? (
        <InnerChromeBox as="span" className="run-card-purchased-indicator" role="status">
          Purchased
        </InnerChromeBox>
      ) : null}
    </span>
  );
}

import type { ReactElement } from 'react';
import { liveMediaForSlot, resolvedLiveMediaUrl } from '@chess-tactics/board-render';
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
  RUN_CARD_TACTICAL_FRAME_SLOT,
  RunCardFace,
  type RunCardFaceContent,
} from './RunCardFace';
import { runCardFrameGeometryForSha } from './runCardFrameGeometry';
import { InnerChromeBox } from './shared/ChromeBox';

const CARD_PIECE_ORDER: readonly PurchasablePieceType[] = Object.freeze(['pawn', 'knight', 'bishop', 'rook', 'queen']);

function isCardOffer(card: RunCoreCard | RunCardOffer): card is RunCardOffer {
  return 'offerId' in card;
}

export function runCardGrants(card: RunCoreCard | RunCardOffer): RunCardFaceContent['grants'] {
  const showForcedDiscipline = isCardOffer(card)
    && card.cardType === 'tactical'
    && card.pieces.length === 1;
  return CARD_PIECE_ORDER.flatMap((unit) => {
    const pieceIndices = card.pieces.flatMap((piece, index) => piece === unit ? [index] : []);
    const plaguedPieceIndex = isCardOffer(card) ? card.plaguedPieceIndex : null;
    const plaguedIndex = plaguedPieceIndex === null ? -1 : pieceIndices.indexOf(plaguedPieceIndex);
    return pieceIndices.length > 0
      ? [{
          unit,
          count: pieceIndices.length,
          plaguedIndices: plaguedIndex >= 0 ? [plaguedIndex] : [],
          ...(showForcedDiscipline && pieceIndices.length === 1 ? { ability: 'discipline' as const } : {}),
        }]
      : [];
  });
}

function plaguedTargetLabel(card: RunCoreCard | RunCardOffer): string {
  if (!isCardOffer(card) || card.plaguedPieceIndex === null) return '';
  const target = card.pieces[card.plaguedPieceIndex];
  return target ? ` Plagued ${target}.` : '';
}

export function concinnousTargetLabel(card: RunCardOffer): string {
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
  const offer = isCardOffer(card) ? card : null;
  const cardType = offer?.cardType ?? null;
  const frameSlot = cardType === 'pestiferous'
    ? RUN_CARD_PESTIFEROUS_FRAME_SLOT
    : cardType === 'tactical'
      ? RUN_CARD_TACTICAL_FRAME_SLOT
    : cardType === 'concinnous'
      ? RUN_CARD_CONCINNOUS_FRAME_SLOT
      : RUN_CARD_FRAME_SLOT;
  const frameMedia = liveMediaForSlot(frameSlot).media;
  const frameUrl = frameMedia.immutableUrl;
  const cost = offer?.cost ?? card.value;
  const targetLabel = cardType === 'pestiferous'
    ? plaguedTargetLabel(card)
    : cardType === 'concinnous' && offer
      ? ` Positioned: ${purchased ? concinnousTargetLabel(offer) : 'target hidden'}.`
      : '';
  const faceContent = {
    name,
    cost,
    typeLine: cardType === 'pestiferous'
      ? 'Units — Pestiferous'
      : cardType === 'tactical'
        ? 'Units — Tactical'
      : cardType === 'concinnous'
        ? 'Units — Concinnous'
        : 'Units',
    grants: runCardGrants(card),
    properties: cardType === 'concinnous' && offer
      ? [{ name: 'Positioned', target: purchased ? concinnousTargetLabel(offer) : 'Target hidden' }]
      : undefined,
    flavor: runCardFlavor(card),
  } satisfies RunCardFaceContent;
  const face = (
    <RunCardFace
      card={faceContent}
      frameUrl={frameUrl}
      artUrl={artUrl}
      frameGeometry={runCardFrameGeometryForSha(frameMedia.sha256)}
      ariaHidden={mode !== 'reference'}
    />
  );
  if (mode === 'reference') {
    return (
      <span
        className="run-card-action is-reference"
        aria-label={`${name}. ${label}. Worth ${cost} gold.${targetLabel}`}
      >
        {face}
      </span>
    );
  }
  const actionLabel = `${purchased ? 'Purchased' : 'Buy'} ${name} — ${label} — for ${cost} gold.${targetLabel}`;
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

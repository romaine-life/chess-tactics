import type { ReactElement } from 'react';
import { liveMediaForSlot, resolvedLiveMediaUrl } from '@chess-tactics/board-render';
import { runCardArtSlot, runCardName } from '../run/cardNames';
import { cardContentsLabel, type RunCardDefinition, type RunCardOffer } from '../run/model';
import { RunCardFace } from './RunCardFace';
import { runCardFaceContent, runCardFrameSlot } from './runCardFaceContent';
import { runCardFrameGeometryForSlot } from './runCardFrameGeometry';

// One trading-card face shared by live play and reference surfaces. Runtime hosts add only
// interaction around the projected face; formations, names, art, value, and flavor stay canonical.
export function RunCard({
  card,
  identityCard,
  mode,
  emptyPieceIndices = [],
  layoutId,
  disabled = false,
  flying = false,
  onSelect,
}: {
  card: RunCardDefinition | RunCardOffer;
  identityCard?: RunCardDefinition | RunCardOffer;
  /** `grant` is a free take rather than a purchase: same face and affordance, no price. */
  mode: 'sectio' | 'reference' | 'grant';
  emptyPieceIndices?: readonly number[];
  layoutId?: string;
  disabled?: boolean;
  /** This card is currently travelling elsewhere as a carried copy, so its seat prints empty. */
  flying?: boolean;
  onSelect?: (element: HTMLButtonElement) => void;
}): ReactElement {
  const identity = identityCard ?? card;
  const emptyPieces = new Set(emptyPieceIndices);
  const label = cardContentsLabel({ pieces: card.pieces.filter((_, index) => !emptyPieces.has(index)) })
    || 'No units remain';
  const emptySeatLabel = emptyPieces.size
    ? ` ${emptyPieces.size} empty seat${emptyPieces.size === 1 ? '' : 's'}.`
    : '';
  const name = runCardName(identity);
  const frameSlot = runCardFrameSlot(card);
  const faceContent = runCardFaceContent(card, { identity, emptyPieceIndices });
  const valueLabel = faceContent.showsCost ? ` Worth ${faceContent.cost} gold.` : '';
  const face = (
    <RunCardFace
      card={faceContent}
      frameUrl={liveMediaForSlot(frameSlot).media.immutableUrl}
      artUrl={resolvedLiveMediaUrl(runCardArtSlot(identity))}
      frameGeometry={runCardFrameGeometryForSlot(frameSlot)}
      ariaHidden={mode !== 'reference'}
    />
  );
  if (mode === 'reference') {
    return (
      <span className="run-card-action is-reference" aria-label={`${name}. ${card.rarity} card. ${label}.${emptySeatLabel}${valueLabel}`}>
        {face}
      </span>
    );
  }
  const grant = mode === 'grant';
  return (
    <span className="run-card-offer" data-run-sectio-offer-id={layoutId} data-flying={flying ? '' : undefined}>
      <button
        type="button"
        data-ui-sfx={grant ? 'card' : 'gold'}
        className="run-card-action"
        aria-label={grant
          ? `Take ${name} — ${card.rarity} — ${label}.`
          : `Acquire ${name} — ${card.rarity} — ${label} — for ${faceContent.cost} gold.`}
        disabled={disabled}
        onClick={(event) => onSelect?.(event.currentTarget)}
      >
        {face}
      </button>
    </span>
  );
}

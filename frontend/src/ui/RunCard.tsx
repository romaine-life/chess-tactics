import type { ReactElement } from 'react';
import { liveMediaForSlot, resolvedLiveMediaUrl } from '@chess-tactics/board-render';
import { runCardArtSlot, runCardName } from '../run/cardNames';
import { cardContentsLabel, type RunCardDefinition, type RunCardOffer } from '../run/model';
import { RunCardFace, type RunCardFaceTuning, type RunCardOutlineRendering } from './RunCardFace';
import { runCardFaceContent, runCardFrameSlot } from './runCardFaceContent';
import { runCardFrameGeometryForSlot } from './runCardFrameGeometry';
import { runCardFloatClock } from './runCardLife';

// One trading-card face shared by live play and reference surfaces. Runtime hosts add only
// interaction around the projected face; formations, names, art, value, and flavor stay canonical.
export function RunCard({
  card,
  identityCard,
  mode,
  emptyPieceIndices = [],
  layoutId,
  seatIndex,
  disabled = false,
  flying = false,
  outlineRendering,
  tuning,
  crownUrl,
  markFill,
  onSelect,
}: {
  card: RunCardDefinition | RunCardOffer;
  identityCard?: RunCardDefinition | RunCardOffer;
  /** `grant` is a free take rather than a purchase: same face and affordance, no price. */
  mode: 'sectio' | 'reference' | 'grant';
  emptyPieceIndices?: readonly number[];
  layoutId?: string;
  /**
   * The card's place in the row it is offered from, which makes it drift and glow on its own
   * clock. Set it only where this offer IS the physical object on the table: a Sectio offer is
   * the face of a pile, so the pile carries the life and the face inside it does not.
   */
  seatIndex?: number;
  disabled?: boolean;
  /** Review-only: how the footprint outline rasterizes. Omitted, the card prints as it ships. */
  outlineRendering?: RunCardOutlineRendering;
  /** Review-only: the face typography under test. Omitted, the card prints at the approved tuning. */
  tuning?: RunCardFaceTuning;
  /** Omitted, the face resolves the installed priceless-coin mark itself. */
  crownUrl?: string | null;
  /** Omitted, the face uses the saved runtime fill for that mark. */
  markFill?: number;
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
      outlineRendering={outlineRendering}
      {...(tuning === undefined ? {} : { tuning })}
      {...(crownUrl === undefined ? {} : { crownUrl })}
      {...(markFill === undefined ? {} : { markFill })}
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
  const alive = typeof seatIndex === 'number';
  return (
    <span
      className={`run-card-offer${alive ? ' run-card-alive' : ''}`}
      data-run-sectio-offer-id={layoutId}
      data-flying={flying ? '' : undefined}
      style={alive ? runCardFloatClock(seatIndex) : undefined}
    >
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

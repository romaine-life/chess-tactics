import type { ReactElement } from 'react';
import { liveMediaForSlot, resolvedLiveMediaUrl } from '@chess-tactics/board-render';
import { runCardArtSlot, runCardName } from '../run/cardNames';
import {
  CACOCHYMIC_DISPLAY_NAME,
  cardContentsLabel,
  PIECE_LABEL,
  type RunCardOffer,
  type RunCardType,
  type RunCoreCard,
} from '../run/model';
import { RunCardFace } from './RunCardFace';
import {
  isRunCardOffer,
  runCardFaceContent,
  runCardFrameSlot,
} from './runCardFaceContent';
import { runCardFrameGeometryForSlot } from './runCardFrameGeometry';

export function concinnousTargetLabel(card: RunCardOffer): string {
  const targetIndex = card.effectTargetIndex;
  if (!Number.isSafeInteger(targetIndex) || targetIndex === null || !card.pieces[targetIndex]) return 'Target unavailable';
  const target = card.pieces[targetIndex];
  const occurrences = card.pieces.filter((piece) => piece === target).length;
  if (occurrences === 1) return PIECE_LABEL[target];
  const ordinal = card.pieces.slice(0, targetIndex + 1).filter((piece) => piece === target).length;
  return `${PIECE_LABEL[target]} ${ordinal}`;
}

/**
 * What the card says out loud beyond its own face. A state is spoken only while it is
 * public on the face too: a hidden acquisition target is silent in both channels rather
 * than being announced by a sentence the printed card no longer carries (ADR-0339).
 */
function publicTargetLabel(card: RunCoreCard | RunCardOffer, adlected: boolean): string {
  if (!isRunCardOffer(card)) return '';
  if (card.cardType === 'pestiferous') {
    const target = card.cacochymicPieceIndex === null ? null : card.pieces[card.cacochymicPieceIndex];
    return target ? ` ${CACOCHYMIC_DISPLAY_NAME} ${target}.` : '';
  }
  if (card.cardType === 'concinnous' && adlected) {
    return ` Positioned: ${concinnousTargetLabel(card)}.`;
  }
  return '';
}

// One trading-card face shared by the Studio instrument and every Sectio visit,
// art review, and Enchiridion. Runtime hosts add interaction around the approved face;
// they do not substitute a parallel offer-box layout, and they do not build their own
// face content — `runCardFaceContent` is the only projection there is.
export function RunCard({
  card,
  mode,
  cardType: ownedCardType = null,
  adlected = false,
  departing = false,
  layoutId,
  disabled = false,
  onSelect,
}: {
  card: RunCoreCard | RunCardOffer;
  mode: 'sectio' | 'reference';
  /**
   * The property of a card that is no longer an offer — a card the Run HOLDS. An owned
   * card keeps the property under which it was adlected, so its face must keep the matching frame
   * and property strip; an offer still carries its own and ignores this.
   */
  cardType?: RunCardType | null;
  adlected?: boolean;
  departing?: boolean;
  /** Stable Sectio identity used to preserve the card's visual seat across reflow. */
  layoutId?: string;
  disabled?: boolean;
  onSelect?: (element: HTMLButtonElement) => void;
}): ReactElement {
  const label = cardContentsLabel(card);
  const name = runCardName(card);
  const frameSlot = runCardFrameSlot(card, ownedCardType);
  const faceContent = runCardFaceContent(card, { adlected, cardType: ownedCardType });
  const targetLabel = publicTargetLabel(card, adlected);
  const face = (
    <RunCardFace
      card={faceContent}
      frameUrl={liveMediaForSlot(frameSlot).media.immutableUrl}
      artUrl={resolvedLiveMediaUrl(runCardArtSlot(card))}
      frameGeometry={runCardFrameGeometryForSlot(frameSlot)}
      ariaHidden={mode !== 'reference'}
    />
  );
  if (mode === 'reference') {
    return (
      <span
        className="run-card-action is-reference"
        aria-label={`${name}. ${label}. Worth ${faceContent.cost} gold.${targetLabel}`}
      >
        {face}
      </span>
    );
  }
  const actionLabel = `${adlected ? 'Adlected' : 'Adlectio'} ${name} — ${label} — for ${faceContent.cost} gold.${targetLabel}`;
  return (
    <span
      className={`run-card-offer${departing ? ' is-departing' : ''}`}
      data-run-sectio-offer-id={layoutId}
      aria-busy={departing || undefined}
    >
      <button
        type="button"
        data-ui-sfx="gold"
        className={`run-card-action${adlected ? ' is-adlected' : ''}`}
        aria-label={actionLabel}
        disabled={disabled}
        onClick={(event) => onSelect?.(event.currentTarget)}
      >
        {face}
      </button>
    </span>
  );
}

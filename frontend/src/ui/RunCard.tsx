import type { ReactElement } from 'react';
import { liveMediaForSlot, resolvedLiveMediaUrl } from '@chess-tactics/board-render';
import { runCardArtSlot, runCardName } from '../run/cardNames';
import { cardContentsLabel, type RunCardDefinition, type RunCardOffer } from '../run/model';
import { RunCardFace, type RunCardUnitSelection } from './RunCardFace';
import { runCardFaceContent, runCardFrameSlot } from './runCardFaceContent';
import { runCardFrameGeometryForSlot } from './runCardFrameGeometry';

// One trading-card face shared by live play and reference surfaces. Runtime hosts add only
// interaction around the projected face; formations, names, art, value, and flavor stay canonical.
export function RunCard({
  card,
  identityCard,
  mode,
  emptyPieceIndices = [],
  compactEmptyPieceSeats = false,
  highlightedPieceIndex = null,
  pieceSelectionIds = [],
  pieceSelectionLabels = [],
  layoutId,
  disabled = false,
  onSelect,
  onPieceSelect,
}: {
  card: RunCardDefinition | RunCardOffer;
  identityCard?: RunCardDefinition | RunCardOffer;
  mode: 'sectio' | 'reference';
  emptyPieceIndices?: readonly number[];
  compactEmptyPieceSeats?: boolean;
  highlightedPieceIndex?: number | null;
  pieceSelectionIds?: readonly (string | null)[];
  pieceSelectionLabels?: readonly (string | null)[];
  layoutId?: string;
  disabled?: boolean;
  onSelect?: (element: HTMLButtonElement) => void;
  onPieceSelect?: (pieceIndex: number) => void;
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
  const highlightedIndex = highlightedPieceIndex ?? -1;
  const highlightedUnit = card.pieces[highlightedIndex] ?? null;
  const unitHighlight = highlightedUnit === null ? null : {
    unit: highlightedUnit,
    index: card.pieces.slice(0, highlightedIndex).filter((piece) => piece === highlightedUnit).length,
  };
  const pieceIndexForOccurrence = (unit: typeof card.pieces[number], occurrence: number): number => {
    let seen = 0;
    return card.pieces.findIndex((piece) => {
      if (piece !== unit) return false;
      if (seen === occurrence) return true;
      seen += 1;
      return false;
    });
  };
  const unitSelection: RunCardUnitSelection | null = onPieceSelect ? {
    id: (unit, occurrence) => {
      const pieceIndex = pieceIndexForOccurrence(unit, occurrence);
      return pieceIndex < 0 ? null : pieceSelectionIds[pieceIndex] ?? null;
    },
    label: (unit, occurrence) => {
      const pieceIndex = pieceIndexForOccurrence(unit, occurrence);
      return pieceIndex < 0 ? null : pieceSelectionLabels[pieceIndex] ?? null;
    },
    onSelect: (unit, occurrence) => {
      const pieceIndex = pieceIndexForOccurrence(unit, occurrence);
      if (pieceIndex >= 0) onPieceSelect(pieceIndex);
    },
  } : null;
  const face = (
    <RunCardFace
      card={faceContent}
      frameUrl={liveMediaForSlot(frameSlot).media.immutableUrl}
      artUrl={resolvedLiveMediaUrl(runCardArtSlot(identity))}
      frameGeometry={runCardFrameGeometryForSlot(frameSlot)}
      unitHighlight={unitHighlight}
      unitSelection={unitSelection}
      ariaHidden={mode !== 'reference'}
    />
  );
  if (mode === 'reference') {
    return (
      <span className="run-card-action is-reference" aria-label={`${name}. ${label}.${emptySeatLabel}${valueLabel}`}>
        {face}
      </span>
    );
  }
  return (
    <span className="run-card-offer" data-run-sectio-offer-id={layoutId}>
      <button
        type="button"
        data-ui-sfx="gold"
        className="run-card-action"
        aria-label={`Acquire ${name} — ${label} — for ${faceContent.cost} gold.`}
        disabled={disabled}
        onClick={(event) => onSelect?.(event.currentTarget)}
      >
        {face}
      </button>
    </span>
  );
}

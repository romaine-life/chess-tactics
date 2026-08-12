import { useEffect, useState, type ReactElement } from 'react';
import {
  assetFrameSrc,
  studioFamilies,
  type StudioAsset,
  type StudioAssetKind,
  type StudioFamily,
  type StudioFamilyId,
} from '@chess-tactics/board-render/ui/studioBoard';
import { directionCompassCells, rookDirectionLabel, type Direction } from './unitCatalog';
import { ChromeSeatGrid, type ChromeSeat } from './shared/ChromeSeatGrid';

export {
  assetFrameSrc,
  studioFamilies,
  type StudioAsset,
  type StudioAssetKind,
  type StudioFamily,
  type StudioFamilyId,
};

export function useAnimationClock(isPlaying = true, frameCount = 9, frameMs = 150): number {
  const [animationFrame, setAnimationFrame] = useState(0);

  useEffect(() => {
    if (!isPlaying || frameCount <= 1) return undefined;
    const timer = window.setInterval(() => setAnimationFrame((frame) => (frame + 1) % frameCount), frameMs);
    return () => window.clearInterval(timer);
  }, [frameCount, frameMs, isPlaying]);

  useEffect(() => {
    if (frameCount > 0) setAnimationFrame((frame) => frame % frameCount);
  }, [frameCount]);

  return animationFrame;
}

/**
 * The 8-way facing pad, as ONE divided box: nine compartments of one frame, parted by the box's
 * own rails, rather than nine framed squares in a grid with the panel showing through between
 * every pair of them. A seat is not a registered chrome unit — the unit is what brings a frame,
 * and the box already drew one (ADR-0634) — so the current facing is told by its GLYPH, which is
 * the only thing that ever distinguished it here anyway.
 */
export function FacingCompass({ direction, onSelect, onRotate, available, ariaLabel = 'Unit facing (8-way)' }: {
  direction: Direction;
  onSelect: (dir: Direction) => void;
  onRotate: () => void;
  available?: (dir: Direction) => boolean;
  ariaLabel?: string;
}): ReactElement {
  const seats = directionCompassCells.map((cell): ChromeSeat => cell === 'center'
    ? {
      // The centre is an ACTION, not one of the eight choices, so it reports no pressed state.
      id: 'rotate',
      content: '↻',
      className: 'unit-facing-rotate',
      title: 'Rotate clockwise',
      ariaLabel: 'Rotate clockwise',
      onPress: onRotate,
    }
    : {
      id: cell,
      content: rookDirectionLabel[cell],
      selected: direction === cell,
      disabled: available ? !available(cell) : false,
      className: available && !available(cell) ? 'is-unavailable' : undefined,
      title: `Face ${cell}`,
      ariaLabel: `Face ${cell}`,
      onPress: () => onSelect(cell),
    });
  return (
    <ChromeSeatGrid
      className="unit-facing-compass"
      seatClassName="unit-facing-cell"
      rows={[seats.slice(0, 3), seats.slice(3, 6), seats.slice(6, 9)]}
      ariaLabel={ariaLabel}
    />
  );
}

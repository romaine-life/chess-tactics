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
import { chromeUnitClassNames } from './chromeUnitRegistry';
import { ChromeButton } from './shared/ChromeButton';

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

export function FacingCompass({ direction, onSelect, onRotate, available, ariaLabel = 'Unit facing (8-way)' }: {
  direction: Direction;
  onSelect: (dir: Direction) => void;
  onRotate: () => void;
  available?: (dir: Direction) => boolean;
  ariaLabel?: string;
}): ReactElement {
  return (
    <div className="unit-facing-compass" aria-label={ariaLabel}>
      {directionCompassCells.map((cell) =>
        cell === 'center' ? (
          <ChromeButton unit="inner-tool-square"
            key="center"
            className={chromeUnitClassNames('inner-tool-square', 'unit-facing-cell', 'unit-facing-rotate')}
            onClick={onRotate}
            title="Rotate clockwise"
            aria-label="Rotate clockwise"
          >↻</ChromeButton>
        ) : (
          <ChromeButton unit="inner-tool-square"
            key={cell}
            className={chromeUnitClassNames(
              'inner-tool-square',
              'unit-facing-cell',
              direction === cell ? 'is-active' : '',
              available && !available(cell) ? 'is-unavailable' : '',
            )}
            disabled={available ? !available(cell) : false}
            onClick={() => onSelect(cell)}
            title={`Face ${cell}`}
            aria-label={`Face ${cell}`}
            aria-pressed={direction === cell}
          >
            {rookDirectionLabel[cell]}
          </ChromeButton>
        ),
      )}
    </div>
  );
}

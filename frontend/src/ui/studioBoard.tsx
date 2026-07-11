import { useEffect, useState, type ReactElement } from 'react';
import {
  studioFamilies,
  type StudioAsset,
  type StudioAssetKind,
  type StudioFamily,
  type StudioFamilyId,
} from '@chess-tactics/board-render/ui/studioBoard';
import { directionCompassCells, rookDirectionLabel, type Direction } from './unitCatalog';
import { SETTINGS_CHANGE_EVENT } from './motionPreference';

export {
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
    const reducedMotion = () => document.documentElement.classList.contains('reduce-motion');
    const sync = () => {
      if (reducedMotion()) setAnimationFrame(0);
    };
    const timer = window.setInterval(() => setAnimationFrame((frame) => reducedMotion() ? 0 : (frame + 1) % frameCount), frameMs);
    window.addEventListener(SETTINGS_CHANGE_EVENT, sync);
    sync();
    return () => {
      window.clearInterval(timer);
      window.removeEventListener(SETTINGS_CHANGE_EVENT, sync);
    };
  }, [frameCount, frameMs, isPlaying]);

  useEffect(() => {
    if (frameCount > 0) setAnimationFrame((frame) => frame % frameCount);
  }, [frameCount]);

  return animationFrame;
}

export function FacingCompass({ direction, onSelect, onRotate, available }: {
  direction: Direction;
  onSelect: (dir: Direction) => void;
  onRotate: () => void;
  available?: (dir: Direction) => boolean;
}): ReactElement {
  return (
    <div className="unit-facing-compass" aria-label="Unit facing (8-way)">
      {directionCompassCells.map((cell) =>
        cell === 'center' ? (
          <button key="center" type="button" className="unit-facing-cell unit-facing-rotate" onClick={onRotate} title="Rotate clockwise" aria-label="Rotate clockwise">↻</button>
        ) : (
          <button
            key={cell}
            type="button"
            className={`unit-facing-cell${direction === cell ? ' is-active' : ''}${available && !available(cell) ? ' is-unavailable' : ''}`}
            disabled={available ? !available(cell) : false}
            onClick={() => onSelect(cell)}
            title={`Face ${cell}`}
            aria-label={`Face ${cell}`}
          >
            {rookDirectionLabel[cell]}
          </button>
        ),
      )}
    </div>
  );
}

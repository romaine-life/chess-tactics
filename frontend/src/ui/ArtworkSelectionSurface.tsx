import { useEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent, type ReactElement } from 'react';
import type { FloatingArtworkPlacement } from '@chess-tactics/board-render';
import { loadRasterAlphaMask, type RasterAlphaMask } from '../render/rasterAlpha';
import { structureArtAsset, structureArtDirectionSprite } from '../core/structureArt';
import { InnerChromeBox } from './shared/ChromeBox';
import {
  floatingArtworkHitCandidatesAtPoint,
  floatingArtworkSelectionSources,
  continuesFloatingArtworkCycle,
  nextFloatingArtworkCycleIndex,
  type FloatingArtworkCycleState,
  type FloatingArtworkHitCandidate,
} from './floatingArtworkSelection';

const CYCLE_RADIUS_PX = 6;

type PickFeedback = Readonly<{
  candidate: FloatingArtworkHitCandidate;
  candidateIds: readonly string[];
  index: number;
  localX: number;
  localY: number;
}>;

export function ArtworkSelectionSurface({
  placements,
  selectedArtworkId,
  origin,
  zoom,
  pan,
  onSelect,
}: {
  placements: readonly FloatingArtworkPlacement[];
  selectedArtworkId: string | null;
  origin: { left: number; top: number };
  zoom: number;
  pan: { x: number; y: number };
  onSelect: (id: string) => void;
}): ReactElement {
  const sources = useMemo(() => floatingArtworkSelectionSources(placements), [placements]);
  const [alphaBySource, setAlphaBySource] = useState<ReadonlyMap<string, RasterAlphaMask>>(new Map());
  const [alphaSettled, setAlphaSettled] = useState(sources.length === 0);
  const [alphaFailureCount, setAlphaFailureCount] = useState(0);
  const [feedback, setFeedback] = useState<PickFeedback | null>(null);
  const cycleRef = useRef<FloatingArtworkCycleState | null>(null);

  useEffect(() => {
    let cancelled = false;
    setAlphaBySource(new Map());
    setAlphaSettled(sources.length === 0);
    setAlphaFailureCount(0);
    void Promise.all(sources.map(async (source) => [source, await loadRasterAlphaMask(source)] as const))
      .then((loaded) => {
        if (cancelled) return;
        setAlphaBySource(new Map(loaded.flatMap(([source, mask]) => mask ? [[source, mask] as const] : [])));
        setAlphaFailureCount(loaded.filter(([, mask]) => !mask).length);
        setAlphaSettled(true);
      });
    return () => { cancelled = true; };
  }, [sources]);

  useEffect(() => {
    cycleRef.current = null;
    setFeedback(null);
  }, [placements]);

  const pointAt = (event: PointerEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const localX = event.clientX - rect.left;
    const localY = event.clientY - rect.top;
    return {
      localX,
      localY,
      scene: {
        x: (localX - rect.width / 2 - pan.x) / zoom - origin.left,
        y: (localY - rect.height / 2 - pan.y) / zoom - origin.top,
      },
    };
  };

  const candidatesAt = (event: PointerEvent<HTMLDivElement>) => {
    const point = pointAt(event);
    const candidates = floatingArtworkHitCandidatesAtPoint(placements, point.scene, alphaBySource);
    return { ...point, candidates, candidateIds: candidates.map(({ placement }) => placement.id) };
  };

  const updateHover = (event: PointerEvent<HTMLDivElement>): void => {
    const { localX, localY, candidates, candidateIds } = candidatesAt(event);
    if (!candidates.length) {
      setFeedback(null);
      return;
    }
    const cycle = cycleRef.current;
    const index = continuesFloatingArtworkCycle(cycle, candidateIds, localX, localY, CYCLE_RADIUS_PX) ? cycle.index : 0;
    setFeedback({ candidate: candidates[index] ?? candidates[0], candidateIds, index, localX, localY });
  };

  const selectAt = (event: PointerEvent<HTMLDivElement>): void => {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    const { localX, localY, candidates, candidateIds } = candidatesAt(event);
    if (!candidates.length) {
      cycleRef.current = null;
      setFeedback(null);
      return;
    }
    const previous = cycleRef.current;
    const index = nextFloatingArtworkCycleIndex(previous, candidateIds, localX, localY);
    cycleRef.current = { candidateIds, index, localX, localY };
    const candidate = candidates[index] ?? candidates[0];
    setFeedback({ candidate, candidateIds, index, localX, localY });
    onSelect(candidate.placement.id);
  };

  const hoveredPlacement = feedback?.candidate.placement;
  const hoveredSprite = hoveredPlacement
    ? structureArtDirectionSprite(hoveredPlacement.sourceArtId, hoveredPlacement.direction)
    : undefined;
  const hoveredScale = hoveredPlacement && hoveredSprite
    ? hoveredSprite.scale * hoveredPlacement.scale
    : 1;
  const hoveredCenter = hoveredPlacement ? {
    x: (hoveredPlacement.pixelX + origin.left) * zoom + pan.x,
    y: (hoveredPlacement.pixelY + origin.top) * zoom + pan.y,
  } : null;
  const hoveredLabel = hoveredPlacement
    ? structureArtAsset(hoveredPlacement.sourceArtId)?.label ?? hoveredPlacement.sourceArtId
    : '';

  return (
    <div
      className={`le-artwork-selection-surface${feedback ? ' has-candidate' : ''}`}
      data-testid="artwork-selection-surface"
      aria-label="Select scene art by its visible pixels"
      onPointerMove={updateHover}
      onPointerDown={selectAt}
      onPointerLeave={() => setFeedback(null)}
    >
      {!alphaSettled || alphaFailureCount ? (
        <InnerChromeBox
          as="span"
          fillRole="inner"
          className={`le-artwork-pick-preparing${alphaFailureCount ? ' is-error' : ''}`}
          role="status"
        >
          {alphaFailureCount
            ? `${alphaFailureCount} scene art source${alphaFailureCount === 1 ? '' : 's'} could not be measured`
            : 'Preparing scene art selection…'}
        </InnerChromeBox>
      ) : null}
      {feedback && hoveredPlacement && hoveredSprite && hoveredCenter ? (
        <span
          className={`le-floating-artwork-hover${hoveredPlacement.id === selectedArtworkId ? ' is-current' : ''}`}
          data-hovered-artwork-id={hoveredPlacement.id}
          aria-hidden="true"
          style={{
            left: `calc(50% + ${hoveredCenter.x}px)`,
            top: `calc(50% + ${hoveredCenter.y}px)`,
            width: hoveredSprite.w * hoveredScale * zoom,
            height: hoveredSprite.h * hoveredScale * zoom,
          }}
        />
      ) : null}
      {feedback ? (
        <InnerChromeBox
          as="span"
          fillRole="inner"
          className="le-artwork-pick-status"
          data-testid="artwork-pick-status"
          role="status"
          style={{ left: feedback.localX, top: feedback.localY } as CSSProperties}
        >
          {hoveredLabel}{feedback.candidateIds.length > 1
            ? ` · ${feedback.index + 1} of ${feedback.candidateIds.length} here · click again to cycle`
            : ''}
        </InnerChromeBox>
      ) : null}
    </div>
  );
}

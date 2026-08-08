import { useEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent, type ReactElement } from 'react';
import type { FloatingArtworkPlacement } from '@chess-tactics/board-render';
import { loadRasterAlphaMask, type RasterAlphaMask } from '../render/rasterAlpha';
import { structureArtAsset, structureArtDirectionSprite } from '../core/structureArt';
import { InnerChromeBox } from './shared/ChromeBox';
import {
  floatingArtworkHitCandidatesAtPoint,
  floatingArtworkIdsWithinRect,
  floatingArtworkSelectionSources,
  continuesFloatingArtworkCycle,
  nextFloatingArtworkCycleIndex,
  type FloatingArtworkCycleState,
  type FloatingArtworkHitCandidate,
} from './floatingArtworkSelection';

const CYCLE_RADIUS_PX = 6;

/**
 * How far the pointer must travel before a press becomes a rectangle instead of a pick. Below it
 * the gesture is the existing click — including the click-again-to-cycle behaviour, which a hand
 * that wobbles a pixel must never lose.
 */
const MARQUEE_THRESHOLD_PX = 4;

type PickFeedback = Readonly<{
  candidate: FloatingArtworkHitCandidate;
  candidateIds: readonly string[];
  index: number;
  localX: number;
  localY: number;
}>;

type MarqueeDrag = Readonly<{
  pointerId: number;
  additive: boolean;
  startLocalX: number;
  startLocalY: number;
  startSceneX: number;
  startSceneY: number;
  localX: number;
  localY: number;
  sceneX: number;
  sceneY: number;
  /** False until the pointer clears the threshold: an unmoved press is still a pick. */
  active: boolean;
  ids: readonly string[];
}>;

export function ArtworkSelectionSurface({
  placements,
  selectedArtworkId,
  selectedArtworkIds,
  origin,
  zoom,
  pan,
  onSelect,
  onSelectMany,
}: {
  placements: readonly FloatingArtworkPlacement[];
  selectedArtworkId: string | null;
  /** Everything currently selected, so the drag can show what it will hand over. */
  selectedArtworkIds?: readonly string[];
  origin: { left: number; top: number };
  zoom: number;
  pan: { x: number; y: number };
  onSelect: (id: string) => void;
  /** A dragged rectangle's whole catch. `additive` extends the live selection instead of replacing it. */
  onSelectMany?: (ids: readonly string[], additive: boolean) => void;
}): ReactElement {
  const sources = useMemo(() => floatingArtworkSelectionSources(placements), [placements]);
  const [alphaBySource, setAlphaBySource] = useState<ReadonlyMap<string, RasterAlphaMask>>(new Map());
  const [alphaSettled, setAlphaSettled] = useState(sources.length === 0);
  const [alphaFailureCount, setAlphaFailureCount] = useState(0);
  const [feedback, setFeedback] = useState<PickFeedback | null>(null);
  // The gesture lives in a ref and only MIRRORS into state for drawing. A fast drag can deliver
  // several moves and its release inside one task, and a handler reading render state would still
  // see the press that had not been committed yet and drop the whole sweep.
  const marqueeRef = useRef<MarqueeDrag | null>(null);
  const [marquee, setMarqueeState] = useState<MarqueeDrag | null>(null);
  const setMarquee = (next: MarqueeDrag | null): void => {
    marqueeRef.current = next;
    setMarqueeState(next);
  };
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
    setMarquee(null);
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

  const marqueeRect = (drag: MarqueeDrag) => ({
    minX: Math.min(drag.startSceneX, drag.sceneX),
    minY: Math.min(drag.startSceneY, drag.sceneY),
    maxX: Math.max(drag.startSceneX, drag.sceneX),
    maxY: Math.max(drag.startSceneY, drag.sceneY),
  });

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

  const pickAt = (localX: number, localY: number, candidates: readonly FloatingArtworkHitCandidate[], candidateIds: readonly string[]): void => {
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

  // One press starts BOTH gestures and the distance travelled decides which it was: a rectangle
  // once the pointer clears the threshold, otherwise the click-to-pick (and click-again-to-cycle)
  // that was here before. Nothing is selected until release, so a drag that starts on top of an
  // instance still sweeps rather than grabbing that one.
  const beginGesture = (event: PointerEvent<HTMLDivElement>): void => {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    const { localX, localY, scene } = pointAt(event);
    event.currentTarget.setPointerCapture(event.pointerId);
    setMarquee({
      pointerId: event.pointerId,
      additive: event.shiftKey,
      startLocalX: localX, startLocalY: localY,
      startSceneX: scene.x, startSceneY: scene.y,
      localX, localY, sceneX: scene.x, sceneY: scene.y,
      active: false,
      ids: [],
    });
  };

  const extendGesture = (event: PointerEvent<HTMLDivElement>): void => {
    const held = marqueeRef.current;
    if (!held || held.pointerId !== event.pointerId) {
      updateHover(event);
      return;
    }
    event.stopPropagation();
    const { localX, localY, scene } = pointAt(event);
    const active = held.active
      || Math.hypot(localX - held.startLocalX, localY - held.startLocalY) > MARQUEE_THRESHOLD_PX;
    const moved: MarqueeDrag = { ...held, localX, localY, sceneX: scene.x, sceneY: scene.y, active, ids: held.ids };
    setMarquee(active
      ? { ...moved, ids: floatingArtworkIdsWithinRect(placements, marqueeRect(moved), alphaBySource) }
      : moved);
  };

  const endGesture = (event: PointerEvent<HTMLDivElement>): void => {
    const drag = marqueeRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    event.preventDefault();
    event.stopPropagation();
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    setMarquee(null);
    if (!drag.active) {
      const { localX, localY, candidates, candidateIds } = candidatesAt(event);
      pickAt(localX, localY, candidates, candidateIds);
      return;
    }
    cycleRef.current = null;
    const ids = floatingArtworkIdsWithinRect(placements, marqueeRect(drag), alphaBySource);
    onSelectMany?.(ids, drag.additive);
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
  const dragging = marquee?.active ? marquee : null;
  const marqueeBox = dragging ? {
    left: Math.min(dragging.startLocalX, dragging.localX),
    top: Math.min(dragging.startLocalY, dragging.localY),
    width: Math.abs(dragging.localX - dragging.startLocalX),
    height: Math.abs(dragging.localY - dragging.startLocalY),
  } : null;
  const alreadySelected = selectedArtworkIds ?? (selectedArtworkId ? [selectedArtworkId] : []);
  const draggedTotal = dragging
    ? (dragging.additive
      ? new Set([...alreadySelected, ...dragging.ids]).size
      : dragging.ids.length)
    : 0;

  return (
    <div
      className={`le-artwork-selection-surface${feedback && !dragging ? ' has-candidate' : ''}${dragging ? ' is-dragging' : ''}`}
      data-testid="artwork-selection-surface"
      aria-label="Click scene art to select it, or drag out a rectangle to select every piece it touches"
      onPointerMove={extendGesture}
      onPointerDown={beginGesture}
      onPointerUp={endGesture}
      onPointerCancel={() => setMarquee(null)}
      onPointerLeave={() => { if (!marqueeRef.current) setFeedback(null); }}
    >
      {marqueeBox ? (
        <svg
          className="le-artwork-marquee"
          data-testid="artwork-marquee"
          data-marquee-count={draggedTotal}
          aria-hidden="true"
        >
          <rect
            x={marqueeBox.left}
            y={marqueeBox.top}
            width={marqueeBox.width}
            height={marqueeBox.height}
            fill="rgba(111, 210, 255, 0.14)"
            stroke="rgba(111, 210, 255, 0.94)"
            strokeWidth="1"
            strokeDasharray="4 3"
            vectorEffect="non-scaling-stroke"
          />
        </svg>
      ) : null}
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
      {feedback && !dragging && hoveredPlacement && hoveredSprite && hoveredCenter ? (
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
      {dragging ? (
        <InnerChromeBox
          as="span"
          fillRole="inner"
          className="le-artwork-pick-status"
          data-testid="artwork-marquee-status"
          role="status"
          style={{ left: dragging.localX, top: dragging.localY } as CSSProperties}
        >
          {draggedTotal} scene art selected{dragging.additive ? ' · adding' : ''}
        </InnerChromeBox>
      ) : feedback ? (
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

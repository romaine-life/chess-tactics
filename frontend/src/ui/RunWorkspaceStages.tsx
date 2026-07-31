import { useEffect, useRef, useState, type ReactElement, type ReactNode } from 'react';
import { loadingMark, loadingMeasure } from '../diagnostics/loadingTimeline';
import { loadDecodedImage } from '../render/imageResources';
import {
  afterTwoPaintOpportunities,
  renderedCssImageUrls,
  waitForRenderedImage,
} from './shell/PaintedSurfaceBoundary';

// Matches --ds-duration-fade / SCENE_FADE_MS: how long the arriving stage's reveal
// animation runs before the departed workspace can be released.
const STAGE_FADE_MS = 350;

/**
 * In-place Run phase choreography. A Run phase change happens on the committed /run
 * scene, so the route director never covers it; without choreography the swap blanks
 * the workspace to the world background and then pops. This host keeps the previous
 * phase's workspace mounted, visible, and inert while the incoming one composes
 * hidden under the same complete-frame discipline as PaintedSurfaceBoundary
 * (images decoded, nested painted surfaces settled, two paint opportunities), then
 * fades the new workspace in over the old one.
 *
 * The departing stage keeps its exact committed React element and keyed DOM node, so
 * the visible workspace is never rebuilt mid-transition. `stageKey` identifies a
 * resting screen (run id + phase + battle); interactions within one phase re-render
 * the current stage directly.
 */
export function RunWorkspaceStages({
  stageKey,
  placeholderKeys = [],
  children,
}: {
  stageKey: string;
  /** Stages that swap away without choreography (hydration placeholders that only
   *  ever exist beneath the route's own entrance gate). */
  placeholderKeys?: readonly string[];
  children: ReactNode;
}): ReactElement {
  const [state, setState] = useState<{
    currentKey: string;
    arrivedKey: string | null;
    departing: { key: string; content: ReactNode } | null;
  }>({ currentKey: stageKey, arrivedKey: stageKey, departing: null });
  const committedRef = useRef<{ key: string; content: ReactNode }>({ key: stageKey, content: children });
  const currentRef = useRef<HTMLDivElement | null>(null);

  if (stageKey !== state.currentKey) {
    // Derive during render so the first commit of a new phase already renders the old
    // workspace as the visible departing stage and the new one as hidden/preparing.
    setState((previous) => {
      const instant = placeholderKeys.includes(previous.currentKey);
      const previousArrived = previous.arrivedKey === previous.currentKey
        && committedRef.current.key === previous.currentKey;
      return {
        currentKey: stageKey,
        arrivedKey: instant ? stageKey : null,
        // Keep whichever stage the player can actually see: a swap from an arrived
        // stage departs it; an interrupted swap retains the stage already departing
        // and simply drops the prepared-but-never-shown intermediate.
        departing: instant ? null : previousArrived
          ? { key: previous.currentKey, content: committedRef.current.content }
          : previous.departing,
      };
    });
  }

  useEffect(() => {
    committedRef.current = { key: stageKey, content: children };
  });

  useEffect(() => {
    if (state.arrivedKey === state.currentKey || !currentRef.current) return undefined;
    let cancelled = false;
    const key = state.currentKey;
    const root = currentRef.current;
    const startedAt = performance.now();
    const images = [...root.querySelectorAll('img')];
    const cssImages = renderedCssImageUrls(root);
    loadingMark('run-workspace-stage', 'stage-compose-wait-start', {
      stage: key,
      imageCount: images.length,
      cssImageCount: cssImages.length,
    });
    // Nested painted surfaces (the deployment level preview) finish their own compose
    // before this stage is shown, so the arrival is one frame, not staggered pops.
    const nestedSurfacesSettled = (): Promise<void> => new Promise((resolve) => {
      const check = (): void => {
        if (cancelled || !root.querySelector('.painted-surface.is-loading')) resolve();
        else requestAnimationFrame(check);
      };
      check();
    });
    void Promise.all([
      ...images.map(waitForRenderedImage),
      ...cssImages.map((url) => loadDecodedImage(url).then(() => undefined)),
    ])
      // The Run document has already advanced when a swap starts; a failed image must
      // not strand the player on the previous phase, so compose with what loaded.
      .catch(() => undefined)
      .then(nestedSurfacesSettled)
      .then(afterTwoPaintOpportunities)
      .then(() => {
        if (cancelled) return;
        loadingMeasure('run-workspace-stage', 'stage-composed', startedAt, { stage: key });
        setState((previous) => previous.currentKey === key ? { ...previous, arrivedKey: key } : previous);
      });
    return () => { cancelled = true; };
  }, [state.arrivedKey, state.currentKey]);

  useEffect(() => {
    if (!state.departing || state.arrivedKey !== state.currentKey) return undefined;
    const key = state.currentKey;
    const timer = window.setTimeout(() => {
      setState((previous) => previous.currentKey === key ? { ...previous, departing: null } : previous);
    }, STAGE_FADE_MS + 40);
    return () => window.clearTimeout(timer);
  }, [state.arrivedKey, state.currentKey, state.departing]);

  const preparing = state.arrivedKey !== state.currentKey;
  const arriving = !preparing && state.departing !== null;
  return (
    <>
      {state.departing ? (
        <div className="run-stage is-departing" key={state.departing.key} inert aria-hidden="true">
          {state.departing.content}
        </div>
      ) : null}
      <div
        ref={currentRef}
        key={state.currentKey}
        className={`run-stage${preparing ? ' is-preparing' : arriving ? ' is-arriving' : ''}`}
        inert={preparing ? true : undefined}
        aria-hidden={preparing || undefined}
      >
        {children}
      </div>
    </>
  );
}

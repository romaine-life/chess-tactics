function cssTimeMs(value: string): number {
  const trimmed = value.trim();
  if (trimmed.endsWith('ms')) return Number.parseFloat(trimmed) || 0;
  if (trimmed.endsWith('s')) return (Number.parseFloat(trimmed) || 0) * 1000;
  return 0;
}

function maximumTransitionMs(element: Element): number {
  const style = getComputedStyle(element);
  const durations = style.transitionDuration.split(',').map(cssTimeMs);
  const delays = style.transitionDelay.split(',').map(cssTimeMs);
  return durations.reduce((maximum, duration, index) => (
    Math.max(maximum, duration + (delays[index % delays.length] ?? 0))
  ), 0);
}

function transitionCandidates(root: HTMLElement): readonly Element[] {
  const mode = root.dataset.sceneTransitionMode;
  if (mode !== 'contents') return [root];
  return [
    root,
    ...root.children,
    ...root.querySelectorAll(':scope > .painted-surface > .painted-surface-content > *'),
  ];
}

export function sceneTransitionDurationMs(root: HTMLElement = document.documentElement): number {
  const candidates = transitionCandidates(root);
  const measured = candidates.reduce(
    (maximum, candidate) => Math.max(maximum, maximumTransitionMs(candidate)),
    0,
  );
  if (measured > 0) return measured;
  return cssTimeMs(getComputedStyle(document.documentElement).getPropertyValue('--ds-duration-fade'));
}

/**
 * Complete from the browser's actual transition event. The timeout is only a
 * bounded failure path for removed targets or browsers that suppress the event.
 */
export function waitForSceneTransition(
  root: HTMLElement | null,
  complete: () => void,
): () => void {
  let settled = false;
  let firstFrame = 0;
  let secondFrame = 0;
  let fallback = 0;
  const finish = (): void => {
    if (settled) return;
    settled = true;
    complete();
  };
  if (!root) {
    firstFrame = requestAnimationFrame(() => {
      secondFrame = requestAnimationFrame(finish);
    });
    return () => {
      settled = true;
      cancelAnimationFrame(firstFrame);
      cancelAnimationFrame(secondFrame);
    };
  }

  const duration = sceneTransitionDurationMs(root);
  const startedAt = performance.now();
  const onTransitionEnd = (event: TransitionEvent): void => {
    if (!root.contains(event.target as Node) && event.target !== root) return;
    if (performance.now() - startedAt + 24 < duration) return;
    finish();
  };
  root.addEventListener('transitionend', onTransitionEnd, true);
  root.addEventListener('transitioncancel', onTransitionEnd, true);
  if (duration <= 0) {
    firstFrame = requestAnimationFrame(() => {
      secondFrame = requestAnimationFrame(finish);
    });
  } else {
    fallback = window.setTimeout(finish, duration + 120);
  }
  return () => {
    settled = true;
    root.removeEventListener('transitionend', onTransitionEnd, true);
    root.removeEventListener('transitioncancel', onTransitionEnd, true);
    cancelAnimationFrame(firstFrame);
    cancelAnimationFrame(secondFrame);
    window.clearTimeout(fallback);
  };
}

export function cssTimeMs(value: string): number {
  const trimmed = value.trim();
  if (trimmed.endsWith('ms')) return Number.parseFloat(trimmed) || 0;
  if (trimmed.endsWith('s')) return (Number.parseFloat(trimmed) || 0) * 1000;
  return 0;
}

/** Resolve the shared UI fade as browser timing rather than copying its values into feature code. */
export function uiFadeTiming(
  root: Element = document.documentElement,
  easingToken = '--ds-ease-standard',
): KeyframeAnimationOptions {
  const style = getComputedStyle(root);
  const duration = cssTimeMs(style.getPropertyValue('--ds-duration-fade'));
  const easing = style.getPropertyValue(easingToken).trim();
  if (duration <= 0 || !easing) {
    throw new Error('The shared UI fade tokens are unavailable.');
  }
  return { duration, easing, fill: 'both' };
}

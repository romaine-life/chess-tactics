import type { ReactElement } from 'react';

/**
 * Canonical solid direction arrow used by screen-space nudge controls.
 *
 * The source shape points up. Rotate clockwise in screen degrees so every
 * direction keeps the exact same icon weight and geometry.
 */
export function DirectionArrowIcon({
  degrees,
  size = 14,
}: {
  degrees: number;
  size?: number;
}): ReactElement {
  return (
    <svg
      className="direction-arrow-icon"
      viewBox="0 0 24 24"
      width={size}
      height={size}
      aria-hidden="true"
      style={{ display: 'block', transform: `rotate(${degrees}deg)` }}
    >
      <path
        d="M12 4 L19 13 L14.5 13 L14.5 20 L9.5 20 L9.5 13 L5 13 Z"
        fill="currentColor"
      />
    </svg>
  );
}

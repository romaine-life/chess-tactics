import type { CSSProperties, ReactElement } from 'react';

/** The accepted default runtime identity; review candidates live in the paired review slot. */
export const RUN_CARD_BACK_SLOT = 'ui/run/card-back/standard.png';
export const RUN_CARD_BACK_REVIEW_SLOT = 'review/run-card-back/standard.png';

/**
 * One complete, universal face-down card. Hosts choose the exact media version;
 * the object itself never learns which card it conceals.
 */
export function RunCardBack({
  mediaUrl,
  width,
  className = '',
  onLoad,
  onError,
}: {
  mediaUrl: string;
  width?: string;
  className?: string;
  onLoad?: () => void;
  onError?: () => void;
}): ReactElement {
  return (
    <img
      src={mediaUrl}
      alt="Face-down card"
      className={`run-card-back${className ? ` ${className}` : ''}`}
      style={width ? { inlineSize: width } as CSSProperties : undefined}
      draggable={false}
      onLoad={onLoad}
      onError={onError}
    />
  );
}

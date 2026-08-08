import type { CSSProperties, ReactElement } from 'react';
import { liveMediaSlotsWithPrefix, resolvedLiveMediaUrl } from '@chess-tactics/board-render';
import { useAppSettings, type RunCardBack as RunCardBackId } from '../settings/appSettings';
import { RUN_CARD_BACK_SLOT_PREFIX, runCardBackSlot } from '../settings/runCardBack';

/** The accepted default runtime identity; review candidates live in the paired review slot. */
export const RUN_CARD_BACK_SLOT = 'ui/run/card-back/standard.png';
export const RUN_CARD_BACK_REVIEW_SLOT = 'review/run-card-back/standard.png';

/**
 * The back this player chose, resolved to pixels.
 *
 * Every face-down card in the Run reads this rather than a slot literal, so the choice cannot take
 * effect on one surface and not another — Sectio's piles and Deployment's stack are the same object
 * to the player and must never disagree about what the back looks like.
 *
 * The installed check is not defensive padding. The offered set is a code constant and the
 * installed set is live media, and the two are allowed to disagree in both directions: a build can
 * reach a catalog that predates one of its backs, and a back can be retired from media while a
 * player still has it stored. `liveMediaForSlot` THROWS on a slot the catalog does not carry, and
 * a throw here is a Run that cannot draw a face-down card at all — so an unresolvable choice falls
 * back to the universal slot, which is availability-critical and always present.
 */
export function runCardBackMediaUrl(back: RunCardBackId): string {
  const chosen = runCardBackSlot(back);
  const installed = liveMediaSlotsWithPrefix(RUN_CARD_BACK_SLOT_PREFIX).some((entry) => entry.slot === chosen);
  return resolvedLiveMediaUrl(installed ? chosen : RUN_CARD_BACK_SLOT);
}

export function useRunCardBackMediaUrl(): string {
  return runCardBackMediaUrl(useAppSettings().runCardBack);
}

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

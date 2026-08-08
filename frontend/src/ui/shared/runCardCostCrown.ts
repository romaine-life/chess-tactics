import { optionalLiveMediaForSlot } from '@chess-tactics/board-render';
import { useEffect, useState } from 'react';
import { fetchAdminLiveMediaCatalog } from '../../net/liveMediaAdmin';

export const RUN_CARD_COST_CROWN_SLOT = 'ui/run/card-prototypes/cost-crown-v1.png';
export const RUN_CARD_COST_CROWN_REVIEW_PARAM = 'crownCandidate';
export const RUN_CARD_COST_CROWN_NATIVE = Object.freeze({ width: 64, height: 64 });

/**
 * The mark struck on a coin that carries no price (ADR-0530). The coin is the socket; the
 * numeral and this crown are the two things that can be struck on it, and they take the same
 * seat at the same size. Resolution is optional on purpose: before the mark is accepted the
 * coin simply prints as it always did, so no screen depends on a candidate.
 */
export function runCardCostCrownUrl(): string | null {
  return optionalLiveMediaForSlot(RUN_CARD_COST_CROWN_SLOT)?.media.immutableUrl ?? null;
}

export type RunCardCostCrownSource = Readonly<{ url: string | null }>;

function reviewVersionId(): string {
  if (typeof window === 'undefined') return '';
  return new URLSearchParams(window.location.search).get(RUN_CARD_COST_CROWN_REVIEW_PARAM)?.trim() ?? '';
}

/**
 * The installed mark, or an exact private candidate named by the review address. Reviewing a
 * candidate is how a crown is chosen before anything is promoted: the owner opens the real
 * gallery on `?crownCandidate=<versionId>` and reads the mark off the real coins.
 */
export function useRunCardCostCrownSource(): RunCardCostCrownSource {
  const versionId = reviewVersionId();
  const [reviewUrl, setReviewUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!versionId) return undefined;
    let cancelled = false;
    void fetchAdminLiveMediaCatalog()
      .then((catalog) => {
        if (cancelled) return;
        const version = catalog.versions.find((candidate) => (
          candidate.id === versionId
          && candidate.slot === RUN_CARD_COST_CROWN_SLOT
          && candidate.media?.mediaType === 'image/png'
          && candidate.media?.width === RUN_CARD_COST_CROWN_NATIVE.width
          && candidate.media?.height === RUN_CARD_COST_CROWN_NATIVE.height
        )) ?? null;
        setReviewUrl(version?.media?.immutableUrl ?? version?.media?.url ?? null);
      })
      .catch(() => {
        // A candidate that cannot be read leaves the installed mark in place rather than
        // blanking the gallery the owner opened to look at it.
        if (!cancelled) setReviewUrl(null);
      });
    return () => { cancelled = true; };
  }, [versionId]);

  return { url: versionId ? reviewUrl : runCardCostCrownUrl() };
}

import { optionalLiveMediaForSlot } from '@chess-tactics/board-render';
import { useEffect, useState } from 'react';
import { fetchAdminLiveMediaCatalog, type AdminLiveMediaVersion } from '../../net/liveMediaAdmin';
import geometry from './runCardGoldTierDividerGeometry.json';

export const RUN_CARD_COST_CROWN_SLOT = 'ui/run/card-prototypes/cost-crown-v1.png';
export const RUN_CARD_COST_CROWN_REVIEW_PARAM = 'crownCandidate';
export const RUN_CARD_COST_CROWN_NATIVE = Object.freeze({ width: 64, height: 64 });

/**
 * The struck mark's share of the drawn coin, in whole percent, owned by the Studio's Card Gold
 * Divider instrument rather than by a number typed into a stylesheet. A coin is a coin wherever
 * it is drawn, so this one value sizes the mark on the gallery bands and on the card face alike.
 */
export const RUN_CARD_COIN_MARK_FILL = geometry.mark.fill;

export const RUN_CARD_COIN_MARK_LIMITS = Object.freeze({ fill: Object.freeze({ min: 40, max: 100 }) });

/**
 * The coin raster carries its own rim margin: the drawn coin is 105 of the 112px raster, so a
 * share OF THE COIN is this much of the box the raster is given.
 */
export const RUN_CARD_COIN_RASTER_INSET = 105 / 112;

/** The whole drawn coin on a card face, in card-width units — twice the face clip's radius. */
export const RUN_CARD_COIN_DIAMETER_CQW = 9.9;

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

export type RunCardCostCrownCandidate = Readonly<{
  versionId: string;
  url: string;
  label: string;
  sha256: string;
  installed: boolean;
}>;

/**
 * Every mark that has been generated for the coin, installed or still under review, so the
 * Studio can mount them together on the real coins instead of asking for one address per
 * candidate. Reviewing by sight is the whole point of the instrument.
 */
export function runCardCostCrownCandidates(
  versions: readonly AdminLiveMediaVersion[],
  activeVersionId: string | null,
): readonly RunCardCostCrownCandidate[] {
  return versions
    .filter((version) => (
      version.slot === RUN_CARD_COST_CROWN_SLOT
      && version.media?.mediaType === 'image/png'
      && version.media?.width === RUN_CARD_COST_CROWN_NATIVE.width
      && version.media?.height === RUN_CARD_COST_CROWN_NATIVE.height
    ))
    .map((version) => ({
      versionId: version.id,
      url: version.media?.immutableUrl ?? version.media?.url ?? '',
      label: version.label || version.id.slice(0, 8),
      sha256: version.media?.sha256 ?? '',
      installed: version.id === activeVersionId,
    }))
    .filter((candidate) => Boolean(candidate.url));
}

export type RunCardCostCrownReview = Readonly<{
  candidates: readonly RunCardCostCrownCandidate[];
  status: 'loading' | 'ready' | 'error';
  message: string;
}>;

/** The Studio's own read: every candidate for the mark, newest last, with the installed one named. */
export function useRunCardCostCrownCandidates(): RunCardCostCrownReview {
  const [review, setReview] = useState<RunCardCostCrownReview>({ candidates: [], status: 'loading', message: '' });
  useEffect(() => {
    let cancelled = false;
    void fetchAdminLiveMediaCatalog()
      .then((catalog) => {
        if (cancelled) return;
        const slot = catalog.slots.find((entry) => entry.slot === RUN_CARD_COST_CROWN_SLOT) ?? null;
        setReview({
          candidates: runCardCostCrownCandidates(catalog.versions, slot?.activeVersionId ?? null),
          status: 'ready',
          message: slot ? '' : 'No mark has been uploaded for the coin yet.',
        });
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setReview({
          candidates: [],
          status: 'error',
          message: error instanceof Error ? error.message : 'Unable to read the coin mark candidates.',
        });
      });
    return () => { cancelled = true; };
  }, []);
  return review;
}

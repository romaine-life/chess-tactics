import { resolvedLiveMediaUrl, type RunCardTier } from '@chess-tactics/board-render';
import { useEffect, useState, type CSSProperties, type ReactElement } from 'react';
import {
  fetchAdminLiveMediaCatalog,
  type AdminLiveMediaCatalog,
  type AdminLiveMediaSlot,
  type AdminLiveMediaVersion,
} from '../../net/liveMediaAdmin';
import { RunCardCostCoin } from './RunCardCostCoin';
import geometry from './runCardGoldTierDividerGeometry.json';

export const RUN_CARD_GOLD_TIER_DIVIDER_SLOT = 'ui/run/card-prototypes/gold-tier-divider-v1.png';
export const RUN_CARD_GOLD_TIER_DIVIDER_SHA256 = '230eab0e82646434ee603bbcb624a27d44dc3c4f81e2f68c2fa23ae1d0fb18c0';
export const RUN_CARD_GOLD_TIER_DIVIDER_REVIEW_PARAM = 'goldTierDividerReview';
export const RUN_CARD_GOLD_TIER_DIVIDER_PROOF_SCHEMA = 'run-card-gold-tier-divider-enchiridion-proof-v1';
export const RUN_CARD_GOLD_TIER_DIVIDER_PROOF_RENDERER = 'RunCardGoldTierDivider/Enchiridion';
export const RUN_CARD_GOLD_TIER_DIVIDER_SLICE = Object.freeze({ top: 138, right: 56, bottom: 139, left: 132 });
export const RUN_CARD_GOLD_TIER_DIVIDER_DRAW = Object.freeze({ height: 38, left: 47, right: 20 });

export interface RunCardGoldTierDividerSelection {
  version: AdminLiveMediaVersion;
  slot: AdminLiveMediaSlot;
}

export interface RunCardGoldTierCoinTuning {
  size: number;
  x: number;
  y: number;
}

export const RUN_CARD_GOLD_TIER_COIN_LIMITS = Object.freeze({
  size: Object.freeze({ min: 16, max: 40 }),
  x: Object.freeze({ min: 0, max: 32 }),
  y: Object.freeze({ min: -6, max: 16 }),
});
export const RUN_CARD_GOLD_TIER_COIN_DEFAULTS: Readonly<RunCardGoldTierCoinTuning> = Object.freeze({
  size: geometry.coin.size,
  x: geometry.coin.x,
  y: geometry.coin.y,
});

export function runCardGoldTierDividerSelection(
  catalog: AdminLiveMediaCatalog,
  versionId: string,
): RunCardGoldTierDividerSelection | null {
  const slot = catalog.slots.find((candidate) => candidate.slot === RUN_CARD_GOLD_TIER_DIVIDER_SLOT) ?? null;
  const version = catalog.versions.find((candidate) => (
    candidate.id === versionId
    && candidate.slot === RUN_CARD_GOLD_TIER_DIVIDER_SLOT
    && (candidate.status === 'candidate' || candidate.status === 'accepted')
    && candidate.media?.sha256 === RUN_CARD_GOLD_TIER_DIVIDER_SHA256
    && candidate.media?.mediaType === 'image/png'
    && candidate.media?.width === 688
    && candidate.media?.height === 384
  )) ?? null;
  return slot && version ? { slot, version } : null;
}

export function runCardGoldTierDividerReviewHref(versionId: string): string {
  return `/enchiridion/cards?${RUN_CARD_GOLD_TIER_DIVIDER_REVIEW_PARAM}=${encodeURIComponent(versionId)}`;
}

export function runCardGoldTierDividerReviewProof(input: {
  version: AdminLiveMediaVersion;
  slot: AdminLiveMediaSlot;
  surfaceUrl: string;
}): Record<string, unknown> {
  const { version, slot, surfaceUrl } = input;
  return {
    schema: RUN_CARD_GOLD_TIER_DIVIDER_PROOF_SCHEMA,
    renderer: RUN_CARD_GOLD_TIER_DIVIDER_PROOF_RENDERER,
    surfaceUrl,
    canonicalScale: 1,
    spatialResampling: true,
    frameWidth: 688,
    frameHeight: 384,
    drawHeight: RUN_CARD_GOLD_TIER_DIVIDER_DRAW.height,
    leftCapWidth: RUN_CARD_GOLD_TIER_DIVIDER_DRAW.left,
    rightCapWidth: RUN_CARD_GOLD_TIER_DIVIDER_DRAW.right,
    slice: RUN_CARD_GOLD_TIER_DIVIDER_SLICE,
    selectedCandidates: [{
      slot: RUN_CARD_GOLD_TIER_DIVIDER_SLOT,
      versionId: version.id,
      sha256: version.media?.sha256,
      rowRevision: version.rowRevision,
    }],
    slotSnapshots: [{
      slot: RUN_CARD_GOLD_TIER_DIVIDER_SLOT,
      rowRevision: slot.rowRevision,
      activeVersionId: slot.activeVersionId,
    }],
  };
}

export type RunCardGoldTierDividerSource =
  | { status: 'ready'; url: string; review: RunCardGoldTierDividerSelection | null }
  | { status: 'loading'; review: null }
  | { status: 'error'; message: string; review: null };

/** Resolves the installed ornament, or an exact private candidate on its review URL. */
export function useRunCardGoldTierDividerSource(): RunCardGoldTierDividerSource {
  const reviewVersionId = typeof window === 'undefined'
    ? ''
    : new URLSearchParams(window.location.search).get(RUN_CARD_GOLD_TIER_DIVIDER_REVIEW_PARAM)?.trim() ?? '';
  const installedUrl = reviewVersionId ? '' : resolvedLiveMediaUrl(RUN_CARD_GOLD_TIER_DIVIDER_SLOT);
  const [reviewSource, setReviewSource] = useState<RunCardGoldTierDividerSource>({ status: 'loading', review: null });

  useEffect(() => {
    if (!reviewVersionId) return undefined;
    let cancelled = false;
    void fetchAdminLiveMediaCatalog()
      .then((catalog) => {
        if (cancelled) return;
        const selection = runCardGoldTierDividerSelection(catalog, reviewVersionId);
        const url = selection?.version.media?.immutableUrl ?? selection?.version.media?.url ?? '';
        setReviewSource(selection && url
          ? { status: 'ready', url, review: selection }
          : { status: 'error', message: 'The requested gold-tier divider candidate is unavailable.', review: null });
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setReviewSource({
            status: 'error',
            message: error instanceof Error ? error.message : 'Unable to load the gold-tier divider candidate.',
            review: null,
          });
        }
      });
    return () => { cancelled = true; };
  }, [reviewVersionId]);

  return reviewVersionId ? reviewSource : { status: 'ready', url: installedUrl, review: null };
}

function DividerSlice({ sourceUrl, viewBox }: { sourceUrl: string; viewBox: string }): ReactElement {
  return (
    <svg viewBox={viewBox} preserveAspectRatio="none" focusable="false">
      <image href={sourceUrl} x="0" y="0" width="688" height="384" preserveAspectRatio="none" />
    </svg>
  );
}

/** How a band of the card gallery names itself in prose and to a screen reader. */
export function runCardTierLabel(value: RunCardTier): string {
  return value === 'starter' ? 'Starter cards' : `${value} gold cards`;
}

/**
 * Text-free generated metalwork around the existing live gold-value coin. Every band seats the
 * same coin; the starter band's is struck blank, because that card carries no price.
 */
export function RunCardGoldTierDivider({
  value,
  source,
  coinTuning = RUN_CARD_GOLD_TIER_COIN_DEFAULTS,
}: {
  value: RunCardTier;
  source: RunCardGoldTierDividerSource;
  coinTuning?: RunCardGoldTierCoinTuning;
}): ReactElement {
  if (source.status === 'error') throw new Error(source.message);
  if (source.status === 'loading') {
    return <span className="run-card-gold-tier-divider is-loading" aria-label={runCardTierLabel(value)} />;
  }
  const tuningStyle = {
    '--run-card-gold-tier-coin-size': `${coinTuning.size}px`,
    '--run-card-gold-tier-coin-x': `${coinTuning.x}px`,
    '--run-card-gold-tier-coin-y': `${coinTuning.y}px`,
  } as CSSProperties;
  return (
    <span
      className="run-card-gold-tier-divider"
      data-gold-tier-divider-ready="true"
      data-gold-tier-coin-size={coinTuning.size}
      data-gold-tier-coin-x={coinTuning.x}
      data-gold-tier-coin-y={coinTuning.y}
      style={tuningStyle}
    >
      <span className="run-card-gold-tier-divider-art" aria-hidden="true">
        <DividerSlice sourceUrl={source.url} viewBox="0 138 132 107" />
        <DividerSlice sourceUrl={source.url} viewBox="132 138 500 107" />
        <DividerSlice sourceUrl={source.url} viewBox="632 138 56 107" />
      </span>
      <RunCardCostCoin value={value} className="enchiridion-card-group-gold" />
    </span>
  );
}

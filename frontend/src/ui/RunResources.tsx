import { drawableAssets } from '@chess-tactics/board-render';
import type { ReactElement } from 'react';
import { formatGold } from '../run/model';

const GOLD_CANDIDATE_QUERY = 'goldCandidate';
const SHA256 = /^[0-9a-f]{64}$/;

function reviewedGoldCandidateSrc(): string | null {
  if (typeof window === 'undefined') return null;
  const sha256 = new URLSearchParams(window.location.search).get(GOLD_CANDIDATE_QUERY)?.trim().toLowerCase();
  return sha256 && SHA256.test(sha256) ? `/api/admin/media/${sha256}` : null;
}

function installedGoldIconSrc(): string | null {
  const matches = drawableAssets('run-resource').filter((asset) => asset.behavior.resourceId === 'gold');
  if (matches.length === 0) return null;
  if (matches.length !== 1) throw new Error(`drawable catalog has ${matches.length} installed Run gold resources`);
  const src = matches[0].media.icon?.media.immutableUrl;
  if (!src) throw new Error('installed Run gold resource has no icon media');
  return src;
}

export function RunGoldIcon({
  className = '',
  src: override,
}: {
  className?: string;
  /** Review-only: paint exact candidate bytes in the real seat without installing them. */
  src?: string;
}): ReactElement {
  const src = override ?? reviewedGoldCandidateSrc() ?? installedGoldIconSrc();
  return (
    <span className={`run-gold-icon${src ? '' : ' is-unavailable'} ${className}`.trim()} aria-hidden="true">
      {src ? <img src={src} alt="" draggable={false} /> : <span>?</span>}
    </span>
  );
}

export function RunGoldAmount({
  valueTenths,
  className = '',
  iconSrc,
}: {
  valueTenths: number;
  className?: string;
  iconSrc?: string;
}): ReactElement {
  const value = formatGold(valueTenths);
  return (
    <span className={`run-gold-amount ${className}`.trim()} aria-label={`${value} gold`}>
      <RunGoldIcon src={iconSrc} />
      <span aria-hidden="true">{value}</span>
    </span>
  );
}

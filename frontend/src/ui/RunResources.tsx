import { drawableAssets } from '@chess-tactics/board-render';
import type { ReactElement } from 'react';
import { formatGold } from '../run/model';

const GOLD_CANDIDATE_QUERY = 'goldCandidate';
const GOLD_TRANSACTION_CANDIDATE_QUERY = {
  gain: 'goldGainCandidate',
  loss: 'goldLossCandidate',
} as const;
const SHA256 = /^[0-9a-f]{64}$/;

export type RunGoldTransactionDirection = keyof typeof GOLD_TRANSACTION_CANDIDATE_QUERY;

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

function reviewedGoldTransactionCandidateSrc(direction: RunGoldTransactionDirection): string | null {
  if (typeof window === 'undefined') return null;
  const query = GOLD_TRANSACTION_CANDIDATE_QUERY[direction];
  const sha256 = new URLSearchParams(window.location.search).get(query)?.trim().toLowerCase();
  return sha256 && SHA256.test(sha256) ? `/api/admin/media/${sha256}` : null;
}

function installedGoldTransactionIconSrc(direction: RunGoldTransactionDirection): string | null {
  const matches = drawableAssets('run-gold-transaction')
    .filter((asset) => asset.behavior.direction === direction);
  if (matches.length === 0) return null;
  if (matches.length !== 1) {
    throw new Error(`drawable catalog has ${matches.length} installed Run gold ${direction} transactions`);
  }
  const src = matches[0].media.icon?.media.immutableUrl;
  if (!src) throw new Error(`installed Run gold ${direction} transaction has no icon media`);
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

export function RunGoldTransactionIcon({
  direction,
  src: override,
}: {
  direction: RunGoldTransactionDirection;
  /** Review-only: paint exact candidate bytes in the real seat without installing them. */
  src?: string;
}): ReactElement {
  const src = override
    ?? reviewedGoldTransactionCandidateSrc(direction)
    ?? installedGoldTransactionIconSrc(direction);
  return (
    <span className={`run-gold-transaction-icon is-${direction}${src ? '' : ' is-unavailable'}`} aria-hidden="true">
      {src ? <img src={src} alt="" draggable={false} /> : <span>?</span>}
    </span>
  );
}

export function RunGoldTransactionAmount({
  direction,
  valueTenths,
  className = '',
  iconSrc,
  pendingLabel = 'No gold transaction selected',
  pendingValue = '—',
}: {
  direction: RunGoldTransactionDirection;
  valueTenths: number | null;
  className?: string;
  iconSrc?: string;
  pendingLabel?: string;
  pendingValue?: string;
}): ReactElement {
  const value = valueTenths === null ? null : formatGold(valueTenths);
  const disposition = direction === 'gain' ? 'gained' : 'lost';
  return (
    <span
      className={`run-gold-transaction-amount is-${direction}${value === null ? ' is-pending' : ''} ${className}`.trim()}
      aria-label={value === null ? pendingLabel : `${value} gold ${disposition}`}
    >
      {value === null ? null : <RunGoldTransactionIcon direction={direction} src={iconSrc} />}
      <span className="run-gold-transaction-value" aria-hidden="true">{value ?? pendingValue}</span>
    </span>
  );
}

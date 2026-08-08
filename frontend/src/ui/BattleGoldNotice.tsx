import { useEffect, type CSSProperties, type ReactElement } from 'react';
import type { BattleGoldNotice } from '../game/store';
import { formatGold } from '../run/model';
import { RunGoldIcon } from './RunResources';

/**
 * How long one marker rises before it is dropped from the store. The CSS animation owns the
 * motion; this only has to outlast it, so a marker is never removed mid-rise.
 */
export const GOLD_NOTICE_RISE_MS = 1500;

/** `+5` / `-3`, in the same gold vocabulary every other Run surface uses. */
export function goldNoticeLabel(goldTenths: number): string {
  return `${goldTenths > 0 ? '+' : '−'}${formatGold(Math.abs(goldTenths))}`;
}

/**
 * Gold the Run just moved, rising off the square that moved it.
 *
 * It is seated in transformed board space so it follows camera pan like the promotion picker,
 * with the inverse scale keeping the number one legible screen size at any zoom. Nothing here
 * is authority: the balance is the Run document's, and the same notice already wrote the log
 * line. This is only the part the player can see happen where it happened.
 */
export function BattleGoldNoticeMarker({
  notice,
  boardSeat,
  boardZoom,
  onRetire,
}: {
  notice: BattleGoldNotice;
  /** The notice cell's projected board-space seat, from the same projection the pieces use. */
  boardSeat: { left: number; top: number };
  boardZoom: number;
  onRetire: (id: string) => void;
}): ReactElement {
  const { id } = notice;
  useEffect(() => {
    const timer = setTimeout(() => onRetire(id), GOLD_NOTICE_RISE_MS);
    return () => clearTimeout(timer);
  }, [id, onRetire]);

  const zoom = Math.max(0.25, boardZoom);
  const label = goldNoticeLabel(notice.goldTenths);
  const style: CSSProperties = {
    transform: `scale(${1 / zoom})`,
    transformOrigin: 'bottom center',
    // Start clear of the unit's head rather than through it, at a distance that does not
    // grow with zoom. A standing unit reaches about 150px above its cell anchor — the same
    // clearance the promotion picker leaves.
    bottom: 150 / zoom,
  };

  return (
    <div
      className="skirmish-gold-notice-anchor"
      style={{ left: boardSeat.left, top: boardSeat.top }}
    >
      <div
        className={`skirmish-gold-notice${notice.goldTenths < 0 ? ' is-loss' : ''}`}
        style={style}
        role="status"
        aria-label={`${label} gold`}
      >
        <RunGoldIcon />
        <span aria-hidden="true">{label}</span>
      </div>
    </div>
  );
}

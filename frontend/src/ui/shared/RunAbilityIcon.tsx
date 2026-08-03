import type { ReactElement, ReactEventHandler } from 'react';
import type { RunAbility } from '../../run/model';
import { installedUiMedia } from '../installedUiMedia';

/** The unit states that own an accepted paired icon (ADR-0339). */
export type RunUnitState = RunAbility | 'cacochymic';

/**
 * Each unit state resolves its own typed `unit-ability-icon` role. The runtime never
 * substitutes a shield, movement glyph, flag, Unicode character, or the paired card
 * property's icon for one of these (ADR-0318, ADR-0339). Every locator on the right
 * keeps the word its slot was coined under; those are non-presentational storage
 * identities and move only in ADR-0339's paired-icon production cutover
 * (ADR-0341, ADR-0343, ADR-0369).
 */
const RUN_UNIT_STATE_MEDIA_ROLE: Readonly<Record<RunUnitState, string>> = Object.freeze({
  adlected: 'ui-kit-icons-game-discipline-png',
  eutactic: 'ui-kit-icons-game-positioned-png',
  agminate: 'ui-kit-icons-game-marshalled-png',
  cacochymic: 'ui-kit-icons-game-plagued-png',
});

export function runUnitStateIconUrl(state: RunUnitState): string {
  return installedUiMedia(RUN_UNIT_STATE_MEDIA_ROLE[state]);
}

/**
 * The shared compact unit-state icon seat. Accepted live rasters and the review
 * instrument's exact candidate URLs use the same element; only the review passes `src`.
 */
export function RunAbilityIcon({
  ability,
  className = '',
  label,
  src,
  onLoad,
  onError,
}: {
  ability: RunUnitState;
  className?: string;
  label?: string;
  src?: string;
  onLoad?: ReactEventHandler<HTMLImageElement>;
  onError?: ReactEventHandler<HTMLImageElement>;
}): ReactElement {
  return (
    <img
      className={`run-ability-icon ${className}`.trim()}
      src={src ?? runUnitStateIconUrl(ability)}
      alt={label ?? ''}
      aria-hidden={label ? undefined : 'true'}
      draggable={false}
      onLoad={onLoad}
      onError={onError}
    />
  );
}

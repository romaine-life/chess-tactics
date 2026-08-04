import type { ReactElement, ReactEventHandler } from 'react';
import type { RunAbility } from '../../run/model';
import { installedUiMedia } from '../installedUiMedia';

/** The unit states that own an accepted paired icon (ADR-0339). */
export type RunUnitState = RunAbility | 'cacochymic';

/**
 * Each unit state resolves its own typed `unit-ability-icon` role. The runtime never
 * substitutes a shield, movement glyph, flag, Unicode character, or the paired card
 * property's icon for one of these (ADR-0318, ADR-0339). Since ADR-0374 each locator
 * is the state's own word: the slot, the stored value and the name a player reads are
 * one vocabulary.
 */
const RUN_UNIT_STATE_MEDIA_ROLE: Readonly<Record<RunUnitState, string>> = Object.freeze({
  adlected: 'ui-kit-icons-game-adlected-png',
  eutactic: 'ui-kit-icons-game-eutactic-png',
  agminate: 'ui-kit-icons-game-agminate-png',
  primogeniture: 'ui-kit-icons-game-primogeniture-png',
  cacochymic: 'ui-kit-icons-game-cacochymic-png',
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

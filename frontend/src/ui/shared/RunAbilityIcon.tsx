import type { ReactElement } from 'react';
import type { RunAbility } from '../../run/model';

const RUN_ABILITY_ICON_CLASS: Readonly<Record<RunAbility, string>> = Object.freeze({
  discipline: 'skirmish-icon-shield',
  positioned: 'skirmish-icon-move',
  marshalled: 'skirmish-icon-flag',
});

export function runAbilityIconClass(ability: RunAbility): string {
  return RUN_ABILITY_ICON_CLASS[ability];
}

export function RunAbilityIcon({
  ability,
  className = '',
  label,
}: {
  ability: RunAbility;
  className?: string;
  label?: string;
}): ReactElement {
  return (
    <span
      className={`run-ability-icon skirmish-icon ${runAbilityIconClass(ability)} ${className}`.trim()}
      aria-hidden={label ? undefined : 'true'}
      aria-label={label}
      role={label ? 'img' : undefined}
    />
  );
}

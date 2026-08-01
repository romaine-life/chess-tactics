import { type CSSProperties, type ReactElement, type ReactNode } from 'react';

export interface ChoiceOption<Value extends string | number> {
  value: Value;
  label: ReactNode;
  disabled?: boolean;
  title?: string;
  ariaLabel?: string;
  style?: CSSProperties;
}

/** A data-driven, single-choice button group with one shared state contract. */
export function ChoiceGroup<Value extends string | number>({
  value,
  options,
  onChange,
  ariaLabel,
  className = 'tileset-tier-seg',
  buttonClassName = '',
  disabled = false,
  style,
}: {
  value: Value;
  options: readonly ChoiceOption<Value>[];
  onChange: (value: Value) => void;
  ariaLabel: string;
  className?: string;
  buttonClassName?: string;
  disabled?: boolean;
  style?: CSSProperties;
}): ReactElement {
  return (
    <div className={className} role="group" aria-label={ariaLabel} style={style}>
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            className={`${buttonClassName} ${selected ? 'active is-active is-selected' : 'is-unselected'}`.trim()}
            disabled={disabled || option.disabled}
            aria-label={option.ariaLabel}
            aria-pressed={selected}
            title={option.title}
            style={option.style}
            onClick={() => onChange(option.value)}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

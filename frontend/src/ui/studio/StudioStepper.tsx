import type { ReactElement } from 'react';

export interface StudioStepperOption {
  id: string;
  label: string;
}

/**
 * Canonical Studio "walk the list" control: [<] [ dropdown ] [>].
 *
 * A Viewer shows one item at a time, so stepping to the next one without going back to
 * the Catalog is the common move. The arrows wrap, which is what makes it a walk rather
 * than a range -- reaching the end and continuing returns to the start instead of
 * dead-ending on a disabled button.
 *
 * Selecting is the caller's business: every Studio Viewer keeps its own selection state
 * so one kind's id can never leak into another's stage, and each of those ids is a URL
 * parameter, so stepping here also moves the address.
 */
export function StudioStepper({
  label,
  itemNoun,
  options,
  value,
  onChange,
  className = '',
}: {
  label: string;
  itemNoun: string;
  options: readonly StudioStepperOption[];
  value: string;
  onChange: (id: string) => void;
  className?: string;
}): ReactElement | null {
  if (!options.length) return null;

  const step = (delta: -1 | 1): void => {
    const current = options.findIndex((option) => option.id === value);
    const next = (Math.max(0, current) + delta + options.length) % options.length;
    onChange(options[next].id);
  };

  return (
    <div className={`tileset-category-select studio-stepper ${className}`.trim()}>
      <span>{label}</span>
      <div className="studio-stepper-picker">
        <button
          type="button"
          className="tileset-view-action studio-stepper-step"
          onClick={() => step(-1)}
          aria-label={`Previous ${itemNoun}`}
          title={`Previous ${itemNoun}`}
        >&lt;</button>
        <select
          value={value}
          onChange={(event) => onChange(event.target.value)}
          aria-label={label}
        >
          {options.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}
        </select>
        <button
          type="button"
          className="tileset-view-action studio-stepper-step"
          onClick={() => step(1)}
          aria-label={`Next ${itemNoun}`}
          title={`Next ${itemNoun}`}
        >&gt;</button>
      </div>
    </div>
  );
}

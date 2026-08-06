import { type ReactElement } from 'react';
import { chromeUnitClassNames } from '../chromeUnitRegistry';
import { ChromeButton } from './ChromeButton';

export interface GeneratorRecipePresetChoice {
  id: string;
  label: string;
  description: string;
  title: string;
  disabled?: boolean;
  onSelect: () => void;
}

/** Shared catalog-preface for shortcuts that expand into explicit editable generator entries. */
export function GeneratorRecipePresetList({
  ariaLabel,
  presets,
  note,
  label = 'Presets',
}: {
  ariaLabel: string;
  presets: readonly GeneratorRecipePresetChoice[];
  note: string;
  label?: string;
}): ReactElement {
  return (
    <>
      <span className="le-pal-grouplabel">{label}</span>
      <div className="le-generator-preset-list" role="group" aria-label={ariaLabel}>
        {presets.map((preset) => (
          <ChromeButton
            unit="inner-text-button"
            key={preset.id}
            className={chromeUnitClassNames('inner-text-button', 'le-generator-preset')}
            disabled={preset.disabled}
            title={preset.title}
            onClick={preset.onSelect}
          >
            <strong>{preset.label}</strong>
            <small>{preset.description}</small>
          </ChromeButton>
        ))}
      </div>
      <p className="le-board-note">{note}</p>
    </>
  );
}

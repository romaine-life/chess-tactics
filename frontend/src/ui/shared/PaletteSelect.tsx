import { useEffect, useId, useRef, useState } from 'react';
import type { KeyboardEvent as ReactKeyboardEvent, ReactElement } from 'react';
import { UNIT_PALETTE_LABELS, UNIT_PALETTES, type UnitPalette } from '../../core/pieces';
import { chromeUnitClassNames } from '../chromeUnitRegistry';

export function PaletteSelect({
  value,
  onChange,
  ariaLabel = 'Palette',
  disabled = false,
  title,
  className = '',
}: {
  value: UnitPalette;
  onChange: (value: UnitPalette) => void;
  ariaLabel?: string;
  disabled?: boolean;
  title?: string;
  className?: string;
}): ReactElement {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const listId = useId();

  useEffect(() => {
    if (!open) return undefined;
    const closeIfOutside = (event: PointerEvent): void => {
      if (rootRef.current?.contains(event.target as Node)) return;
      setOpen(false);
    };
    document.addEventListener('pointerdown', closeIfOutside);
    return () => document.removeEventListener('pointerdown', closeIfOutside);
  }, [open]);

  const select = (next: UnitPalette): void => {
    if (disabled) return;
    onChange(next);
    setOpen(false);
  };

  const move = (offset: number): void => {
    const index = UNIT_PALETTES.indexOf(value);
    const next = UNIT_PALETTES[(index + offset + UNIT_PALETTES.length) % UNIT_PALETTES.length];
    onChange(next);
  };

  const onKeyDown = (event: ReactKeyboardEvent<HTMLButtonElement>): void => {
    if (disabled) return;
    if (event.key === 'ArrowDown' || event.key === 'ArrowRight') {
      event.preventDefault();
      move(1);
      setOpen(true);
    } else if (event.key === 'ArrowUp' || event.key === 'ArrowLeft') {
      event.preventDefault();
      move(-1);
      setOpen(true);
    } else if (event.key === 'Home') {
      event.preventDefault();
      onChange(UNIT_PALETTES[0]);
    } else if (event.key === 'End') {
      event.preventDefault();
      onChange(UNIT_PALETTES[UNIT_PALETTES.length - 1]);
    } else if (event.key === 'Escape') {
      setOpen(false);
    }
  };

  return (
    <div ref={rootRef} className={`palette-select ${open ? 'is-open' : ''} ${className}`.trim()}>
      <button
        type="button"
        data-chrome-unit="inner-dropdown"
        className={chromeUnitClassNames('inner-dropdown', 'palette-select-trigger')}
        aria-label={ariaLabel}
        aria-expanded={open}
        aria-controls={listId}
        aria-haspopup="listbox"
        disabled={disabled}
        title={title}
        onClick={() => { if (!disabled) setOpen((wasOpen) => !wasOpen); }}
        onKeyDown={onKeyDown}
      >
        <span className={`palette-select-swatch is-${value}`} aria-hidden="true" />
        <span className="palette-select-label">{UNIT_PALETTE_LABELS[value]}</span>
      </button>
      {open && !disabled ? (
        <div id={listId} className="palette-select-menu" role="listbox" aria-label={ariaLabel}>
          {UNIT_PALETTES.map((palette) => (
            <button
              key={palette}
              type="button"
              data-chrome-unit="inner-list-row"
              className={chromeUnitClassNames('inner-list-row', 'palette-select-option', palette === value && 'is-active')}
              role="option"
              aria-selected={palette === value}
              onClick={() => select(palette)}
            >
              <span className={`palette-select-swatch is-${palette}`} aria-hidden="true" />
              <span>{UNIT_PALETTE_LABELS[palette]}</span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

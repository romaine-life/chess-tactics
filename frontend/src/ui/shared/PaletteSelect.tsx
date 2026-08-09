import { useEffect, useId, useRef, useState } from 'react';
import type { KeyboardEvent as ReactKeyboardEvent, ReactElement } from 'react';
import { UNIT_PALETTE_LABELS, UNIT_PALETTES, type UnitPalette } from '../../core/pieces';
import { chromeUnitClassNames } from '../chromeUnitRegistry';
import { ChromeButton } from './ChromeButton';

export function PaletteSelect({
  value,
  onChange,
  ariaLabel = 'Palette',
  disabled = false,
  title,
  className = '',
  options,
}: {
  value: UnitPalette;
  onChange: (value: UnitPalette) => void;
  ariaLabel?: string;
  disabled?: boolean;
  title?: string;
  className?: string;
  /** Restrict the offered palettes. Defaults to the full catalog. The current `value` is always
   * offered even when absent, so a select can never hide the colour it is displaying. */
  options?: readonly UnitPalette[];
}): ReactElement {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const listId = useId();
  const offered = options
    ? UNIT_PALETTES.filter((palette) => palette === value || options.includes(palette))
    : UNIT_PALETTES;

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
    const index = offered.indexOf(value);
    const next = offered[(index + offset + offered.length) % offered.length];
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
      onChange(offered[0]);
    } else if (event.key === 'End') {
      event.preventDefault();
      onChange(offered[offered.length - 1]);
    } else if (event.key === 'Escape') {
      setOpen(false);
    }
  };

  return (
    <div ref={rootRef} className={`palette-select ${open ? 'is-open' : ''} ${className}`.trim()}>
      <ChromeButton unit="inner-dropdown"
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
      </ChromeButton>
      {open && !disabled ? (
        <div id={listId} className="palette-select-menu" role="listbox" aria-label={ariaLabel}>
          {offered.map((palette) => (
            <ChromeButton unit="inner-list-row"
              key={palette}
              className={chromeUnitClassNames('inner-list-row', 'palette-select-option', palette === value && 'is-active')}
              role="option"
              aria-selected={palette === value}
              onClick={() => select(palette)}
            >
              <span className={`palette-select-swatch is-${palette}`} aria-hidden="true" />
              <span>{UNIT_PALETTE_LABELS[palette]}</span>
            </ChromeButton>
          ))}
        </div>
      ) : null}
    </div>
  );
}

import { useCallback, useEffect, useId, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent, type ReactElement, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { chromeUnitClassNames } from '../chromeUnitRegistry';

export type HouseSelectOption<TValue extends string = string> = {
  value: TValue;
  label: ReactNode;
  disabled?: boolean;
  title?: string;
};

type MenuBox = {
  left: number;
  top: number;
  width: number;
  maxHeight: number;
};

const MENU_GAP = 4;
const MENU_MARGIN = 8;
const MENU_MAX_HEIGHT = 260;
const MENU_MIN_HEIGHT = 96;

export function HouseSelect<TValue extends string>({
  value,
  options,
  onChange,
  ariaLabel,
  className = '',
  disabled = false,
  title,
}: {
  value: TValue;
  options: readonly HouseSelectOption<TValue>[];
  onChange: (value: TValue) => void;
  ariaLabel: string;
  className?: string;
  disabled?: boolean;
  title?: string;
}): ReactElement {
  const id = useId();
  const rootRef = useRef<HTMLDivElement | null>(null);
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [menuBox, setMenuBox] = useState<MenuBox | null>(null);

  const selectedIndex = options.findIndex((option) => option.value === value);
  const selectedOption = selectedIndex >= 0 ? options[selectedIndex] : null;
  const enabledIndexes = useMemo(
    () => options.map((option, index) => option.disabled ? -1 : index).filter((index) => index >= 0),
    [options],
  );
  const selectedEnabledIndex = selectedIndex >= 0 && !options[selectedIndex]?.disabled
    ? selectedIndex
    : enabledIndexes[0] ?? -1;

  const updateMenuBox = useCallback((): void => {
    const root = rootRef.current;
    if (!root || typeof window === 'undefined') return;
    const rect = root.getBoundingClientRect();
    const viewportW = window.innerWidth;
    const viewportH = window.innerHeight;
    const width = Math.max(rect.width, 120);
    const below = viewportH - rect.bottom - MENU_MARGIN;
    const above = rect.top - MENU_MARGIN;
    const openUp = below < MENU_MIN_HEIGHT && above > below;
    const room = Math.max(MENU_MIN_HEIGHT, (openUp ? above : below) - MENU_GAP);
    const maxHeight = Math.min(MENU_MAX_HEIGHT, room);
    const rawTop = openUp ? rect.top - MENU_GAP - maxHeight : rect.bottom + MENU_GAP;
    const top = Math.max(MENU_MARGIN, Math.min(rawTop, viewportH - MENU_MARGIN - maxHeight));
    const left = Math.max(MENU_MARGIN, Math.min(rect.left, viewportW - MENU_MARGIN - width));
    setMenuBox({ left, top, width, maxHeight });
  }, []);

  const openMenu = useCallback((): void => {
    if (disabled || enabledIndexes.length === 0) return;
    setActiveIndex(selectedEnabledIndex);
    setOpen(true);
  }, [disabled, enabledIndexes.length, selectedEnabledIndex]);

  const closeMenu = useCallback((): void => {
    setOpen(false);
  }, []);

  const chooseIndex = useCallback((index: number): void => {
    const option = options[index];
    if (!option || option.disabled) return;
    onChange(option.value);
    setOpen(false);
    buttonRef.current?.focus();
  }, [onChange, options]);

  const moveActive = useCallback((delta: number): void => {
    if (enabledIndexes.length === 0) return;
    const current = enabledIndexes.indexOf(activeIndex);
    const fallback = enabledIndexes.indexOf(selectedEnabledIndex);
    const base = current >= 0 ? current : fallback >= 0 ? fallback : 0;
    const next = enabledIndexes[(base + delta + enabledIndexes.length) % enabledIndexes.length];
    setActiveIndex(next);
  }, [activeIndex, enabledIndexes, selectedEnabledIndex]);

  const handleKeyDown = (event: KeyboardEvent<HTMLButtonElement>): void => {
    if (disabled) return;
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      if (open) moveActive(1);
      else openMenu();
      return;
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault();
      if (open) moveActive(-1);
      else openMenu();
      return;
    }
    if (event.key === 'Home') {
      event.preventDefault();
      setActiveIndex(enabledIndexes[0] ?? -1);
      setOpen(true);
      return;
    }
    if (event.key === 'End') {
      event.preventDefault();
      setActiveIndex(enabledIndexes[enabledIndexes.length - 1] ?? -1);
      setOpen(true);
      return;
    }
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      if (open && activeIndex >= 0) chooseIndex(activeIndex);
      else openMenu();
      return;
    }
    if (event.key === 'Escape' && open) {
      event.preventDefault();
      closeMenu();
    }
  };

  useEffect(() => {
    if (!open) return;
    updateMenuBox();
    const onPointerDown = (event: PointerEvent): void => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (rootRef.current?.contains(target) || menuRef.current?.contains(target)) return;
      closeMenu();
    };
    document.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('resize', updateMenuBox);
    window.addEventListener('scroll', updateMenuBox, true);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('resize', updateMenuBox);
      window.removeEventListener('scroll', updateMenuBox, true);
    };
  }, [closeMenu, open, updateMenuBox]);

  useEffect(() => {
    if (!open) return;
    updateMenuBox();
  }, [activeIndex, open, updateMenuBox]);

  useEffect(() => {
    if (disabled && open) closeMenu();
  }, [closeMenu, disabled, open]);

  const menuStyle: CSSProperties | undefined = menuBox
    ? { left: menuBox.left, top: menuBox.top, width: menuBox.width, maxHeight: menuBox.maxHeight }
    : undefined;
  const rootClass = chromeUnitClassNames('inner-dropdown', 'house-select', 'le-select-wrap', className);

  const menu = open && typeof document !== 'undefined'
    ? createPortal(
      <div
        ref={menuRef}
        id={`${id}-menu`}
        className="house-select-menu chrome-family-surface"
        role="listbox"
        aria-label={ariaLabel}
        style={menuStyle}
      >
        {options.map((option, index) => (
          <button
            key={option.value}
            type="button"
            id={`${id}-option-${option.value}`}
            data-chrome-unit="inner-list-row"
            className={chromeUnitClassNames('inner-list-row', 'house-select-option', index === activeIndex && 'is-active')}
            role="option"
            aria-selected={option.value === value}
            disabled={option.disabled}
            title={option.title}
            onMouseEnter={() => { if (!option.disabled) setActiveIndex(index); }}
            onClick={() => chooseIndex(index)}
          >
            {option.label}
          </button>
        ))}
      </div>,
      document.body,
    )
    : null;

  return (
    <div ref={rootRef} data-chrome-unit="inner-dropdown" className={rootClass}>
      <button
        ref={buttonRef}
        type="button"
        className="house-select-trigger"
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={`${id}-menu`}
        disabled={disabled || options.length === 0}
        title={title ?? selectedOption?.title}
        onClick={() => { if (open) closeMenu(); else openMenu(); }}
        onKeyDown={handleKeyDown}
      >
        {selectedOption?.label ?? options[0]?.label ?? ''}
      </button>
      {menu}
    </div>
  );
}

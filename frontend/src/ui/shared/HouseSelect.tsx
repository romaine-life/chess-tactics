import { Fragment, useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent, type ReactElement, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { chromeUnitClassNames } from '../chromeUnitRegistry';
import { KitScroll } from '../KitScroll';
import { ChromeDivider, InnerChromeBox } from './ChromeBox';

export type HouseSelectOption<TValue extends string = string> = {
  value: TValue;
  label: ReactNode;
  /** Optional semantic menu group. Contiguous options with the same group share one heading. */
  group?: string;
  disabled?: boolean;
  title?: string;
};

type IndexedHouseSelectOption<TValue extends string> = {
  index: number;
  option: HouseSelectOption<TValue>;
};

type HouseSelectOptionSection<TValue extends string> = {
  group?: string;
  options: IndexedHouseSelectOption<TValue>[];
};

function sectionOptions<TValue extends string>(options: readonly HouseSelectOption<TValue>[]): HouseSelectOptionSection<TValue>[] {
  return options.reduce<HouseSelectOptionSection<TValue>[]>((sections, option, index) => {
    const current = sections.at(-1);
    if (!current || current.group !== option.group) {
      sections.push({ group: option.group, options: [{ option, index }] });
    } else {
      current.options.push({ option, index });
    }
    return sections;
  }, []);
}

type MenuBox = {
  left: number;
  width: number;
  maxHeight: number;
  top?: number;
  bottom?: number;
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
  testId,
}: {
  value: TValue;
  options: readonly HouseSelectOption<TValue>[];
  onChange: (value: TValue) => void;
  ariaLabel: string;
  className?: string;
  disabled?: boolean;
  title?: string;
  testId?: string;
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
  const optionSections = useMemo(() => sectionOptions(options), [options]);

  const updateMenuBox = useCallback((): void => {
    const root = rootRef.current;
    if (!root || typeof window === 'undefined') return;
    const rect = root.getBoundingClientRect();
    const rootStyle = window.getComputedStyle(root);
    const paintOverhang = (property: string): number => {
      const value = Number.parseFloat(rootStyle.getPropertyValue(property));
      return Number.isFinite(value) ? Math.max(0, value) : 0;
    };
    const leftMargin = Math.max(MENU_MARGIN, paintOverhang('--le-inner-atom-left-overhang'));
    const rightMargin = Math.max(MENU_MARGIN, paintOverhang('--le-inner-atom-right-overhang'));
    const topMargin = Math.max(MENU_MARGIN, paintOverhang('--le-inner-atom-top-overhang'));
    const bottomMargin = Math.max(MENU_MARGIN, paintOverhang('--le-inner-atom-bottom-overhang'));
    const viewportW = window.innerWidth;
    const viewportH = window.innerHeight;
    const width = Math.max(rect.width, 120);
    const below = viewportH - rect.bottom - bottomMargin;
    const above = rect.top - topMargin;
    const openUp = below < MENU_MIN_HEIGHT && above > below;
    const room = Math.max(1, (openUp ? above : below) - MENU_GAP);
    const maxHeight = Math.min(MENU_MAX_HEIGHT, room);
    const left = Math.max(leftMargin, Math.min(rect.left, viewportW - rightMargin - width));
    if (openUp) {
      setMenuBox({ left, bottom: Math.max(bottomMargin, viewportH - rect.top + MENU_GAP), width, maxHeight });
    } else {
      setMenuBox({ left, top: Math.max(topMargin, rect.bottom + MENU_GAP), width, maxHeight });
    }
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
    if (option.value !== value) onChange(option.value);
    setOpen(false);
    buttonRef.current?.focus();
  }, [onChange, options, value]);

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

  useLayoutEffect(() => {
    if (!open) return;
    updateMenuBox();
  }, [open, options.length, updateMenuBox]);

  useEffect(() => {
    if (disabled && open) closeMenu();
  }, [closeMenu, disabled, open]);

  const menuStyle: (CSSProperties & { '--house-select-menu-max-height'?: string }) | undefined = menuBox
    ? {
        left: menuBox.left,
        top: menuBox.top,
        bottom: menuBox.bottom,
        width: menuBox.width,
        maxHeight: menuBox.maxHeight,
        '--house-select-menu-max-height': `${menuBox.maxHeight}px`,
      }
    : undefined;
  const rootClass = chromeUnitClassNames('inner-dropdown', 'house-select', 'le-select-wrap', className);

  const menu = open && typeof document !== 'undefined'
    ? createPortal(
      <div
        ref={menuRef}
        className="house-select-menu chrome-family-surface"
        style={menuStyle}
      >
        <InnerChromeBox
          id={`${id}-menu`}
          className="house-select-menu-box"
          role="listbox"
          aria-label={ariaLabel}
        >
          <KitScroll className="house-select-menu-scroll">
            <div className="house-select-menu-options">
              {optionSections.map((section, sectionIndex) => {
                const groupLabelId = `${id}-group-${sectionIndex}`;
                const optionRows = section.options.map(({ option, index }, optionIndex) => (
                  <Fragment key={option.value}>
                    {optionIndex > 0 ? <ChromeDivider role="inner" /> : null}
                    <button
                      type="button"
                      id={`${id}-option-${option.value}`}
                      className={`house-select-option ${index === activeIndex ? 'is-active' : ''}`.trim()}
                      role="option"
                      aria-selected={option.value === value}
                      disabled={option.disabled}
                      title={option.title}
                      onMouseEnter={() => { if (!option.disabled) setActiveIndex(index); }}
                      onClick={() => chooseIndex(index)}
                    >
                      {option.label}
                    </button>
                  </Fragment>
                ));
                return (
                  <Fragment key={`${section.group ?? 'ungrouped'}-${sectionIndex}`}>
                    {sectionIndex > 0 ? <ChromeDivider role="inner" /> : null}
                    {section.group ? (
                      <div className="house-select-option-group" role="group" aria-labelledby={groupLabelId}>
                        <div id={groupLabelId} className="house-select-option-group-label">{section.group}</div>
                        <div className="house-select-option-group-items">{optionRows}</div>
                      </div>
                    ) : optionRows}
                  </Fragment>
                );
              })}
            </div>
          </KitScroll>
        </InnerChromeBox>
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
        data-testid={testId}
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={`${id}-menu`}
        disabled={disabled || options.length === 0}
        title={title ?? selectedOption?.title}
        onClick={() => { if (open) closeMenu(); else openMenu(); }}
        onKeyDown={handleKeyDown}
      >
        {selectedOption?.label ?? ''}
      </button>
      {menu}
    </div>
  );
}

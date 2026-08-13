import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent, type ReactElement, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { chromeUnitClassNames } from '../chromeUnitRegistry';
import { ChromeDividedGridRow, ChromeDividedGridRowGroup, DividedInnerChromeBox } from './ChromeDividedGrid';
import { ChromeButton } from './ChromeButton';
import { CHROME_LEAF_FILL_SURFACE, CHROME_STRUCTURAL_FILL_ROLE, leafSurfacePhase } from './chromeSurfacePolicy';

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
  fillSurface,
  seated = false,
}: {
  value: TValue;
  options: readonly HouseSelectOption<TValue>[];
  onChange: (value: TValue) => void;
  ariaLabel: string;
  className?: string;
  disabled?: boolean;
  title?: string;
  testId?: string;
  /** Optional named fill for the closed leaf control; the menu remains a structural field. */
  fillSurface?: string;
  /**
   * SEATED IN A CELL of a divided box, rather than standing on a field inside one.
   *
   * The ordinary picker is a registered `inner-dropdown`: it brings its own 9-slice frame and
   * paints its wood inside it. Dropped into a cell whose edges are already the box's rails, that
   * draws a second frame a few pixels inside the first — a box in a box — and the wood ends up as
   * a plaque floating on a strip of marble that belongs to nothing.
   *
   * Seated, the trigger IS the cell: no frame of its own, the wood filling the whole area between
   * the rails, and the shared chevron mark rather than the frame's own. This is the same decision
   * `section-box-member-verb` makes for a verb that closes a box — the frame is the box's, so the
   * control does not draw one.
   */
  seated?: boolean;
}): ReactElement {
  const id = useId();
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
    const root = buttonRef.current;
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
      if (buttonRef.current?.contains(target) || menuRef.current?.contains(target)) return;
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
  // Seated, the trigger names no registered unit: `inner-dropdown` IS the 9-slice frame, and the
  // whole point of a seated picker is that the cell it fills has no room for one.
  const triggerClass = seated
    ? ['house-select', 'house-select-trigger', 'house-select-seated', className].filter(Boolean).join(' ')
    : chromeUnitClassNames(
      'inner-dropdown',
      'house-select',
      'le-select-wrap',
      'house-select-trigger',
      className,
    );

  const menu = open && typeof document !== 'undefined'
    ? createPortal(
      <div
        ref={menuRef}
        className="house-select-menu chrome-family-surface"
        style={menuStyle}
      >
        {/* Every option is a ROW of one divided box, so the rails between them — inside a group and
            between groups alike — are the box's own, laid and capped by its topology. They used to
            be dividers dropped between the options by this file, which could only cap themselves as
            though they met a frame; a group is a semantic wrapper with no box for exactly that
            reason (see ChromeDividedGridRowGroup). */}
        {/* Marble field, oak leaves (ADR-0433). The popup does NOT become a leaf when it opens —
            that ADR says so outright — but its reason is that it HOSTS option rows, and each of
            those rows is a control. Both halves were missing: the field painted nothing and the
            rows wore a hand-mixed `rgba(10, 28, 43, .42)`, so a menu of clickable rows was the
            one place in the shell where pressable surfaces carried no wood at all. */}
        <DividedInnerChromeBox
          id={`${id}-menu`}
          columns={['minmax(0, 1fr)']}
          scroll
          className="house-select-menu-box"
          fillRole={CHROME_STRUCTURAL_FILL_ROLE}
          role="listbox"
          aria-label={ariaLabel}
        >
          {optionSections.flatMap((section, sectionIndex) => {
            const groupLabelId = `${id}-group-${sectionIndex}`;
            const optionRows = section.options.map(({ option, index }) => (
              <ChromeDividedGridRow
                key={option.value}
                as="button"
                id={`${id}-option-${option.value}`}
                className={`house-select-option ${index === activeIndex ? 'is-active' : ''}`.trim()}
                data-chrome-fill-surface={CHROME_LEAF_FILL_SURFACE}
                /* One plank running down the list, not the same crop stamped per row — the
                   recovery every stacked leaf in the app makes (ADR-0063). The phase is the
                   option's own index, so a menu that scrolls keeps one continuous grain. */
                style={leafSurfacePhase(index)}
                role="option"
                aria-selected={option.value === value}
                disabled={option.disabled}
                title={option.title}
                onMouseEnter={() => { if (!option.disabled) setActiveIndex(index); }}
                onClick={() => chooseIndex(index)}
              >
                <span className="house-select-option-label">{option.label}</span>
              </ChromeDividedGridRow>
            ));
            if (!section.group) return optionRows;
            return [(
              <ChromeDividedGridRowGroup
                key={`group-${sectionIndex}`}
                className="house-select-option-group"
                role="group"
                aria-labelledby={groupLabelId}
              >
                <ChromeDividedGridRow id={groupLabelId} className="house-select-option-group-label">
                  {section.group}
                </ChromeDividedGridRow>
                {optionRows}
              </ChromeDividedGridRowGroup>
            )];
          })}
        </DividedInnerChromeBox>
      </div>,
      document.body,
    )
    : null;

  const triggerProps = {
    className: triggerClass,
    'data-chrome-fill-surface': fillSurface,
    'data-testid': testId,
    'aria-label': ariaLabel,
    'aria-haspopup': 'listbox' as const,
    'aria-expanded': open,
    'aria-controls': `${id}-menu`,
    disabled: disabled || options.length === 0,
    title: title ?? selectedOption?.title,
    onClick: () => { if (open) closeMenu(); else openMenu(); },
    onKeyDown: handleKeyDown,
  };

  return (
    <>
      {seated ? (
        // The framed picker's chevron is drawn by its frame (`.le-select-wrap::after`), which a
        // seated one does not have. It takes the SHARED stepper chevron instead of a second
        // implementation of the same mark, pointing the way the menu is about to move.
        <button {...triggerProps} type="button" ref={buttonRef}>
          <span className="house-select-seated-label">{selectedOption?.label ?? ''}</span>
          <span
            className={`stepper-glyph stepper-chevron stepper-chevron-${open ? 'up' : 'down'}`}
            aria-hidden="true"
          />
        </button>
      ) : (
        <ChromeButton unit="inner-dropdown" {...triggerProps} ref={buttonRef}>
          {selectedOption?.label ?? ''}
        </ChromeButton>
      )}
      {menu}
    </>
  );
}

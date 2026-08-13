import type { ReactElement, ReactNode } from 'react';

import { HouseSelect, type HouseSelectOption } from './HouseSelect';
import { navigateApp } from '../navigation';

/**
 * A rail of sections, as ONE control, for a screen that cannot spend a row per section.
 *
 * A rail belongs to the shell rather than to the content, so it never scrolls away: on a phone
 * the Strategikon stacked four rows of section navigation above the Enchiridion's own six
 * above the record, and the record got whatever was left. Collapsed, each rail costs one row
 * and the record gets the rest.
 *
 * It is a PEER of the rail it replaces — same width, same inset, same height as one tab — so a
 * screen with two of them reads as two controls of one family rather than a form stacked on a
 * menu. `--rail-tab-block-size` is the one number both the tabs and these pickers take, so
 * they cannot drift apart.
 *
 * Only one form is ever displayed (see `.rail-section-picker` in style.css), so the sections
 * are never duplicated in the accessibility tree, and both forms navigate the same addresses —
 * a section is reached identically whichever is on screen.
 */
export function RailSectionPicker<TValue extends string>({
  value,
  options,
  href,
  ariaLabel,
  placeholder,
  testId,
}: {
  /** The committed section, or null where the address names none. */
  value: TValue | null;
  options: readonly HouseSelectOption<TValue>[];
  /** The address a choice lands on — the same one the rail's tab links to. */
  href: (value: TValue) => string;
  ariaLabel: string;
  /** What the control says when nothing is chosen yet. */
  placeholder: string;
  testId?: string;
}): ReactElement {
  // A rail with no active tab shows no selection, and the picker must say the same thing. It
  // named the first section instead, which read as a choice nobody had made — the Strategikon
  // reference root says "Enchiridion" with an empty pane behind it, and a control claiming
  // UNITS above that empty pane is simply wrong. The placeholder is a disabled option so it
  // can be displayed but never chosen.
  const empty = value === null;
  const withPlaceholder: readonly HouseSelectOption<TValue | ''>[] = empty
    ? [{ value: '', label: placeholder, disabled: true }, ...options]
    : options;
  return (
    <div className="rail-section-picker">
      <HouseSelect<TValue | ''>
        value={value ?? ''}
        options={withPlaceholder}
        onChange={(next) => { if (next !== '') navigateApp(href(next as TValue)); }}
        ariaLabel={ariaLabel}
        testId={testId}
      />
    </div>
  );
}

export type { HouseSelectOption as RailSectionOption };

/** Convenience for a rail whose labels are plain text. */
export function railSectionOptions<TValue extends string>(
  items: readonly { value: TValue; label: ReactNode; title?: string }[],
): readonly HouseSelectOption<TValue>[] {
  return items.map((item) => ({ value: item.value, label: item.label, title: item.title }));
}

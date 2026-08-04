import { installedUiMedia } from './installedUiMedia';
import { menuModeIcon } from './menuModeIcon';
import type { EnchiridionSection } from './enchiridionRoute';
import { STRATEGIKON_SECTION_LABEL, type StrategikonSection } from './strategikonRoute';

export interface StrategikonNavigationItem {
  section: StrategikonSection;
  label: string;
  title: string;
  reference: EnchiridionSection;
  iconSrc: string;
}

/**
 * One inventory for both places that navigate the Strategikon: its full rail and
 * the compact shortcuts beside the Controls-title book. A destination never gets
 * a second label or mark merely because it is reached from the title band.
 */
export function strategikonNavigationItems(): readonly StrategikonNavigationItem[] {
  return [
    {
      section: 'enchiridion',
      label: STRATEGIKON_SECTION_LABEL.enchiridion,
      title: 'The Enchiridion — Rules and references',
      reference: 'units',
      iconSrc: menuModeIcon('enchiridion'),
    },
    {
      section: 'prosopography',
      label: STRATEGIKON_SECTION_LABEL.prosopography,
      title: 'The Martial Prosopography — Current Army',
      reference: 'units',
      iconSrc: installedUiMedia('ui-kit-icons-unit-studio-png'),
    },
    {
      section: 'chartulary',
      label: STRATEGIKON_SECTION_LABEL.chartulary,
      title: 'The Chartulary — Held Cards',
      reference: 'units',
      iconSrc: installedUiMedia('ui-kit-icons-players-png'),
    },
    {
      section: 'lipsanotheca',
      label: STRATEGIKON_SECTION_LABEL.lipsanotheca,
      title: 'The Lipsanotheca — Held Lipsana',
      reference: 'units',
      iconSrc: installedUiMedia('ui-kit-icons-info-png'),
    },
  ];
}

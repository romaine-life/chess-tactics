import { installedUiMedia } from './installedUiMedia';
import { menuModeIcon } from './menuModeIcon';
import { STRATEGIKON_SECTION_LABEL, type StrategikonSection } from './strategikonRoute';

export interface StrategikonNavigationItem {
  section: StrategikonSection;
  label: string;
  title: string;
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
      iconSrc: menuModeIcon('enchiridion'),
    },
    {
      section: 'prosopography',
      label: STRATEGIKON_SECTION_LABEL.prosopography,
      title: 'The Martial Prosopography — Current Army',
      iconSrc: installedUiMedia('ui-kit-icons-unit-studio-png'),
    },
    {
      section: 'chartulary',
      label: STRATEGIKON_SECTION_LABEL.chartulary,
      title: 'The Chartulary — Held Cards',
      iconSrc: installedUiMedia('ui-kit-icons-players-png'),
    },
    {
      section: 'lipsanotheca',
      label: STRATEGIKON_SECTION_LABEL.lipsanotheca,
      title: 'The Lipsanotheca — Held Lipsana',
      iconSrc: installedUiMedia('ui-kit-icons-info-png'),
    },
  ];
}

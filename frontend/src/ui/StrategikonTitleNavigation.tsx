import type { ReactElement } from 'react';
import { NavButton } from './shared/NavButton';
import { installedUiMedia } from './installedUiMedia';
import { strategikonNavigationItems, useStrategikonCardsIcon } from './strategikonNavigation';
import {
  isStrategikonPath,
  strategikonAddress,
  strategikonBase,
  strategikonHref,
} from './strategikonRoute';

/**
 * The compact, always-visible index beside the Strategikon book in the Controls
 * title. The complete rail remains inside the workspace; these marks make every
 * register a direct destination and give transfer animations a real endpoint.
 */
export function StrategikonTitleNavigation({
  path,
  search = '',
  heldCards,
}: {
  path: string;
  search?: string;
  /**
   * Cards this Run holds, counted on the Chartulary's own mark. Absent on a Skirmish, which
   * mounts this index with no Run behind it and so has no register to count.
   */
  heldCards?: number;
}): ReactElement {
  const cardsIcon = useStrategikonCardsIcon();
  const open = isStrategikonPath(path);
  const base = strategikonBase(path);
  const current = open ? strategikonAddress(path).section : null;
  const returnName = base === '/run' ? 'Run' : 'Battle';
  const toggleLabel = open ? `Return to ${returnName}` : 'Open Strategikon';
  const toggleTitle = open
    ? `Return to ${returnName} — close the Strategikon without leaving this activity.`
    : 'Strategikon — inspect references, the current army, held cards, and held lipsana.';

  return (
    <nav className="strategikon-title-navigation" aria-label="Strategikon destinations">
      {strategikonNavigationItems(cardsIcon).map((item) => {
        const active = item.section === current;
        // The register's own size, on the register's own mark. It rides the CORNER of the seat
        // rather than sitting beside it: the row is an index of four marks on one shared seat,
        // and a number given its own column would make this destination wider than the three
        // beside it — the row would stop reading as one set.
        const count = item.section === 'chartulary' ? heldCards : undefined;
        return (
          <NavButton
            key={item.section}
            className={`skirmish-hud-title-action strategikon-title-section-action${active ? ' active' : ''}${
              count === undefined ? '' : ' has-count'
            }`}
            to={`${strategikonHref(base, item.section)}${search}`}
            aria-label={count === undefined
              ? `Open ${item.label}`
              : `Open ${item.label} — ${count} card${count === 1 ? '' : 's'} held`}
            aria-current={active ? 'page' : undefined}
            title={item.title}
            data-testid={`strategikon-title-${item.section}`}
            data-strategikon-section={item.section}
            data-run-card-flight-target={item.section === 'chartulary' ? '' : undefined}
          >
            <img className={item.iconClassName} src={item.iconSrc} alt="" aria-hidden="true" />
            {count === undefined
              ? null
              : <span className="strategikon-title-count" aria-hidden="true">{count}</span>}
          </NavButton>
        );
      })}
      <NavButton
        data-testid="strategikon-toggle"
        className={`skirmish-hud-title-action${open ? ' active' : ''}`}
        to={open ? `${base}${search}` : `${strategikonHref(base)}${search}`}
        aria-label={toggleLabel}
        aria-current={open ? 'page' : undefined}
        title={toggleTitle}
      >
        <img
          className="skirmish-hud-title-action-glyph"
          src={installedUiMedia('ui-kit-icons-studio-catalog-png')}
          alt=""
          aria-hidden="true"
        />
      </NavButton>
    </nav>
  );
}

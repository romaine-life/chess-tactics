import type { ReactElement } from 'react';
import { NavButton } from './shared/NavButton';
import { installedUiMedia } from './installedUiMedia';
import { strategikonNavigationItems } from './strategikonNavigation';
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
}: {
  path: string;
  search?: string;
}): ReactElement {
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
      {strategikonNavigationItems().map((item) => {
        const active = item.section === current;
        return (
          <NavButton
            key={item.section}
            className={`skirmish-hud-title-action strategikon-title-section-action${active ? ' active' : ''}`}
            to={`${strategikonHref(base, item.section, item.reference)}${search}`}
            aria-label={`Open ${item.label}`}
            aria-current={active ? 'page' : undefined}
            title={item.title}
            data-testid={`strategikon-title-${item.section}`}
            data-strategikon-section={item.section}
            data-run-card-flight-target={item.section === 'chartulary' ? '' : undefined}
          >
            <img src={item.iconSrc} alt="" aria-hidden="true" />
          </NavButton>
        );
      })}
      <NavButton
        data-testid="strategikon-toggle"
        className={`skirmish-hud-title-action${open ? ' active' : ''}`}
        to={open ? `${base}${search}` : `${strategikonHref(base, 'enchiridion', 'units')}${search}`}
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

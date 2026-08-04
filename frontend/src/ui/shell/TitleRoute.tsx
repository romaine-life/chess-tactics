import { Fragment, type ReactElement } from 'react';
import { NavButton } from '../shared/NavButton';

/** One canonical destination in the persistent title breadcrumb. */
export interface TitleRouteSegment {
  label: string;
  to: string;
}

/**
 * Clickable route segments contributed after the App-owned screen-name segment.
 * These are frameless NavButtons because the breadcrumb is itself navigation, not
 * an arbitrary title-bar action competing for the typed trailing control lane.
 */
export function TitleRoute({ segments }: { segments: readonly TitleRouteSegment[] }): ReactElement {
  return (
    <span className="title-route-segments">
      {segments.map((segment, index) => (
        <Fragment key={`${index}:${segment.to}`}>
          {index > 0 ? <span className="title-route-separator" aria-hidden="true">›</span> : null}
          <NavButton
            className="title-route-button"
            to={segment.to}
            aria-current={index === segments.length - 1 ? 'location' : undefined}
          >
            {segment.label}
          </NavButton>
        </Fragment>
      ))}
    </span>
  );
}

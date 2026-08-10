import { useLayoutEffect, useRef, useState, type ReactElement } from 'react';

// The line that ties an open rail tab to the panel it opened: out of the tab's trailing edge,
// a right-angle turn at the HALFWAY point of the gutter, a vertical run to the panel's centre
// line, and in. It draws the relationship the `›` open mark asserts (ADR-0561) — same selection
// language, same clock: it appears with the mark, on the press.
//
// It is measured rather than authored, because none of the three rails it serves can state
// these numbers up front: the vertical run is the distance between a tab that moves with its
// index and a panel whose height is the viewport's. The one thing it reads from the layout is
// the GUTTER, which is the rail's own inline-start inset — every column in this family is inset
// by that same token, so the space between one column's content and the next one's IS that
// inset, and the connector cannot drift from the layout it crosses by hard-coding a twin.

interface ConnectorGeometry {
  /** The tab's trailing edge and centre line, where the run starts. */
  x0: number;
  y0: number;
  /** The turn, at half the gutter. */
  xTurn: number;
  /** The far side of the gutter — the panel's first content edge, where the run ends. */
  xEnd: number;
  /** The panel's centre line. */
  y1: number;
  radius: number;
}

const CORNER_RADIUS = 6;

/** The four boxes the run is derived from, in one coordinate space. */
export interface ConnectorBoxes {
  /** The connector's own box; every coordinate is relative to it. */
  host: { left: number; top: number };
  rail: { left: number; right: number };
  tab: { left: number; right: number; top: number; height: number };
  panel: { left: number; top: number; height: number };
}

export function connectorGeometry({ host, rail, tab, panel }: ConnectorBoxes): ConnectorGeometry | null {
  // The gutter, MEASURED as the inset the rail already puts in front of its own tabs — not read
  // off a padding, because the rails spend that inset differently (the main menu's is a
  // transparent 16px frame border plus 8px of padding; the other two are 24px of padding) and
  // reading one of the two halves drew a third of the line. Tabs are flush with the column's
  // trailing edge and the next column is inset by the same token, so the space in front of a
  // tab is exactly the space behind it.
  const gutter = tab.left - rail.left;
  // Only a panel that actually sits BESIDE the rail can be reached by a line that leaves
  // sideways. Under the narrow band the main menu stacks its rail into two columns with the
  // destination BELOW it, and this same elbow would set off into open background toward a panel
  // that is nowhere to the right. Measured rather than keyed to a breakpoint, so a layout that
  // stacks for any other reason is covered by the same rule.
  if (gutter <= 0 || panel.left < rail.right) return null;

  const x0 = Math.round(tab.right - host.left);
  const y0 = Math.round(tab.top + tab.height / 2 - host.top);
  const y1 = Math.round(panel.top + panel.height / 2 - host.top);
  return {
    x0,
    y0,
    xTurn: Math.round(x0 + gutter / 2),
    xEnd: Math.round(x0 + gutter),
    y1,
    radius: Math.min(CORNER_RADIUS, Math.floor(gutter / 4), Math.floor(Math.abs(y1 - y0) / 2)),
  };
}

function samePath(left: ConnectorGeometry | null, right: ConnectorGeometry | null): boolean {
  if (!left || !right) return left === right;
  return left.x0 === right.x0 && left.y0 === right.y0 && left.xTurn === right.xTurn
    && left.xEnd === right.xEnd && left.y1 === right.y1 && left.radius === right.radius;
}

function connectorPath({ x0, y0, xTurn, xEnd, y1, radius }: ConnectorGeometry): string {
  const down = y1 > y0 ? 1 : -1;
  // Under a corner radius the two runs are too short to turn in, so fall back to the plain
  // elbow rather than drawing arcs that overshoot each other.
  if (radius <= 0) return `M ${x0} ${y0} H ${xTurn} V ${y1} H ${xEnd}`;
  return [
    `M ${x0} ${y0}`,
    `H ${xTurn - radius}`,
    `Q ${xTurn} ${y0} ${xTurn} ${y0 + radius * down}`,
    `V ${y1 - radius * down}`,
    `Q ${xTurn} ${y1} ${xTurn + radius} ${y1}`,
    `H ${xEnd}`,
  ].join(' ');
}

/**
 * Mounted inside `ApparatusRailColumn`, beside the tabs. `panelSelector` names the panel the
 * rail opens, looked up among the rail's own SIBLINGS — the panel lives in another subtree (its
 * own scene slot, in every one of the three hosts), so a ref would have to be lifted above both
 * and threaded through the slot. `open` is the same value that marks the tab, so the line and
 * the mark can never disagree about which tab is the open one.
 */
export function RailOpenConnector({
  panelSelector,
  open,
}: {
  panelSelector: string;
  open: string | null;
}): ReactElement | null {
  const hostRef = useRef<SVGSVGElement | null>(null);
  const [geometry, setGeometry] = useState<ConnectorGeometry | null>(null);

  useLayoutEffect(() => {
    const svg = hostRef.current;
    const rail = svg?.closest<HTMLElement>('.apparatus-rail-column');
    const panel = rail?.parentElement?.querySelector<HTMLElement>(panelSelector);
    const tab = rail?.querySelector<HTMLElement>('.settings-tab.is-expanded');
    if (!svg || !rail || !panel || !tab || !open) {
      setGeometry(null);
      return undefined;
    }

    // Every coordinate is taken relative to the SVG's OWN box, so the rail's baked translate
    // (and any other offset an ancestor carries) cancels out instead of having to be known.
    const measure = (): void => {
      const next = connectorGeometry({
        host: svg.getBoundingClientRect(),
        rail: rail.getBoundingClientRect(),
        tab: tab.getBoundingClientRect(),
        panel: panel.getBoundingClientRect(),
      });
      setGeometry((current) => (samePath(current, next) ? current : next));
    };

    measure();
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure);
    observer?.observe(rail);
    observer?.observe(panel);
    observer?.observe(tab);
    window.addEventListener('resize', measure);
    return () => {
      observer?.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, [open, panelSelector]);

  return (
    <svg ref={hostRef} className="rail-open-connector" aria-hidden="true" focusable="false">
      {geometry ? <path className="rail-open-connector-line" d={connectorPath(geometry)} /> : null}
    </svg>
  );
}

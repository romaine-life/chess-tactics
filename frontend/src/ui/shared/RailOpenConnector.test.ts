import { describe, expect, it } from 'vitest';
import { connectorGeometry, type ConnectorBoxes } from './RailOpenConnector';

// The three rails as they measure at 1280×800, taken off the live layout. All three inset their
// columns by the same 24px, which is why one rule serves them.
const mainMenu: ConnectorBoxes = {
  host: { left: 16, top: 88 },
  rail: { left: 0, right: 322 },
  tab: { left: 24, right: 322, top: 312, height: 61 },
  panel: { left: 322, top: 72, height: 707 },
};
const strategikon: ConnectorBoxes = {
  host: { left: 0, top: 84 },
  rail: { left: 0, right: 322 },
  tab: { left: 24, right: 322, top: 253, height: 61 },
  panel: { left: 322, top: 84, height: 716 },
};

describe('rail open connector', () => {
  it('turns at half the gutter and lands on the far side of it', () => {
    const run = connectorGeometry(mainMenu)!;
    expect(run.xEnd - run.x0).toBe(24); // the gutter the rail already puts in front of its tabs
    expect(run.xTurn - run.x0).toBe(12); // half of it
    expect(run.y0).toBe(Math.round(312 + 61 / 2 - 88)); // the tab's centre line
    expect(run.y1).toBe(Math.round(72 + 707 / 2 - 88)); // the panel's centre line
  });

  it('measures the gutter from the rail, not from a padding one rail spends differently', () => {
    // The main menu's 24px is a 16px transparent frame border plus 8px of padding; the
    // Strategikon's is 24px of padding. Both must produce the same run.
    expect(connectorGeometry(strategikon)!.xEnd - connectorGeometry(strategikon)!.x0).toBe(24);
  });

  it('draws nothing when the panel is not beside the rail', () => {
    // The narrow band stacks the main menu's rail above its destination.
    expect(connectorGeometry({ ...mainMenu, panel: { left: 0, top: 330, height: 400 } })).toBeNull();
  });

  it('keeps the corner radius inside both runs', () => {
    const tight = connectorGeometry({
      ...mainMenu,
      // A tab whose centre line is 6px from the panel's: the vertical run cannot host a 6px turn.
      tab: { ...mainMenu.tab, top: Math.round(425 - 61 / 2 - 6) },
    })!;
    expect(tight.radius).toBeLessThanOrEqual(Math.abs(tight.y1 - tight.y0) / 2);
    expect(connectorGeometry(mainMenu)!.radius).toBe(6);
  });
});

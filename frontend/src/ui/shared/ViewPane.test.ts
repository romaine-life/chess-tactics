import { describe, expect, it } from 'vitest';
import {
  clientDeltaToLocal,
  constrainPanToCoverViewport,
  minimumZoomToCoverViewport,
  stageCenteredCoverViewport,
  zoomAfterMinimumChange,
} from './ViewPane';

const rectangle = [
  { x: -500, y: -300 },
  { x: 500, y: -300 },
  { x: 500, y: 300 },
  { x: -500, y: 300 },
];

describe('ViewPane viewport-cover zoom floor', () => {
  it('maps screen-space pointer movement back into a scaled design canvas', () => {
    expect(clientDeltaToLocal(40, 1560, 1040)).toBeCloseTo(60);
    expect(clientDeltaToLocal(-25, 1920, 960)).toBeCloseTo(-50);
    expect(clientDeltaToLocal(12, 0, 0)).toBe(12);
  });

  it('uses the limiting viewport axis and rounds upward only at safety precision', () => {
    expect(minimumZoomToCoverViewport({
      viewport: { width: 501, height: 300 },
      polygon: rectangle,
      minZoom: 0.4,
      maxZoom: 4,
    })).toBe(0.501);

    expect(minimumZoomToCoverViewport({
      viewport: { width: 600, height: 600 },
      polygon: rectangle,
      minZoom: 0.4,
      maxZoom: 4,
    })).toBe(1);
  });

  it('keeps the accepted-art floor proportional across differently sized matching viewports', () => {
    const small = minimumZoomToCoverViewport({
      viewport: { width: 501, height: 300 },
      polygon: rectangle,
      minZoom: 0.01,
      maxZoom: 4,
    });
    const large = minimumZoomToCoverViewport({
      viewport: { width: 2004, height: 1200 },
      polygon: rectangle,
      minZoom: 0.01,
      maxZoom: 4,
    });
    expect(large).toBe(small * 4);
  });

  it('keeps the zoom floor independent of current pan', () => {
    expect(minimumZoomToCoverViewport({
      viewport: { width: 500, height: 300 },
      polygon: rectangle,
      minZoom: 0.4,
      maxZoom: 4,
    })).toBe(0.5);
  });

  it('uses the complete accepted boundary rather than requiring an asymmetric scene to stay board-centered', () => {
    const asymmetricArt = [
      { x: -744, y: -451 },
      { x: 706, y: -451 },
      { x: 706, y: 365 },
      { x: -744, y: 365 },
    ];
    expect(minimumZoomToCoverViewport({
      viewport: { width: 275.375, height: 183.578125 },
      polygon: asymmetricArt,
      minZoom: 0.2,
      maxZoom: 4,
    })).toBe(0.224974);

    const reclamped = constrainPanToCoverViewport({
      viewport: { width: 275.375, height: 183.578125 },
      polygon: asymmetricArt,
      zoom: 0.23,
      from: { x: 0, y: 0 },
      to: { x: 0, y: 0 },
    });
    expect(reclamped.x).toBeCloseTo(0, 5);
    expect(reclamped.y).toBeCloseTo(7.839, 3);
  });

  it('blocks pan at the transformed art boundary without changing zoom', () => {
    expect(constrainPanToCoverViewport({
      viewport: { width: 400, height: 200 },
      polygon: rectangle,
      zoom: 1,
      from: { x: 0, y: 0 },
      to: { x: 1000, y: 0 },
    }).x).toBeCloseTo(300, 5);

    expect(constrainPanToCoverViewport({
      viewport: { width: 400, height: 200 },
      polygon: rectangle,
      zoom: 1,
      from: { x: 0, y: 0 },
      to: { x: 120, y: 40 },
    })).toEqual({ x: 120, y: 40 });
  });

  it('accepts either convex winding and honors the ordinary configured floor', () => {
    expect(minimumZoomToCoverViewport({
      viewport: { width: 400, height: 200 },
      polygon: [...rectangle].reverse(),
      minZoom: 0.55,
      maxZoom: 1.45,
    })).toBe(0.55);
  });

  it('follows a temporary automatic clamp back down after the viewport settles', () => {
    const early = zoomAfterMinimumChange({
      zoom: 1,
      minimum: 2.6,
      automaticFloorZoom: null,
    });
    expect(early).toEqual({ zoom: 2.6, automaticFloorZoom: 2.6 });

    expect(zoomAfterMinimumChange({
      zoom: early.zoom,
      minimum: 0.84,
      automaticFloorZoom: early.automaticFloorZoom,
    })).toEqual({ zoom: 0.84, automaticFloorZoom: 0.84 });
  });

  it('does not lower a zoom the user moved away from the automatic floor', () => {
    expect(zoomAfterMinimumChange({
      zoom: 3,
      minimum: 0.84,
      automaticFloorZoom: 2.6,
    })).toEqual({ zoom: 3, automaticFloorZoom: null });
  });
});

describe('ViewPane covered column', () => {
  // Play's measured layout at 1920x1080: an aspect-locked pane seated inside a wider column that
  // the board art overdraws into. Covering only the pane is what let a pan open a gutter-width
  // strip of screen backdrop beside the board.
  const pane = { width: 1322, height: 992, left: 113, top: 88 };

  it('grows the contract to the column the art overdraws into', () => {
    expect(stageCenteredCoverViewport(pane, { left: 0, top: 88, right: 1560, bottom: 1080 }))
      .toEqual({ width: 1572, height: 992 });
  });

  it('covers an off-centre column by its farther side', () => {
    // Pane centre is 774; the column reaches 786 to the right and 774 to the left, so the
    // stage-centred box must be twice the FARTHER half or the near side stays exposed.
    const covered = stageCenteredCoverViewport(pane, { left: 0, top: 88, right: 1560, bottom: 1080 });
    expect(covered.width / 2).toBeGreaterThanOrEqual(1560 - (pane.left + pane.width / 2));
    expect(covered.width / 2).toBeGreaterThanOrEqual(pane.left + pane.width / 2);
  });

  it('leaves a pane that clips its own art exactly as measured', () => {
    expect(stageCenteredCoverViewport(pane, null)).toEqual({ width: 1322, height: 992 });
  });

  it('never shrinks below the pane when the column is inside it', () => {
    expect(stageCenteredCoverViewport(pane, { left: 400, top: 300, right: 900, bottom: 700 }))
      .toEqual({ width: 1322, height: 992 });
  });

  it('closes the strip a pan used to open', () => {
    // The measured plate: 1822 wide at the live zoom, so it overdraws the 1322 pane by 250 each
    // side. Panning left used to stop only when its right edge reached the PANE's right edge.
    const plate = [
      { x: -911, y: -512 },
      { x: 911, y: -512 },
      { x: 911, y: 512 },
      { x: -911, y: 512 },
    ];
    const paneOnly = { width: 1322, height: 992 };
    const column = stageCenteredCoverViewport(pane, { left: 0, top: 88, right: 1560, bottom: 1080 });
    const drag = { x: -960, y: 0 };
    const loose = constrainPanToCoverViewport({
      viewport: paneOnly, polygon: plate, zoom: 1, from: { x: 0, y: 0 }, to: drag,
    });
    const tight = constrainPanToCoverViewport({
      viewport: column, polygon: plate, zoom: 1, from: { x: 0, y: 0 }, to: drag,
    });
    expect(loose.x).toBeCloseTo(-250, 3);
    expect(tight.x).toBeCloseTo(-125, 3);
    // At the loose limit the plate's right edge sits 125px inside the column: the exposed strip.
    expect(911 + loose.x).toBeLessThan(column.width / 2);
    expect(911 + tight.x).toBeCloseTo(column.width / 2, 3);
  });
});

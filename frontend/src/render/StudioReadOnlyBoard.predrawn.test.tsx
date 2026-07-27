import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { EditorBoard } from '../ui/boardCode';

const capture = vi.hoisted(() => ({
  props: null as null | {
    onFirstFrame?: () => void;
    onFrameError?: (error: unknown) => void;
  },
  gridCells: null as null | { x: number; y: number }[],
}));

vi.mock('./PredrawnBoardLayer', async () => {
  const actual = await vi.importActual<typeof import('./PredrawnBoardLayer')>('./PredrawnBoardLayer');
  return {
    ...actual,
    runtimePredrawnBoardPlate: (surface: unknown) => ({ surface, src: '/exact-version.png' }),
    PredrawnBoardLayer: (props: typeof capture.props) => {
      capture.props = props;
      return <div data-testid="mock-predrawn-plate" />;
    },
  };
});

vi.mock('./BoardGridLayer', () => ({
  BoardGridLayer: ({ cells }: { cells: readonly { x: number; y: number }[] }) => {
    capture.gridCells = [...cells];
    return <div data-testid="mock-board-grid" />;
  },
}));

import { StudioReadOnlyBoard } from './StudioReadOnlyBoard';

function board(): EditorBoard {
  return {
    cols: 1,
    rows: 1,
    cells: {},
    units: {},
    doodads: {},
    props: {},
    cover: {},
    features: {},
    featureCuts: {},
    featureExits: {},
    surface: {
      kind: 'predrawn',
      schemaVersion: 2,
      backgroundVersionId: '11111111-1111-4111-8111-111111111111',
      frameWidth: 10,
      frameHeight: 10,
      worldBounds: { minX: 0, minY: 0, width: 10, height: 10 },
    },
  };
}

beforeEach(() => {
  capture.props = null;
  capture.gridCells = null;
});

describe('StudioReadOnlyBoard immutable plate readiness', () => {
  it('forwards exact plate readiness and failure callbacks', () => {
    const onFirstFrame = vi.fn();
    const onFrameError = vi.fn();
    const html = renderToStaticMarkup(
      <StudioReadOnlyBoard
        board={board()}
        onTerrainFirstFrame={onFirstFrame}
        onFrameError={onFrameError}
      />,
    );

    expect(html).toContain('data-testid="mock-predrawn-plate"');
    expect(capture.props?.onFirstFrame).toBe(onFirstFrame);
    expect(capture.props?.onFrameError).toBe(onFrameError);
  });

  it('never feeds an installed generated plate back into generation-reference mode', () => {
    const html = renderToStaticMarkup(<StudioReadOnlyBoard board={board()} topSurfacesOnly />);

    expect(html).not.toContain('data-testid="mock-predrawn-plate"');
    expect(capture.props).toBeNull();
  });

  it('renders the legacy board while retaining a dormant immutable AI selection', () => {
    const html = renderToStaticMarkup(
      <StudioReadOnlyBoard board={{ ...board(), backgroundMode: 'legacy' }} />,
    );

    expect(html).not.toContain('data-testid="mock-predrawn-plate"');
    expect(capture.props).toBeNull();
  });

  it('draws the canonical review grid at the saved refit dimensions', () => {
    const html = renderToStaticMarkup(
      <StudioReadOnlyBoard
        board={board()}
        showGrid
        reviewGridRegistration={{
          sourceWidth: 100,
          sourceHeight: 100,
          north: [50, 0],
          east: [100, 50],
          south: [50, 100],
          west: [0, 50],
          gridColumns: 2,
          gridRows: 3,
        }}
      />,
    );

    expect(html).toContain('data-testid="mock-board-grid"');
    expect(capture.gridCells).toEqual([
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 0, y: 1 },
      { x: 1, y: 1 },
      { x: 0, y: 2 },
      { x: 1, y: 2 },
    ]);
  });

  it('renders owner-inspection overlays for authored playable cells but not scenery', () => {
    const overlayKeys: string[] = [];
    const html = renderToStaticMarkup(
      <StudioReadOnlyBoard
        board={{
          ...board(),
          decorativeApron: { top: 1, right: 0, bottom: 0, left: 0 },
        }}
        renderCellOverlay={(cell) => {
          overlayKeys.push(cell.key);
          return <span data-overlay-cell={cell.key} />;
        }}
      />,
    );

    expect(overlayKeys).toEqual(['0,0']);
    expect(html).toContain('data-overlay-cell="0,0"');
    expect(html).not.toContain('data-overlay-cell="decorative:0,-1"');
  });
});

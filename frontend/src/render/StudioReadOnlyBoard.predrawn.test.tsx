import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { EditorBoard } from '../ui/boardCode';

const capture = vi.hoisted(() => ({
  props: null as null | {
    onFirstFrame?: () => void;
    onFrameError?: (error: unknown) => void;
  },
}));

vi.mock('./PredrawnBoardLayer', () => ({
  runtimePredrawnBoardPlate: (surface: unknown) => ({ surface, src: '/exact-version.png' }),
  PredrawnBoardLayer: (props: typeof capture.props) => {
    capture.props = props;
    return <div data-testid="mock-predrawn-plate" />;
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
});

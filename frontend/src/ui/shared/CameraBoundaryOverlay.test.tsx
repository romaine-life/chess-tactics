import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { minimumBoardCameraBounds } from '@chess-tactics/board-render';
import { CameraBoundaryOverlay, cameraBoundsAfterDrag } from './CameraBoundaryOverlay';

describe('CameraBoundaryOverlay', () => {
  it('renders one persistent camera boundary with editing handles, not a viewport preview', () => {
    const markup = renderToStaticMarkup(
      <CameraBoundaryOverlay
        board={{ cols: 8, rows: 8 }}
        bounds={{ minX: -500, minY: -300, width: 1_000, height: 600 }}
        editorZoom={0.5}
        editable
        onCommit={vi.fn()}
      />,
    );
    expect(markup).toContain('data-testid="level-camera-boundary"');
    expect(markup).toContain('Camera boundary');
    expect(markup).toContain('data-camera-handle="move"');
    expect(markup).toContain('aria-label="Move camera boundary"');
    expect(markup.match(/data-camera-handle=/g)).toHaveLength(9);
    expect(markup).not.toContain('Player view');
  });

  it('never allows resize or movement to exclude the canonical opening frame', () => {
    const board = { cols: 8, rows: 8 };
    const required = minimumBoardCameraBounds(board);
    const bounds = {
      minX: required.minX - 100,
      minY: required.minY - 80,
      width: required.width + 200,
      height: required.height + 160,
    };
    const resized = cameraBoundsAfterDrag({
      board,
      bounds,
      handle: 'nw',
      deltaX: 10_000,
      deltaY: 10_000,
    });
    expect(resized.minX).toBe(required.minX);
    expect(resized.minY).toBe(required.minY);
    expect(resized.width).toBeGreaterThanOrEqual(required.width);
    expect(resized.height).toBeGreaterThanOrEqual(required.height);

    const moved = cameraBoundsAfterDrag({
      board,
      bounds,
      handle: 'move',
      deltaX: 10_000,
      deltaY: -10_000,
    });
    expect(moved.minX).toBe(required.minX);
    expect(moved.minY + moved.height).toBe(required.minY + required.height);
  });
});

import { useState, type ReactElement } from 'react';
import { Stepper } from './Stepper';
import { HouseSelect } from './HouseSelect';
import { BOARD_COLS, BOARD_ROWS } from '../../core/level';

// Shared board-size control: two kit Steppers (Width × Height) clamped to the engine's
// board bounds (core/level.ts BOARD_COLS/BOARD_ROWS). Rendered identically in the
// front-of-house Level Editor and the Studio Lab so size editing lives in ONE place — each
// screen supplies its own onResize (the Level Editor preserves & prunes painted cells; the
// Lab regenerates). Layout reuses the .le-ctrlrow label+control row and the shared <Stepper>
// so it reads the same everywhere (ADR-0011/0014/0033). The numeric clamp lives here so both
// callers stay in legal range without re-implementing it.
export function BoardSizePanel({
  cols,
  rows,
  onResize,
  colLimits = BOARD_COLS,
  rowLimits = BOARD_ROWS,
}: {
  cols: number;
  rows: number;
  onResize: (cols: number, rows: number, side: BoardResizeSide) => void;
  colLimits?: { min: number; max: number };
  rowLimits?: { min: number; max: number };
}): ReactElement {
  const [widthSide, setWidthSide] = useState<Extract<BoardResizeSide, 'left' | 'right'>>('right');
  const [heightSide, setHeightSide] = useState<Extract<BoardResizeSide, 'top' | 'bottom'>>('bottom');
  const clamp = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, value));
  const setCols = (next: number): void => onResize(clamp(next, colLimits.min, colLimits.max), rows, widthSide);
  const setRows = (next: number): void => onResize(cols, clamp(next, rowLimits.min, rowLimits.max), heightSide);
  return (
    <div className="board-size-panel">
      <div className="le-ctrlrow">
        <span className="le-ctrllabel">Width</span>
        <div className="board-size-control">
          <HouseSelect
            className="board-size-side"
            value={widthSide}
            options={[{ value: 'left', label: 'Left' }, { value: 'right', label: 'Right' }]}
            ariaLabel="Width resize side"
            onChange={setWidthSide}
          />
          <Stepper value={cols} suffix="" decreaseLabel={`Remove a column from the ${widthSide}`} increaseLabel={`Add a column to the ${widthSide}`} onDecrease={() => setCols(cols - 1)} onIncrease={() => setCols(cols + 1)} />
        </div>
      </div>
      <div className="le-ctrlrow">
        <span className="le-ctrllabel">Height</span>
        <div className="board-size-control">
          <HouseSelect
            className="board-size-side"
            value={heightSide}
            options={[{ value: 'top', label: 'Top' }, { value: 'bottom', label: 'Bottom' }]}
            ariaLabel="Height resize side"
            onChange={setHeightSide}
          />
          <Stepper value={rows} suffix="" decreaseLabel={`Remove a row from the ${heightSide}`} increaseLabel={`Add a row to the ${heightSide}`} onDecrease={() => setRows(rows - 1)} onIncrease={() => setRows(rows + 1)} />
        </div>
      </div>
    </div>
  );
}

export type BoardResizeSide = 'left' | 'right' | 'top' | 'bottom';
